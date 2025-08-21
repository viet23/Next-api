import { Injectable, BadRequestException } from '@nestjs/common'
import axios from 'axios'
import { CreateFacebookAdDto, AdsGoal } from './dto/facebook-ads.dto'
import qs from 'qs'
import { User } from '@models/user.entity'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { FacebookAd } from '@models/facebook-ad.entity'
import { AdInsightUpdateDTO } from './dto/ads-update.dto'
import { AdInsight } from '@models/ad-insight.entity'
import FormData from 'form-data'

type AnyDto = CreateFacebookAdDto & {
  messageDestination?: 'MESSENGER' | 'WHATSAPP' | 'INSTAGRAM_DIRECT'
  whatsappNumber?: string
  imageHash?: string
  imageUrl?: string
  linkUrl?: string
  instagramActorId?: string
}

type MediaKind = 'video' | 'photo' | 'link' | 'status' | 'unknown'

@Injectable()
export class FacebookAdsService {
  constructor(
    @InjectRepository(AdInsight) private readonly adInsightRepo: Repository<AdInsight>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(FacebookAd) private readonly facebookAdRepo: Repository<FacebookAd>,
  ) {}

  // =============== Helpers ===============
  private mapGender(g?: 'all' | 'male' | 'female'): number[] | undefined {
    if (!g || g === 'all') return undefined
    if (g === 'male') return [1]
    if (g === 'female') return [2]
    return undefined
  }

  private mapPlacements(goal: AdsGoal, opts?: { disableInstagram?: boolean }) {
    const base = {
      publisher_platforms: ['facebook', 'instagram'],
      facebook_positions: ['feed'],
      instagram_positions: ['stream', 'story'],
    }
    if (opts?.disableInstagram) {
      return {
        publisher_platforms: ['facebook'],
        facebook_positions: ['feed'],
      }
    }
    return base
  }

  private mapCampaignObjective(goal: AdsGoal): string {
    switch (goal) {
      case AdsGoal.TRAFFIC:     return 'OUTCOME_TRAFFIC'
      case AdsGoal.ENGAGEMENT:  return 'OUTCOME_ENGAGEMENT'
      case AdsGoal.LEADS:       return 'OUTCOME_LEADS'
      case AdsGoal.MESSAGE:     return 'OUTCOME_SALES' // CTM ổn nhất; fallback đã xử lý riêng
      default:                  return 'OUTCOME_AWARENESS'
    }
  }

  private mapAdsetOptimization(goal: AdsGoal) {
    switch (goal) {
      case AdsGoal.TRAFFIC:
        return { optimization_goal: 'LINK_CLICKS', billing_event: 'IMPRESSIONS', bid_strategy: 'LOWEST_COST_WITHOUT_CAP' }
      case AdsGoal.ENGAGEMENT:
        return { optimization_goal: 'PROFILE_AND_PAGE_ENGAGEMENT', billing_event: 'IMPRESSIONS', bid_strategy: 'LOWEST_COST_WITHOUT_CAP' }
      case AdsGoal.LEADS:
        return { optimization_goal: 'LEAD_GENERATION', billing_event: 'IMPRESSIONS', bid_strategy: 'LOWEST_COST_WITHOUT_CAP' }
      case AdsGoal.MESSAGE:
        return { optimization_goal: 'CONVERSATIONS', billing_event: 'IMPRESSIONS', bid_strategy: 'LOWEST_COST_WITHOUT_CAP' }
      default:
        return { optimization_goal: 'REACH', billing_event: 'IMPRESSIONS', bid_strategy: 'LOWEST_COST_WITHOUT_CAP' }
    }
  }

  private getPerfGoalSequenceForMessage(initial: string): string[] {
    const seq = [
      'CONVERSATIONS',
      'MESSAGING_PURCHASE_CONVERSION',
      'PROFILE_AND_PAGE_ENGAGEMENT',
      'PROFILE_VISIT',
      'LINK_CLICKS',
      'POST_ENGAGEMENT',
      'AUTOMATIC_OBJECTIVE',
    ]
    return Array.from(new Set([initial, ...seq].filter(Boolean)))
  }

  // ⚠️ ENGAGEMENT lọc theo loại nội dung
  private getPerfGoalSequenceForEngagement(initial: string, media: MediaKind): string[] {
    const base: string[] = [
      'PROFILE_AND_PAGE_ENGAGEMENT',
      'POST_ENGAGEMENT',
      'PAGE_LIKES',
      'EVENT_RESPONSES',
      'THRUPLAY',               // chỉ cho video
      'PROFILE_VISIT',
      'REACH',
      'IMPRESSIONS',
      'AUTOMATIC_OBJECTIVE',
    ]
    let seq = Array.from(new Set([initial, ...base]))
    if (media !== 'video') seq = seq.filter(g => g !== 'THRUPLAY') // tránh 1815159
    return seq
  }

  private getPerfGoalSequenceForTraffic(initial: string): string[] {
    const seq = [ 'LINK_CLICKS', 'LANDING_PAGE_VIEWS', 'AUTOMATIC_OBJECTIVE' ]
    return Array.from(new Set([initial, ...seq]))
  }

  private getPerfGoalSequenceForLeads(initial: string): string[] {
    const seq = [ 'LEAD_GENERATION', 'QUALITY_LEAD', 'SUBSCRIBERS', 'AUTOMATIC_OBJECTIVE' ]
    return Array.from(new Set([initial, ...seq]))
  }

  private validateIsoTime(label: string, val?: string) {
    if (!val) return
    if (isNaN(Date.parse(val))) throw new BadRequestException(`${label} không đúng định dạng ISO 8601`)
  }

  private clampRadiusMiles(v?: number) {
    if (typeof v !== 'number' || isNaN(v)) return undefined
    return Math.max(1, Math.min(50, Number(v.toFixed(2))))
  }

  // 🔎 Lấy loại nội dung postId (để chọn goal phù hợp cho Engagement)
  private async detectMediaKind(postId: string, accessTokenUser: string): Promise<MediaKind> {
    if (!postId) return 'unknown'
    try {
      const { data } = await axios.get(`https://graph.facebook.com/v19.0/${postId}`, {
        params: { fields: 'attachments{media_type},type', access_token: accessTokenUser },
      })
      const type: string | undefined = data?.type
      const att = data?.attachments?.data?.[0]
      const mediaType: string | undefined = att?.media_type
      if (mediaType) {
        const mt = mediaType.toLowerCase()
        if (mt.includes('video')) return 'video'
        if (mt.includes('photo') || mt.includes('image')) return 'photo'
        if (mt.includes('link')) return 'link'
      }
      if (typeof type === 'string') {
        const t = type.toLowerCase()
        if (t.includes('video')) return 'video'
        if (t.includes('photo') || t.includes('image')) return 'photo'
        if (t.includes('link')) return 'link'
        if (t.includes('status')) return 'status'
      }
      return 'unknown'
    } catch {
      return 'unknown'
    }
  }

  private async searchInterestsByNames(names: string[], accessToken: string): Promise<{ id: string; name: string }[]> {
    const results: { id: string; name: string }[] = []
    const uniq = Array.from(new Set((names || []).filter(Boolean).map(s => s.trim())))
    for (const q of uniq) {
      try {
        const { data } = await axios.get('https://graph.facebook.com/v19.0/search', {
          params: { type: 'adinterest', q, limit: 5, access_token: accessToken },
        })
        const top = Array.isArray(data?.data) ? data.data[0] : undefined
        if (top?.id) results.push({ id: top.id, name: top.name })
      } catch {}
    }
    return results
  }

  private async validateBehaviors(
    behaviors: Array<{ id: string; name?: string }> | undefined,
    adAccountId: string,
    accessTokenUser: string
  ): Promise<Array<{ id: string; name?: string }>> {
    if (!behaviors?.length) return []
    const okList: Array<{ id: string; name?: string }> = []
    for (const b of behaviors) {
      if (!b?.id || !/^\d+$/.test(String(b.id))) continue
      try {
        const { data } = await axios.get(
          `https://graph.facebook.com/v19.0/act_${adAccountId}/targetingsearch`,
          { params: { type: 'adTargetingCategory', class: 'behaviors', q: b.name || '', limit: 50, access_token: accessTokenUser } }
        )
        const rows: any[] = Array.isArray(data?.data) ? data.data : []
        const found = rows.find((r: any) => String(r?.id) === String(b.id))
        if (found) okList.push({ id: String(b.id), name: b.name || found.name })
      } catch {
        return []
      }
    }
    return okList
  }

  private async buildTargeting(
    dto: AnyDto,
    accessTokenUser: string,
    adAccountId: string
  ) {
    const clampedRadius = this.clampRadiusMiles(dto.radius)
    const geo_locations =
      dto.location && typeof clampedRadius === 'number'
        ? { custom_locations: [{ latitude: dto.location.lat, longitude: dto.location.lng, radius: clampedRadius, distance_unit: 'mile' }] }
        : { countries: ['VN'] }

    const disableInstagram = dto.goal === AdsGoal.ENGAGEMENT && !dto.instagramActorId
    const placements = this.mapPlacements(dto.goal, { disableInstagram })

    const targetingBase: any = {
      geo_locations,
      ...placements,
      targeting_automation: { advantage_audience: dto.aiTargeting ? 1 : 0 },
    }

    if (dto.aiTargeting) return targetingBase

    const targeting: any = { ...targetingBase }

    if (Array.isArray(dto.ageRange) && dto.ageRange.length === 2) {
      const [min, max] = dto.ageRange
      if (Number.isFinite(min)) targeting.age_min = Math.max(13, Math.floor(min))
      if (Number.isFinite(max)) targeting.age_max = Math.floor(max)
    }

    const genders = this.mapGender(dto.gender)
    if (genders) targeting.genders = genders

    const manualInterestNames: string[] = Array.isArray(dto.detailedTargeting) ? dto.detailedTargeting.filter(Boolean) : []
    const aiKeywords: string[] = Array.isArray(dto?.targetingAI?.keywordsForInterestSearch)
      ? dto.targetingAI.keywordsForInterestSearch
      : []
    const needLookup = [...new Set([...manualInterestNames, ...aiKeywords])]
    if (needLookup.length > 0) {
      const lookedUp = await this.searchInterestsByNames(needLookup, accessTokenUser)
      if (lookedUp.length) targeting.interests = lookedUp.slice(0, 10)
    }

    if (dto.goal !== AdsGoal.MESSAGE && Array.isArray(dto?.targetingAI?.behaviors) && dto.targetingAI.behaviors.length) {
      const raw = dto.targetingAI.behaviors
        .filter((b: any) => b?.id && /^\d+$/.test(String(b.id)))
        .map((b: any) => ({ id: String(b.id), name: b.name }))
        .slice(0, 10)
      const valid = await this.validateBehaviors(raw, adAccountId, accessTokenUser)
      if (valid.length) targeting.behaviors = valid
    }

    return targeting
  }

  // =============== Upload ảnh ===============
  private async uploadAdImageFromUrl(adAccountId: string, imageUrl: string, accessTokenUser: string): Promise<string> {
    const parseHash = (data: any): string | undefined => {
      try {
        const images = data?.images
        if (!images) return
        const firstKey = Object.keys(images)[0]
        return images[firstKey]?.hash
      } catch { return }
    }

    try {
      const res = await axios.post(
        `https://graph.facebook.com/v19.0/act_${adAccountId}/adimages`,
        qs.stringify({ url: imageUrl, access_token: accessTokenUser }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 },
      )
      const hash = parseHash(res.data)
      if (hash) return hash
    } catch {}

    try {
      const imgResp = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 20000,
        maxRedirects: 3,
        validateStatus: (s) => s >= 200 && s < 400,
      })

      const form = new FormData()
      form.append('access_token', accessTokenUser)
      const contentType = imgResp.headers['content-type'] || 'image/jpeg'
      const filename = `adimage.${contentType.includes('png') ? 'png' : 'jpg'}`
      form.append('source', Buffer.from(imgResp.data), { filename, contentType })

      const uploadRes = await axios.post(
        `https://graph.facebook.com/v19.0/act_${adAccountId}/adimages`,
        form,
        { headers: form.getHeaders(), timeout: 20000 }
      )
      const images = uploadRes?.data?.images
      if (!images) throw new Error('Không lấy được image_hash (multipart).')
      const firstKey = Object.keys(images)[0]
      const hash = images[firstKey]?.hash
      if (!hash) throw new Error('Không lấy được image_hash (multipart).')
      return hash
    } catch (e: any) {
      const reason = e?.response?.data?.error?.error_user_msg || e?.response?.data?.error?.message || e?.message
      throw new BadRequestException(`Upload ảnh thất bại (multipart): ${reason}`)
    }
  }

  private async ensureImageHash(dto: AnyDto, adAccountId: string, accessTokenUser: string): Promise<string> {
    if (dto.imageHash) return dto.imageHash
    if (dto.imageUrl) return await this.uploadAdImageFromUrl(adAccountId, dto.imageUrl, accessTokenUser)
    // với TRAFFIC link ad, image không bắt buộc; nhưng nếu muốn ảnh thì cần hash
    throw new BadRequestException('Thiếu ảnh cho quảng cáo: vui lòng truyền imageHash hoặc imageUrl.')
  }

  // =============== Flow chính ===============
  async createFacebookAd(dto0: CreateFacebookAdDto, user: User) {
    try {
      const dto = dto0 as AnyDto
      console.log(`📥 Input DTO:`, dto)
      console.log(`📥 Input user:`, user)

      const userData = await this.userRepo.findOne({ where: { email: user.email } })
      if (!userData) throw new BadRequestException(`Không tìm thấy thông tin người dùng với email: ${user.email}`)

      const { accessTokenUser, accountAdsId: adAccountId, idPage: pageId } = userData
      if (!accessTokenUser) throw new BadRequestException(`Người dùng chưa liên kết Facebook hoặc thiếu accessTokenUser.`)
      if (!adAccountId) throw new BadRequestException(`Người dùng chưa có accountAdsId. Vui lòng kiểm tra lại cài đặt tài khoản quảng cáo.`)
      if (!pageId && dto.goal !== AdsGoal.LEADS) throw new BadRequestException(`Người dùng chưa liên kết Fanpage (idPage).`)

      const mediaKind: MediaKind = dto.goal === AdsGoal.ENGAGEMENT && dto.postId
        ? await this.detectMediaKind(dto.postId, accessTokenUser)
        : 'unknown'
      console.log('🧩 Detected media kind:', mediaKind)

      const campaignId = await this.createCampaign(dto, accessTokenUser, adAccountId)

      const { adSetId, usedCampaignId, usedPerfGoal } =
        await this.createAdSetWithPerfGoalAndDestination(dto, campaignId, accessTokenUser, pageId, adAccountId, mediaKind)

      const creativeId = await this.createCreative(dto, accessTokenUser, adAccountId, pageId)
      const ad = await this.createAd(dto, adSetId, creativeId, accessTokenUser, adAccountId, usedCampaignId, pageId)

      await this.activateCampaign(usedCampaignId, accessTokenUser)
      await this.activateAdSet(adSetId, accessTokenUser)

      await this.facebookAdRepo.save({
        adId: ad.id,
        campaignName: dto.campaignName,
        caption: dto.caption,
        dataTargeting: dto,
        urlPost : dto.urlPost,
        objective: this.mapCampaignObjective(dto.goal),
        startTime: new Date(dto.startTime),
        endTime: new Date(dto.endTime),
        dailyBudget: dto.dailyBudget,
        status: 'ACTIVE',
        createdBy: userData,
      })

      console.log(`ℹ️ Final performance goal used: ${usedPerfGoal}`)
      return ad
    } catch (error: any) {
      const errorMessage = error?.response?.data?.error?.error_user_msg || error.message
      console.error('❌ createFacebookAd failed:', error?.response?.data || error)
      throw new BadRequestException(`Tạo quảng cáo thất bại: ${errorMessage}`)
    }
  }

  private async createCampaign(
    dto: AnyDto,
    accessTokenUser: string,
    adAccountId: string,
    overrideObjective?: string,
  ): Promise<string> {
    try {
      const objective = overrideObjective || this.mapCampaignObjective(dto.goal)
      console.log('🧭 Campaign objective =', objective)

      const res = await axios.post(
        `https://graph.facebook.com/v19.0/act_${adAccountId}/campaigns`,
        qs.stringify({
          name: dto.campaignName,
          objective,
          status: 'PAUSED',
          special_ad_categories: '["NONE"]',
          access_token: accessTokenUser,
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      )
      console.log(`✅ Campaign created: ${res.data.id}`)
      return res.data.id
    } catch (error: any) {
      const message = error?.response?.data?.error?.error_user_msg || error.message
      console.error('❌ Campaign creation error:', error?.response?.data)
      throw new BadRequestException(`Tạo chiến dịch thất bại: ${message}`)
    }
  }

  private buildPerfGoalSequence(dto: AnyDto, initial: string, mediaKind: MediaKind): string[] {
    if (dto.goal === AdsGoal.MESSAGE)    return this.getPerfGoalSequenceForMessage(initial)
    if (dto.goal === AdsGoal.ENGAGEMENT) return this.getPerfGoalSequenceForEngagement(initial, mediaKind)
    if (dto.goal === AdsGoal.TRAFFIC)    return this.getPerfGoalSequenceForTraffic(initial)
    if (dto.goal === AdsGoal.LEADS)      return this.getPerfGoalSequenceForLeads(initial)
    return [initial]
  }

  private async createAdSetWithPerfGoalAndDestination(
    dto: AnyDto,
    campaignId: string,
    accessTokenUser: string,
    pageId: string,
    adAccountId: string,
    mediaKind: MediaKind,
  ): Promise<{ adSetId: string; usedPerfGoal: string; usedCampaignId: string }> {
    this.validateIsoTime('start_time', dto.startTime)
    this.validateIsoTime('end_time', dto.endTime)

    let targetingPayload = await this.buildTargeting(dto, accessTokenUser, adAccountId)
    console.log(`targetingPayload++++++++++++`, targetingPayload)

    const initial = this.mapAdsetOptimization(dto.goal)
    const sequence = this.buildPerfGoalSequence(dto, initial.optimization_goal, mediaKind)

    const isMessage = dto.goal === AdsGoal.MESSAGE
    const isEngagement = dto.goal === AdsGoal.ENGAGEMENT
    const destination = (dto.messageDestination || 'MESSENGER') as 'MESSENGER' | 'WHATSAPP' | 'INSTAGRAM_DIRECT'

    const basePromotedObject: any = {}
    if (isMessage) {
      if (destination === 'WHATSAPP') {
        if (!dto.whatsappNumber) throw new BadRequestException('Thiếu whatsappNumber cho Click-to-WhatsApp.')
        basePromotedObject.whatsapp_number = dto.whatsappNumber
      } else {
        basePromotedObject.page_id = pageId
      }
    } else if (isEngagement) {
      basePromotedObject.page_id = pageId
      if (dto.instagramActorId) basePromotedObject.instagram_actor_id = dto.instagramActorId
    } else {
      basePromotedObject.page_id = pageId
    }

    const payloadBase: Record<string, any> = {
      name: dto.campaignName,
      campaign_id: campaignId,
      daily_budget: dto.dailyBudget,
      billing_event: initial.billing_event,
      optimization_goal: initial.optimization_goal,
      bid_strategy: initial.bid_strategy,
      start_time: dto.startTime,
      end_time: dto.endTime,
      status: 'PAUSED',
      access_token: accessTokenUser,
    }

    const makeRequest = async (tp: any, goal: string, campId: string, opts?: { noPromotedObject?: boolean }) => {
      console.log(`▶️ Trying optimization_goal='${goal}' on campaign ${campId}`)
      const body: any = { ...payloadBase, optimization_goal: goal, campaign_id: campId, targeting: JSON.stringify(tp) }
      if (isMessage) body.destination_type = destination
      if (!opts?.noPromotedObject && dto.goal !== AdsGoal.LEADS && pageId) {
        body.promoted_object = JSON.stringify(basePromotedObject)
      }
      return axios.post(
        `https://graph.facebook.com/v19.0/act_${adAccountId}/adsets`,
        qs.stringify(body),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      )
    }

    const handleCommonErrorsAndRetry = async (err: any, currentPayload: any, goal: string, campId: string) => {
      const error = err?.response?.data?.error
      const sub = error?.error_subcode
      const msg = error?.error_user_msg || error?.message || ''
      const blame = error?.error_data?.blame_field || error?.error_data?.blame_field_specs

      if (sub === 1487079 || /behaviors?.+invalid/i.test(msg)) {
        if (currentPayload.behaviors) {
          console.warn('⚠️ Behaviors invalid. Retrying WITHOUT behaviors...')
          const { behaviors, ...rest } = currentPayload
          const res2 = await makeRequest(rest, goal, campId)
          console.log(`✅ AdSet created (no behaviors): ${res2.data.id}`)
          return { id: res2.data.id }
        }
      }

      if (sub === 1487941 || /bán kính|radius/i.test(msg) || blame === 'targeting') {
        const hasCustomLoc = currentPayload?.geo_locations?.custom_locations?.length > 0
        if (hasCustomLoc) {
          currentPayload.geo_locations.custom_locations = currentPayload.geo_locations.custom_locations.map((loc: any) => ({
            ...loc,
            radius: 50,
            distance_unit: 'mile',
          }))
          console.warn('⚠️ Radius too wide. Retrying with radius=50 miles...')
          const res3 = await makeRequest(currentPayload, goal, campId)
          console.log(`✅ AdSet created (radius=50): ${res3.data.id}`)
          return { id: res3.data.id }
        }
      }

      if (sub === 1870227 || /Advantage Audience Flag Required/i.test(msg)) {
        const patched = { ...currentPayload, targeting_automation: { advantage_audience: 1 } }
        console.warn('⚠️ Advantage flag missing. Retrying with advantage_audience=1...')
        const res4 = await makeRequest(patched, goal, campId)
        console.log(`✅ AdSet created (advantage=1): ${res4.data.id}`)
        return { id: res4.data.id }
      }

      if (isEngagement && (/performance goal|mục tiêu hiệu quả|incompatible/i.test(msg)) && (blame || sub === 2490408)) {
        console.warn('⚠️ ENGAGEMENT incompatible. Retrying WITHOUT promoted_object...')
        const res5 = await makeRequest(currentPayload, goal, campId, { noPromotedObject: true })
        console.log(`✅ AdSet created (no promoted_object): ${res5.data.id}`)
        return { id: res5.data.id }
      }

      if (/performance goal|mục tiêu hiệu quả|incompatible/i.test(msg)) {
        if (currentPayload?.targeting_automation) {
          const { targeting_automation, ...rest } = currentPayload
          console.warn('⚠️ Incompatible. Retrying WITHOUT targeting_automation...')
          const res6 = await makeRequest(rest, goal, campId)
          console.log(`✅ AdSet created (no targeting_automation): ${res6.data.id}`)
          return { id: res6.data.id }
        }
      }

      if (/performance goal|mục tiêu hiệu quả|incompatible/i.test(msg)) {
        if (currentPayload?.interests?.length || currentPayload?.flexible_spec || currentPayload?.detailed_targeting) {
          const { interests, flexible_spec, detailed_targeting, ...rest } = currentPayload
          console.warn('⚠️ Incompatible. Retrying WITHOUT interests (broad)...')
          const res7 = await makeRequest(rest, goal, campId)
          console.log(`✅ AdSet created (broad, no interests): ${res7.data.id}`)
          return { id: res7.data.id }
        }
      }

      throw err
    }

    for (const goal of sequence) {
      try {
        const res = await makeRequest(targetingPayload, goal, campaignId)
        console.log(`✅ AdSet created with goal '${goal}': ${res.data.id}`)
        return { adSetId: res.data.id, usedPerfGoal: goal, usedCampaignId: campaignId }
      } catch (e: any) {
        try {
          const retryRes = await handleCommonErrorsAndRetry(e, targetingPayload, goal, campaignId)
          if (retryRes?.id) return { adSetId: retryRes.id, usedPerfGoal: goal, usedCampaignId: campaignId }
        } catch (ee: any) {
          const err = ee?.response?.data?.error
          const sub = err?.error_subcode
          const msg = err?.error_user_msg || err?.message || ''
          if (sub === 2490408 || /performance goal|mục tiêu hiệu quả|selected performance goal/i.test(msg)) {
            console.warn(`⚠️ Performance goal '${goal}' incompatible on current campaign. Trying next...`)
            continue
          }
          throw ee
        }
      }
    }

    const baseObjective = this.mapCampaignObjective(dto.goal)
    const fallbackObjectives = ['OUTCOME_ENGAGEMENT', 'OUTCOME_AWARENESS', 'OUTCOME_TRAFFIC'].filter(obj => obj !== baseObjective)

    for (const fbObj of fallbackObjectives) {
      console.warn(`⚠️ All goals failed. Creating fallback campaign with ${fbObj}...`)
      const fbCampaignId = await this.createCampaign(dto, accessTokenUser, adAccountId, fbObj)
      const fbSequence = sequence

      for (const goal of fbSequence) {
        try {
          const res = await makeRequest(targetingPayload, goal, fbCampaignId)
          console.log(`✅ AdSet created on fallback '${fbObj}' with goal '${goal}': ${res.data.id}`)
          return { adSetId: res.data.id, usedPerfGoal: goal, usedCampaignId: fbCampaignId }
        } catch (e: any) {
          try {
            const retryRes = await handleCommonErrorsAndRetry(e, targetingPayload, goal, fbCampaignId)
            if (retryRes?.id) return { adSetId: retryRes.id, usedPerfGoal: goal, usedCampaignId: fbCampaignId }
          } catch (ee: any) {
            const err = ee?.response?.data?.error
            const sub = err?.error_subcode
            const msg = err?.error_user_msg || err?.message || ''
            if (sub === 2490408 || /performance goal|mục tiêu hiệu quả|selected performance goal/i.test(msg)) {
              console.warn(`⚠️ Performance goal '${goal}' incompatible on fallback '${fbObj}'. Trying next...`)
              continue
            }
            throw ee
          }
        }
      }
    }

    throw new BadRequestException(
      `Performance goal hiện tại không tương thích với campaign objective. ` +
      `Đã thử các phương án cứu (bỏ behaviors, radius=50, Advantage flag, bỏ interests/promoted_object) ` +
      `và thử OUTCOME_ENGAGEMENT / OUTCOME_AWARENESS / OUTCOME_TRAFFIC nhưng vẫn không được.`
    )
  }

  private async createCreative(
    dto0: CreateFacebookAdDto,
    accessTokenUser: string,
    adAccountId: string,
    pageId: string,
  ): Promise<string> {
    try {
      const dto = dto0 as AnyDto

      // ✅ TRAFFIC: BẮT BUỘC LINK AD (không dùng postId để tránh 1815520)
      if (dto.goal === AdsGoal.TRAFFIC) {
        const link = (dto.urlWebsite || dto.linkUrl || '').trim()
        if (!/^https?:\/\//i.test(link) || /facebook\.com|fb\.com/i.test(link)) {
          throw new BadRequestException('urlWebsite không hợp lệ cho LINK_CLICKS. Vui lòng dùng liên kết ngoài (http/https) không phải Facebook.')
        }

        // Ảnh không bắt buộc cho link ad; nếu có imageUrl/imageHash thì thêm
        let image_hash: string | undefined
        if (dto.imageHash) image_hash = dto.imageHash
        else if (dto.imageUrl) {
          try { image_hash = await this.uploadAdImageFromUrl(adAccountId, dto.imageUrl, accessTokenUser) } catch {}
        }

        const link_data: any = {
          link,
          message: dto.caption || '',
          call_to_action: { type: 'LEARN_MORE', value: { link } },
        }
        if (image_hash) link_data.image_hash = image_hash

        const object_story_spec = { page_id: pageId, link_data }
        const res = await axios.post(
          `https://graph.facebook.com/v19.0/act_${adAccountId}/adcreatives`,
          qs.stringify({
            name: dto.campaignName,
            object_story_spec: JSON.stringify(object_story_spec),
            access_token: accessTokenUser,
          }),
          { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
        )
        console.log(`✅ Creative created (LINK AD): ${res.data.id}`)
        return res.data.id
      }

      // MESSAGE: CTM creative
      if (dto.goal === AdsGoal.MESSAGE) {
        const destination = (dto.messageDestination || 'MESSENGER') as 'MESSENGER' | 'WHATSAPP' | 'INSTAGRAM_DIRECT'
        const image_hash = await this.ensureImageHash(dto, adAccountId, accessTokenUser)

        let call_to_action: any
        if (destination === 'WHATSAPP') {
          if (!dto.whatsappNumber) throw new BadRequestException('Thiếu whatsappNumber cho Click-to-WhatsApp.')
          call_to_action = { type: 'WHATSAPP_MESSAGE', value: { app_destination: 'WHATSAPP', whatsapp_number: dto.whatsappNumber } }
        } else if (destination === 'INSTAGRAM_DIRECT') {
          call_to_action = { type: 'MESSAGE_PAGE', value: { app_destination: 'MESSENGER' } }
        } else {
          call_to_action = { type: 'MESSAGE_PAGE', value: { app_destination: 'MESSENGER' } }
        }

        const linkUrl = dto.linkUrl || dto.urlWebsite || 'https://www.facebook.com/'

        const object_story_spec = {
          page_id: pageId,
          link_data: { link: linkUrl, message: dto.caption || '', image_hash, call_to_action },
        }

        const res = await axios.post(
          `https://graph.facebook.com/v19.0/act_${adAccountId}/adcreatives`,
          qs.stringify({
            name: dto.campaignName,
            object_story_spec: JSON.stringify(object_story_spec),
            access_token: accessTokenUser,
          }),
          { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
        )
        console.log(`✅ Creative created (CTM): ${res.data.id}`)
        return res.data.id
      }

      // ENGAGEMENT/LEADS: boost post
      if (!dto.postId) throw new BadRequestException('Thiếu postId cho bài viết.')
      const res = await axios.post(
        `https://graph.facebook.com/v19.0/act_${adAccountId}/adcreatives`,
        qs.stringify({
          name: dto.campaignName,
          object_story_id: dto.postId,
          access_token: accessTokenUser,
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      )
      console.log(`✅ Creative created: ${res.data.id}`)
      return res.data.id
    } catch (error: any) {
      const message = error?.response?.data?.error?.error_user_msg || error.message
      console.error('❌ Creative creation error:', error?.response?.data || error)
      throw new BadRequestException(`Tạo Creative thất bại: ${message}`)
    }
  }

  // 🔁 Fallback khi bắt buộc pixel ở bước tạo Ad (trừ MESSAGE)
  private async createAwarenessFallbackAndAd(
    dto: AnyDto,
    accessTokenUser: string,
    adAccountId: string,
    pageId: string,
    creativeId: string
  ) {
    console.warn('⚠️ Pixel required. Falling back to OUTCOME_AWARENESS → IMPRESSIONS...')
    const fbCampaignId = await this.createCampaign(dto, accessTokenUser, adAccountId, 'OUTCOME_AWARENESS')

    const targeting = await this.buildTargeting(dto, accessTokenUser, adAccountId)

    const payload = {
      name: `${dto.campaignName} - Awareness Fallback`,
      campaign_id: fbCampaignId,
      daily_budget: dto.dailyBudget,
      billing_event: 'IMPRESSIONS',
      optimization_goal: 'IMPRESSIONS',
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      start_time: dto.startTime,
      end_time: dto.endTime,
      status: 'PAUSED',
      targeting: JSON.stringify(targeting),
      promoted_object: JSON.stringify({ page_id: pageId }),
      access_token: accessTokenUser,
    }

    const adsetRes = await axios.post(
      `https://graph.facebook.com/v19.0/act_${adAccountId}/adsets`,
      qs.stringify(payload),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    )
    const fbAdSetId = adsetRes.data.id
    console.log(`✅ Fallback AdSet created: ${fbAdSetId}`)

    const adRes = await axios.post(`https://graph.facebook.com/v19.0/act_${adAccountId}/ads`, null, {
      params: {
        name: `${dto.campaignName} - Awareness Ad`,
        adset_id: fbAdSetId,
        creative: JSON.stringify({ creative_id: creativeId }),
        status: 'PAUSED',
        access_token: accessTokenUser,
      },
    })
    console.log(`✅ Fallback Ad created: ${adRes.data.id}`)
    return { ad: adRes.data, fbCampaignId, fbAdSetId }
  }

  private async createAd(
    dto0: CreateFacebookAdDto,
    adSetId: string,
    creativeId: string,
    accessTokenUser: string,
    adAccountId: string,
    usedCampaignId?: string,
    pageId?: string,
  ) {
    const dto = dto0 as AnyDto
    try {
      const res = await axios.post(`https://graph.facebook.com/v19.0/act_${adAccountId}/ads`, null, {
        params: {
          name: dto.campaignName,
          adset_id: adSetId,
          creative: JSON.stringify({ creative_id: creativeId }),
          status: 'PAUSED',
          access_token: accessTokenUser,
        },
      })
      const adId = res.data.id
      console.log(`✅ Ad created: ${adId}`)
      await this.activateAd(adId, accessTokenUser)
      return res.data
    } catch (error: any) {
      const err = error?.response?.data?.error
      const sub = err?.error_subcode
      const msg = err?.error_user_msg || err?.message || ''

      if ((sub === 1487888 || /pixel|theo dõi|tracking/i.test(msg)) && dto.goal !== AdsGoal.MESSAGE && pageId) {
        try {
          const fallback = await this.createAwarenessFallbackAndAd(dto as AnyDto, accessTokenUser, adAccountId, pageId, creativeId)
          await this.activateCampaign(fallback.fbCampaignId, accessTokenUser)
          await this.activateAdSet(fallback.fbAdSetId, accessTokenUser)
          await this.activateAd(fallback.ad.id, accessTokenUser)
          return fallback.ad
        } catch (e: any) {
          const m = e?.response?.data?.error?.error_user_msg || e.message
          throw new BadRequestException(`Tạo quảng cáo thất bại (fallback Awareness): ${m}`)
        }
      }

      const message = err?.error_user_msg || err?.message
      console.error('❌ Ad creation error:', error?.response?.data || error)
      throw new BadRequestException(`Tạo quảng cáo thất bại: ${message}`)
    }
  }

  private async activateCampaign(campaignId: string, accessTokenUser: string) {
    await axios.post(
      `https://graph.facebook.com/v19.0/${campaignId}`,
      qs.stringify({ status: 'ACTIVE', access_token: accessTokenUser }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    )
    console.log(`🚀 Campaign ${campaignId} activated successfully.`)
  }

  private async activateAdSet(adSetId: string, accessTokenUser: string) {
    await axios.post(
      `https://graph.facebook.com/v19.0/${adSetId}`,
      qs.stringify({ status: 'ACTIVE', access_token: accessTokenUser }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    )
    console.log(`🚀 AdSet ${adSetId} activated successfully.`)
  }

  private async activateAd(adId: string, accessTokenUser: string) {
    try {
      await axios.post(
        `https://graph.facebook.com/v19.0/${adId}`,
        qs.stringify({ status: 'ACTIVE', access_token: accessTokenUser }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      )
      console.log(`🚀 Ad ${adId} activated successfully.`)
    } catch (error: any) {
      const message = error?.response?.data?.error?.error_user_msg || error.message
      console.error(`❌ Failed to activate Ad ${adId}:`, error?.response?.data || error)
      throw new BadRequestException(`Kích hoạt quảng cáo thất bại: ${message}`)
    }
  }

  async updateAdInsight(id: string, dto: AdInsightUpdateDTO) {
    try {
      const adInsight = await this.adInsightRepo
        .createQueryBuilder('adInsight')
        .where('adInsight.id=:id', { id })
        .getOne()
      adInsight.isActive = dto.isActive
      return await this.adInsightRepo.save(adInsight)
    } catch (error: any) {
      const errorMessage = error?.response?.data?.error?.error_user_msg || error.message
      console.error('❌ updateAdInsight failed:', error?.response?.data || error)
      throw new BadRequestException(`Cập nhập quảng cáo thất bại: ${errorMessage}`)
    }
  }
}
