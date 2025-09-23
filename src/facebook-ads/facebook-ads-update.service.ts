import { Injectable, BadRequestException, InternalServerErrorException, Logger } from '@nestjs/common'
import axios, { AxiosInstance } from 'axios'
import qs from 'qs'
import crypto from 'node:crypto'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { AdInsight } from '@models/ad-insight.entity'
import { User } from '@models/user.entity'
import { AiPlannerService } from './ai-planner.service'
import { AdInsightUpdateDTO } from './dto/ads-update.dto'

type TargetingSpec = Record<string, any>

const isServer = typeof window === 'undefined'
function buildAppSecretProof(token?: string) {
  const secret = process.env.FB_APP_SECRET
  if (!token || !secret) return undefined
  return crypto.createHmac('sha256', secret).update(token).digest('hex')
}
function createFbGraphClient(opts: {
  token: string
  cookie?: string
  version?: string
  timeoutMs?: number
}): AxiosInstance {
  const { token, cookie, version = 'v23.0', timeoutMs = 20_000 } = opts
  const headers: Record<string, string> = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
  }
  if (isServer && cookie) headers.Cookie = cookie
  const client = axios.create({
    baseURL: `https://graph.facebook.com/${version}`,
    timeout: timeoutMs,
    headers,
  })
  client.interceptors.request.use((config) => {
    const proof = buildAppSecretProof(token)
    if (proof) config.params = { ...(config.params || {}), appsecret_proof: proof }
    return config
  })
  return client
}

@Injectable()
export class FacebookAdsUpdateService {
  private readonly logger = new Logger(FacebookAdsUpdateService.name)

  constructor(
    @InjectRepository(AdInsight) private readonly adInsightRepo: Repository<AdInsight>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly aiPlanner: AiPlannerService,
  ) {}

  // ---------- Utils ----------
  private sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }
  private fb(token: string, cookie?: string, version = 'v23.0', timeoutMs = 20_000) {
    return createFbGraphClient({ token, cookie, version, timeoutMs })
  }

  private normalizeTargetingForCreation(t: TargetingSpec) {
    const out: TargetingSpec = { ...(t || {}) }
    const flex: any[] = Array.isArray(out.flexible_spec) ? [...out.flexible_spec] : []
    if (Array.isArray(out.interests) && out.interests.length) {
      flex.push({ interests: out.interests })
      delete out.interests
    }
    if (Array.isArray(out.behaviors) && out.behaviors.length) {
      flex.push({ behaviors: out.behaviors })
      delete out.behaviors
    }
    if (flex.length) out.flexible_spec = flex
    return out
  }
  private mergeFlex(t: TargetingSpec, chunk: { interests?: any[]; behaviors?: any[] }) {
    const flex: any[] = Array.isArray(t.flexible_spec) ? [...t.flexible_spec] : []
    const add: any = {}
    if (chunk.interests?.length) add.interests = chunk.interests
    if (chunk.behaviors?.length) add.behaviors = chunk.behaviors
    if (Object.keys(add).length) flex.push(add)
    if (flex.length) t.flexible_spec = flex
    return t
  }

  private extractPlanFromAdInsight(ad: AdInsight): any | null {
    if (ad.engagementDetails) {
      try {
        const obj = JSON.parse(ad.engagementDetails)
        if (obj && typeof obj === 'object') return obj
      } catch {}
    }
    const text = `${ad.recommendation || ''}\n${ad.htmlReport || ''}`
    const m = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/)
    if (m) {
      try {
        const obj = JSON.parse(m[0])
        if (obj && typeof obj === 'object') return obj
      } catch {}
    }
    return null
  }

  private async getAdContextByAdIdSafe(
    adId: string,
    userLookup: { userId?: string | null; email?: string | null }
  ) {
    const toData = async <T>(p: Promise<any>): Promise<T> => (await p).data as T

    const userData =
      (userLookup.userId
        ? await this.userRepo.findOne({ where: { id: userLookup.userId } })
        : null) ||
      (userLookup.email
        ? await this.userRepo.findOne({ where: { email: userLookup.email } })
        : null)

    if (!userData) throw new BadRequestException('Không tìm thấy user cho adInsight.')
    const { accessTokenUser, cookie, accountAdsId, idPage } = userData
    if (!accessTokenUser) throw new BadRequestException('Thiếu accessTokenUser.')

    // ✅ vẫn truyền cookie như create-flow
    const fb = this.fb(accessTokenUser, cookie, 'v23.0')

    const ad = await toData<any>(
      fb.get(`/${adId}`, {
        params: {
          fields: 'id,name,status,adset_id,campaign_id,creative{effective_object_story_id,object_story_spec}',
        },
      })
    )
    if (!ad?.adset_id || !ad?.campaign_id) {
      throw new BadRequestException(`Ad thiếu adset_id/campaign_id (adId=${adId}).`)
    }

    // ❌ không dùng effective_targeting (tránh lỗi #100)
    const [adset, campaign] = await Promise.all([
      toData<any>(
        fb.get(`/${ad.adset_id}`, {
          params: { fields: 'id,name,status,targeting,daily_budget,lifetime_budget,optimization_goal,billing_event' },
        })
      ),
      toData<any>(
        fb.get(`/${ad.campaign_id}`, {
          params: { fields: 'id,name,status,objective' },
        })
      ),
    ])

    return { fb, userData, ad, adset, campaign, adAccountId: accountAdsId, pageId: idPage }
  }

  private mergeTargeting(current: TargetingSpec, plan: any): TargetingSpec {
    const t: TargetingSpec = { ...(current || {}) }

    if (plan.set_auto_placements) {
      delete t.publisher_platforms
      delete t.facebook_positions
      delete t.instagram_positions
      delete t.device_platforms
    }
    if (plan.expand_audience === true) {
      ;(t as any).targeting_automation = { advantage_audience: 1 }
    }
    if (plan.age_range?.min) t.age_min = Number(plan.age_range.min)
    if (plan.age_range?.max) t.age_max = Number(plan.age_range.max)
    if (Array.isArray(plan.genders)) t.genders = plan.genders
    if (Array.isArray(plan.locales)) t.locales = plan.locales

    if (plan.geo) {
      t.geo_locations = {
        ...(t.geo_locations || {}),
        ...(plan.geo.countries ? { countries: plan.geo.countries } : {}),
        ...(plan.geo.cities ? { cities: plan.geo.cities } : {}),
        ...(plan.geo.regions ? { regions: plan.geo.regions } : {}),
        ...(plan.geo.location_types ? { location_types: plan.geo.location_types } : {}),
      }
      if (Array.isArray(plan.geo.custom_locations) && plan.geo.custom_locations.length) {
        t.geo_locations = {
          ...(t.geo_locations || {}),
          custom_locations: plan.geo.custom_locations,
        }
      }
    }

    const flexAdd: any = {}
    if (Array.isArray(plan.add_interests) && plan.add_interests.length > 0) {
      flexAdd.interests = plan.add_interests.filter((i: any) => i?.id && i?.name)
    }
    if (Array.isArray(plan.add_behaviors) && plan.add_behaviors.length > 0) {
      flexAdd.behaviors = plan.add_behaviors.filter((b: any) => b?.id)
    }
    if (Object.keys(flexAdd).length) this.mergeFlex(t, flexAdd)

    if (plan.exclusions && typeof plan.exclusions === 'object') {
      t.exclusions = { ...(t.exclusions || {}), ...plan.exclusions }
    }

    return this.normalizeTargetingForCreation(t)
  }

  private async updateAdsetTargetingAndBudget(args: {
    fb: AxiosInstance
    adsetId: string
    newTargeting: TargetingSpec
    budget?: { increase_percent?: number; set_daily_budget?: number }
  }) {
    const { fb, adsetId, newTargeting, budget } = args

    const { data: cur } = await fb.get(`/${adsetId}`, { params: { fields: 'id,status,daily_budget' } })
    const wasActive = cur?.status === 'ACTIVE'
    if (wasActive) {
      await fb.post(`/${adsetId}`, qs.stringify({ status: 'PAUSED' }), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
    }

    const payload: any = { targeting: JSON.stringify(this.normalizeTargetingForCreation(newTargeting)) }
    if (budget) {
      if (typeof budget.set_daily_budget === 'number') {
        payload.daily_budget = `${Math.round(budget.set_daily_budget)}`
      } else if (typeof budget.increase_percent === 'number' && cur?.daily_budget) {
        const old = Number(cur.daily_budget)
        const inc = Math.round(old * (1 + budget.increase_percent / 100))
        payload.daily_budget = `${inc}`
      }
    }

    await fb.post(`/${adsetId}`, qs.stringify(payload), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })

    if (wasActive) {
      await fb.post(`/${adsetId}`, qs.stringify({ status: 'ACTIVE' }), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
    }

    return payload
  }

  private async abTestNewMessageAds(args: {
    fb: AxiosInstance
    adAccountId: string
    pageId?: string | null
    adsetId: string
    oldAdId?: string
    variants: Array<{ name: string; primaryText: string; imageHash?: string }>
  }) {
    const { fb, adAccountId, pageId, adsetId, oldAdId, variants } = args
    if (oldAdId) {
      try {
        await fb.post(`/${oldAdId}`, qs.stringify({ status: 'PAUSED' }), {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        })
      } catch {}
    }

    const created: any[] = []
    for (const v of variants) {
      const creative = await fb.post(
        `/${adAccountId}/adcreatives`,
        qs.stringify({
          name: `[A/B] ${v.name}`,
          object_story_spec: JSON.stringify({
            page_id: pageId,
            link_data: { image_hash: v.imageHash, message: v.primaryText, call_to_action: { type: 'MESSAGE_PAGE' } },
          }),
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      )

      const ad = await fb.post(
        `/${adAccountId}/ads`,
        qs.stringify({
          name: v.name,
          adset_id: adsetId,
          creative: JSON.stringify({ creative_id: (creative as any).data?.id || (creative as any)?.id }),
          status: 'ACTIVE',
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      )
      created.push({ ad_id: (ad as any).data?.id || (ad as any)?.id, creative_id: (creative as any).data?.id || (creative as any)?.id, name: v.name })
    }
    return created
  }

  // ---------- PUBLIC: updateAdInsight (AN TOÀN, RIÊNG BIỆT) ----------
  async updateAdInsight(id: string, dto: AdInsightUpdateDTO) {
    try {
      this.logger.log(`STEP updateAdInsight(SAFE): id=${id} isActive=${dto.isActive}`)

      const adInsight = await this.adInsightRepo
        .createQueryBuilder('adInsight')
        .where('adInsight.id=:id', { id })
        .getOne()
      if (!adInsight) throw new BadRequestException(`Không tìm thấy AdInsight id=${id}`)

      if (typeof dto.isActive === 'boolean') adInsight.isActive = dto.isActive

      // 1) Lấy/generate "plan" (nếu thiếu → gọi GPT qua service riêng)
      let plan = this.extractPlanFromAdInsight(adInsight)
      if (!plan) {
        if (!adInsight.adId) throw new BadRequestException('AdInsight thiếu adId.')

        const ctx = await this.getAdContextByAdIdSafe(
          adInsight.adId,
          { userId: adInsight.userId || null, email: adInsight.createdByEmail || null }
        )
        const currentTargeting = ctx?.adset?.targeting || {}
        const campaignObjective = ctx?.campaign?.objective

        // dựng report tối thiểu
        let report: any
        try { if (adInsight.recommendation?.trim().startsWith('{')) report = JSON.parse(adInsight.recommendation) } catch {}
        if (!report) {
          report = {
            impressions: adInsight.impressions,
            reach: adInsight.reach,
            ctrPercent: adInsight.ctrPercent,
            cpmVnd: adInsight.cpmVnd,
            clicks: adInsight.clicks,
            spendVnd: adInsight.spendVnd,
            raw: { recommendation: adInsight.recommendation, htmlReport: adInsight.htmlReport }
          }
        }

        plan = await this.aiPlanner.suggestPlanFromReport(report, currentTargeting, campaignObjective)
        adInsight.recommendation = JSON.stringify(plan) // lưu lại để lần sau khỏi gọi GPT
      }

      const saved = await this.adInsightRepo.save(adInsight)
      this.logger.log(`STEP updateAdInsight(SAFE): plan ready`)

      // 2) Apply lên FB (không gọi effective_targeting)
      let fbApplied: any = null
      let fbError: string | null = null

      try {
        if (!adInsight.adId) throw new BadRequestException('AdInsight thiếu adId.')
        const { fb, ad, adset, adAccountId, pageId } = await this.getAdContextByAdIdSafe(
          adInsight.adId,
          { userId: adInsight.userId || null, email: adInsight.createdByEmail || null }
        )

        const newTargeting = this.mergeTargeting(adset?.targeting || {}, plan)
        const updatePayload = await this.updateAdsetTargetingAndBudget({
          fb,
          adsetId: ad.adset_id,
          newTargeting,
          budget: plan.budget,
        })

        let createdAds: any[] = []
        if (plan.ab_test?.variants?.length && adAccountId) {
          createdAds = await this.abTestNewMessageAds({
            fb,
            adAccountId,
            pageId,
            adsetId: ad.adset_id,
            oldAdId: plan.ab_test.pause_old_ad ? ad.id : undefined,
            variants: plan.ab_test.variants,
          })
        }

        fbApplied = {
          adId: ad.id,
          adsetId: ad.adset_id,
          applied: { targeting: true, budget: !!plan.budget, ab_test_created: createdAds.length },
          details: { updatePayload, createdAds, plan },
        }
      } catch (e: any) {
        fbError = e?.response?.data?.error?.error_user_msg || e?.message || String(e)
        this.logger.error('❌ applyFromAdInsight(SAFE) failed:', e?.response?.data || e)
      }

      return { ...saved, fbApplied, fbError }
    } catch (error: any) {
      const errorMessage = error?.response?.data?.error?.error_user_msg || error.message
      this.logger.error('❌ updateAdInsight(SAFE) failed:', error?.response?.data || error)
      throw new BadRequestException(`Cập nhập quảng cáo thất bại: ${errorMessage}`)
    }
  }
}
