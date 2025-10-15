import { Injectable, BadRequestException, InternalServerErrorException, Logger } from '@nestjs/common'
import axios, { AxiosInstance } from 'axios'
import { CreateFacebookAdDto, AdsGoal } from './dto/facebook-ads.dto'
import qs from 'qs'
import { User } from '@models/user.entity'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { FacebookAd } from '@models/facebook-ad.entity'
import FormData from 'form-data'
import crypto from 'node:crypto'
import { FacebookCampaign } from '@models/facebook_campaign.entity'
import moment from 'moment-timezone'
import {
  AdItem,
  AnyDto,
  campaignFields,
  GeoLocationsInput,
  ListOpts,
  MediaKind,
  TargetingSpec,
} from './types/ads.type'
import {
  getPerfGoalSequenceForEngagement,
  getPerfGoalSequenceForLeads,
  getPerfGoalSequenceForMessage,
  getPerfGoalSequenceForTraffic,
  mapAdsetOptimization,
  mapCampaignObjective,
  mapGender,
  mapPlacements,
  mergeFlex,
  normalizePlacements,
  normalizeRadiusToMiles,
  normalizeTargetingForCreation,
  validateIsoTime,
} from './facebook-helpers'

/** ===================== FB CLIENT ===================== */
function buildAppSecretProof(token?: string) {
  const secret = process.env.FB_APP_SECRET
  if (!token || !secret) return undefined
  return crypto.createHmac('sha256', secret).update(token).digest('hex')
}

function createFbGraphClient(opts: {
  token: string
  version?: string
  timeoutMs?: number
}): AxiosInstance {
  const { token, version = 'v23.0', timeoutMs = 20_000 } = opts
  const headers: Record<string, string> = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
  }
  const client = axios.create({
    baseURL: `https://graph.facebook.com/${version}`,
    timeout: timeoutMs,
    headers,
    paramsSerializer: (params) => qs.stringify(params, { arrayFormat: 'brackets' }),
  })
  client.interceptors.request.use((config) => {
    const proof = buildAppSecretProof(token)
    if (proof) config.params = { ...(config.params || {}), appsecret_proof: proof }
    return config
  })
  return client
}

/** ===================== Utils ===================== */
function toIsoNoMs(s?: string) {
  if (!s) return s
  return new Date(s).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

function getBearerFromAxios(fb: AxiosInstance): string | undefined {
  const auth = (fb.defaults.headers as any)?.Authorization || (fb.defaults.headers as any)?.authorization
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) return auth.replace('Bearer ', '')
  return undefined
}

/** ===================== Service ===================== */
@Injectable()
export class FacebookAdsInternalService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(FacebookAd) private readonly facebookAdRepo: Repository<FacebookAd>,
    @InjectRepository(FacebookCampaign) private readonly facebookCampaignRepo: Repository<FacebookCampaign>,
  ) {}

  private readonly logger = new Logger(FacebookAdsInternalService.name)

  /** Helper log lỗi Meta (Axios) */
  private logMetaAxiosError(ctx: string, err: any) {
    const r = err?.response
    const e = r?.data?.error
    this.logger.error(`❌ ${ctx} → ${r?.status ?? ''} ${r?.statusText ?? ''}`)
    if (r?.headers) {
      this.logger.error(`x-fb-trace-id: ${r.headers['x-fb-trace-id'] || ''}`)
      this.logger.error(`x-fb-rev: ${r.headers['x-fb-rev'] || ''}`)
    }
    if (e) this.logger.error('FB error object: ' + JSON.stringify(e, null, 2))
    const cfg = err?.config || {}
    const preview =
      typeof cfg.data === 'string'
        ? (cfg.data.length > 2000 ? cfg.data.slice(0, 2000) + '...[truncated]' : cfg.data)
        : undefined
    this.logger.error(
      'Request info (no token): ' +
        JSON.stringify(
          {
            url: cfg.url,
            method: cfg.method,
            params: cfg.params,
            dataPreview: preview,
          },
          null,
          2,
        ),
    )
  }

  private fb(token: string, version = 'v23.0', timeoutMs = 20_000) {
    return createFbGraphClient({ token, version, timeoutMs })
  }

  // thêm appsecret_proof vào URL phân trang (absolute)
  private withAppSecretProof(nextUrl: string, fb: AxiosInstance) {
    try {
      const token = getBearerFromAxios(fb)
      const secret = process.env.FB_APP_SECRET
      if (!token || !secret || !nextUrl) return nextUrl
      const proof = crypto.createHmac('sha256', secret).update(token).digest('hex')
      const u = new URL(nextUrl)
      if (!u.searchParams.has('appsecret_proof')) u.searchParams.set('appsecret_proof', proof)
      return u.toString()
    } catch {
      return nextUrl
    }
  }

  // chuẩn hóa geo_locations truyền thô
  private sanitizeGeoLocations(geo?: GeoLocationsInput): any | undefined {
    if (!geo) return undefined
    const out: any = {}

    // ✅ countries
    if (Array.isArray(geo.countries) && geo.countries.length) {
      out.countries = geo.countries.slice(0, 25)
    }

    // ✅ cities (Facebook chỉ cho phép key + radius, radius tính bằng mile)
    if (Array.isArray(geo.cities) && geo.cities.length) {
      out.cities = geo.cities
        .filter((c) => c?.key)
        .slice(0, 200)
        .map((c) => ({
          key: String(c.key),
          radius: Math.max(1, Math.min(50, Number(c.radius))), // mile cố định
        }))
    }

    // ✅ custom_locations (cho phép distance_unit: mile/kilometer)
    if (Array.isArray(geo.custom_locations) && geo.custom_locations.length) {
      out.custom_locations = geo.custom_locations
        .filter(
          (l) =>
            Number.isFinite(l?.latitude as any) &&
            Number.isFinite(l?.longitude as any) &&
            Number.isFinite(l?.radius as any),
        )
        .slice(0, 200)
        .map((l) => ({
          latitude: Number(l.latitude),
          longitude: Number(l.longitude),
          radius: Math.max(1, Math.min(50, Number(l.radius))),
          distance_unit: l.distance_unit === 'kilometer' ? 'kilometer' : 'mile',
        }))
    }

    if (Array.isArray(geo.regions) && geo.regions.length) out.regions = geo.regions
    if (Array.isArray(geo.location_types) && geo.location_types.length) out.location_types = geo.location_types

    return Object.keys(out).length ? out : undefined
  }

  /** ===================== Helpers (Graph utils) ===================== */
  private async detectMediaKind(postId: string, fb: AxiosInstance): Promise<MediaKind> {
    if (!postId) return 'unknown'
    try {
      this.logger.log(`STEP detectMediaKind → GET /${postId} (attachments,type)`)
      const { data } = await fb.get(`/${postId}`, { params: { fields: 'attachments{media_type},type' }, timeout: 15_000 })
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

  // dùng targetingsearch thay vì /search?type=adinterest
  private async searchInterestsByNames(
    names: string[],
    fb: AxiosInstance,
    adAccountId?: string,
  ): Promise<{ id: string; name: string }[]> {
    const results: { id: string; name: string }[] = []
    const uniq = Array.from(new Set((names || []).filter(Boolean).map((s) => s.trim())))
    const acc = adAccountId || ''
    if (!acc) return results
    for (const q of uniq) {
      try {
        this.logger.log(`STEP targetingsearch interest '${q}'`)
        const { data } = await fb.get(`/${acc}/targetingsearch`, {
          params: { q, type: 'adinterest', limit: 10, locale: 'vi_VN' },
          timeout: 15_000,
        })
        const top = Array.isArray(data?.data) ? data.data[0] : undefined
        if (top?.id) results.push({ id: String(top.id), name: top.name })
      } catch {}
    }
    return results
  }

  private async validateBehaviors(
    behaviors: Array<{ id: string; name?: string }> | undefined,
    adAccountId: string,
    fb: AxiosInstance,
  ): Promise<Array<{ id: string; name?: string }>> {
    if (!behaviors?.length) return []
    const okList: Array<{ id: string; name?: string }> = []
    for (const b of behaviors) {
      if (!b?.id || !/^\d+$/.test(String(b.id))) continue
      try {
        this.logger.log(`STEP validateBehavior ${b.id} → GET /${adAccountId}/targetingsearch`)
        const { data } = await fb.get(`/${adAccountId}/targetingsearch`, {
          params: { type: 'adTargetingCategory', class: 'behaviors', q: b.name || '', limit: 50 },
          timeout: 20_000,
        })
        const rows: any[] = Array.isArray(data?.data) ? data.data : []
        const found = rows.find((r: any) => String(r?.id) === String(b.id))
        if (found) okList.push({ id: String(b.id), name: b.name || found.name })
      } catch {
        return []
      }
    }
    return okList
  }

  private async buildTargeting(dto: AnyDto, adAccountId: string, fb: AxiosInstance) {
    // GEO
    let geo_locations: any | undefined
    if (dto.geo_locations) {
      geo_locations = this.sanitizeGeoLocations(dto.geo_locations)
    } else {
      const clampedRadius = normalizeRadiusToMiles(dto.radius, dto.radiusUnit)
      geo_locations =
        dto.location && typeof clampedRadius === 'number'
          ? {
              custom_locations: [
                {
                  latitude: dto.location.lat,
                  longitude: dto.location.lng,
                  radius: clampedRadius,
                  distance_unit: 'mile',
                },
              ],
            }
          : { countries: ['VN'] }
    }

    // PLACEMENTS
    const disableInstagram = dto.goal === AdsGoal.ENGAGEMENT && !dto.instagramActorId
    const manualPlacements = normalizePlacements(dto.placements)
    const placements = mapPlacements(dto.goal, {
      disableInstagram,
      manual: manualPlacements,
    })

    const targetingBase: TargetingSpec = {
      geo_locations,
      ...placements,
      targeting_automation: { advantage_audience: dto.aiTargeting ? 1 : 0 },
    }
    const targeting: TargetingSpec = { ...targetingBase }

    // AGE/GENDER
    if (Array.isArray(dto.ageRange) && dto.ageRange.length === 2) {
      const [min, max] = dto.ageRange
      if (Number.isFinite(min)) targeting.age_min = Math.max(13, Math.floor(min))
      if (Number.isFinite(max)) targeting.age_max = Math.floor(max)
    }
    const genders = mapGender(dto.gender as any)
    if (genders) targeting.genders = genders

    // Việt ngữ từ mẫu_targeting nếu chưa set
    const viTpl = dto?.targetingAI?.['mẫu_targeting']
    if (viTpl) {
      if (typeof viTpl['tuổi_tối_thiểu'] === 'number' && targeting.age_min == null)
        targeting.age_min = Math.max(13, Math.floor(viTpl['tuổi_tối_thiểu']))
      if (typeof viTpl['tuổi_tối_đa'] === 'number' && targeting.age_max == null)
        targeting.age_max = Math.floor(viTpl['tuổi_tối_đa'])
      if (Array.isArray(viTpl['giới_tính']) && !targeting.genders) {
        const vs = viTpl['giới_tính'].filter((n) => n === 1 || n === 2)
        if (vs.length) targeting.genders = vs
      }
      if (viTpl['vị_trí_địa_lý']?.['quốc_gia'] && !dto.geo_locations && !dto.location) {
        targeting.geo_locations = {
          countries: viTpl['vị_trí_địa_lý']['quốc_gia'],
        }
      }
    }

    // INTERESTS
    const manualInterestNames: string[] = Array.isArray(dto.detailedTargeting)
      ? dto.detailedTargeting.filter(Boolean)
      : []
    const aiKeywords: string[] = Array.isArray(dto?.targetingAI?.keywordsForInterestSearch)
      ? dto.targetingAI.keywordsForInterestSearch
      : []
    const viInterests = Array.isArray(viTpl?.['sở_thích']) ? viTpl!['sở_thích'] : []
    const viInterestNames: string[] = viInterests.map((x) => x?.['tên'] || '').filter(Boolean)

    const needLookup = [...new Set([...manualInterestNames, ...aiKeywords, ...viInterestNames])].slice(0, 30)
    if (needLookup.length > 0) {
      const lookedUp = await this.searchInterestsByNames(needLookup, fb, adAccountId)
      if (lookedUp.length) mergeFlex(targeting, { interests: lookedUp.slice(0, 10) })
    }

    // BEHAVIORS
    let rawBehaviors: Array<{ id: string; name?: string }> = []
    if (Array.isArray(dto?.targetingAI?.behaviors)) {
      rawBehaviors = rawBehaviors.concat(
        dto.targetingAI.behaviors
          .filter((b: any) => b?.id && /^\d+$/.test(String(b.id)))
          .map((b: any) => ({ id: String(b.id), name: b.name })),
      )
    }
    const viBehaviors = Array.isArray(viTpl?.['hành_vi']) ? viTpl!['hành_vi'] : []
    rawBehaviors = rawBehaviors.concat(
      viBehaviors
        .filter((b: any) => b?.['mã'] && /^\d+$/.test(String(b['mã'])))
        .map((b: any) => ({ id: String(b['mã']), name: b['tên'] })),
    )

    if (dto.goal !== AdsGoal.MESSAGE && rawBehaviors.length) {
      const unique = Array.from(new Map(rawBehaviors.map((b) => [b.id, b])).values()).slice(0, 10)
      const valid = await this.validateBehaviors(unique, adAccountId, fb)
      if (valid.length) mergeFlex(targeting, { behaviors: valid })
    }

    // --- AUDIENCE SAFETY CHECK ---
    let totalInterests =
      targeting.flexible_spec?.map((fs) => fs.interests?.length || 0).reduce((a, b) => a + b, 0) || 0

    const userFixedAge =
      typeof targeting.age_min === 'number' || typeof targeting.age_max === 'number'

    if (userFixedAge) {
      this.logger.warn('[FacebookAdsService] User fixed age range → disable Advantage Audience')
      targeting.targeting_automation = { advantage_audience: 0 }
    } else if (totalInterests === 0) {
      this.logger.warn('[FacebookAdsService] ⚠️ No interests found → enable Advantage Audience')
      targeting.targeting_automation = { advantage_audience: 1 }
    } else if (totalInterests > 0 && totalInterests < 3) {
      this.logger.warn(`[FacebookAdsService] ⚠️ Too few interests (${totalInterests}) → asking AI for fallback`)
      const fallback = await this.suggestFallbackInterests(dto, fb)
      if (fallback.length) {
        mergeFlex(targeting, { interests: fallback })
      }
    }

    // --- FINAL FILTER: remove niche interests ---
    if (targeting.flexible_spec) {
      targeting.flexible_spec = targeting.flexible_spec
        .map((fs) => {
          if (!fs.interests) return fs
          return {
            ...fs,
            interests: fs.interests.filter((i: any) => !/film|movie|show|penguin|cartoon/i.test(i.name)),
          }
        })
        .filter((fs) => fs.interests && fs.interests.length > 0)
    }

    // --- FINAL GEO CHECK ---
    if (!targeting.geo_locations || Object.keys(targeting.geo_locations).length === 0) {
      this.logger.warn(`[FacebookAdsService] ⚠️ geo_locations lost after merge → reset to VN`)
      targeting.geo_locations = { countries: ['VN'] }
    }

    // --- MIN/MAX sanity ---
    if (typeof targeting.age_min === 'number' && typeof targeting.age_max === 'number') {
      if (targeting.age_min > targeting.age_max) {
        this.logger.warn('[FacebookAdsService] Swap age_min/age_max since min>max (user typo)')
        const t = targeting.age_min
        targeting.age_min = targeting.age_max
        targeting.age_max = t
      }
    }

    return normalizeTargetingForCreation(targeting)
  }

  private async suggestFallbackInterests(dto: AnyDto, fb: AxiosInstance): Promise<Array<{ id: string; name: string }>> {
    const systemPrompt = `Bạn là chuyên gia Facebook Ads. 
  Nhiệm vụ: gợi ý các interest broad nhưng phù hợp ngành hàng để mở rộng audience. 
  Trả về JSON dạng {"interests":[{"name":"..."},{"name":"..."}]}`
    const userPrompt = `
    Tôi muốn chạy quảng cáo Facebook.
    Mục tiêu: ${dto.goal}
    Tên chiến dịch: ${dto.campaignName}
    Caption: ${dto.caption || ''}
    Sản phẩm: ${dto?.targetingAI?.['sản phẩm'] || ''}
    Hãy gợi ý 5 interest broad phổ biến nhất, dễ target, liên quan sản phẩm hoặc ngành hàng này.
  `
    try {
      const body: any = {
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 500,
        // @ts-ignore
        response_format: { type: 'json_object' },
      }
      const res = await axios.post('https://api.openai.com/v1/chat/completions', body, {
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        timeout: 30000,
      })
      const content = res.data?.choices?.[0]?.message?.content
      if (!content) return []
      const parsed = JSON.parse(content)
      const names: string[] = Array.isArray(parsed?.interests) ? parsed.interests.map((i: any) => i.name).filter(Boolean) : []
      if (!names.length) return []
      this.logger.log(`[FacebookAdsService] ✅ GPT fallback interests: ${JSON.stringify(names)}`)
      // Không có adAccountId ở đây → skip lookup nếu không có
      return []
    } catch (e: any) {
      this.logger.error(`❌ suggestFallbackInterests error: ${e.message}`)
      return []
    }
  }

  /** ===================== Upload ảnh ===================== */
  private async uploadAdImageFromUrl(adAccountId: string, imageUrl: string, fb: AxiosInstance): Promise<string> {
    const parseHash = (data: any): string | undefined => {
      try {
        const images = data?.images
        if (!images) return
        const firstKey = Object.keys(images)[0]
        return images[firstKey]?.hash
      } catch {
        return
      }
    }

    try {
      this.logger.log(`STEP uploadImage by URL → POST /${adAccountId}/adimages (url)`)
      const res = await fb.post(`/${adAccountId}/adimages`, qs.stringify({ url: imageUrl }), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 15_000,
      })
      const hash = parseHash(res.data)
      if (hash) return hash
    } catch {}

    try {
      this.logger.log(`STEP uploadImage multipart → GET ${imageUrl}`)
      const imgResp = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 20_000,
        maxRedirects: 3,
        validateStatus: (s) => s >= 200 && s < 400,
      })

      const form = new FormData()
      const contentType = imgResp.headers['content-type'] || 'image/jpeg'
      const filename = `adimage.${contentType.includes('png') ? 'png' : 'jpg'}`
      form.append('source', Buffer.from(imgResp.data), { filename, contentType })

      this.logger.log(`STEP uploadImage multipart → POST /${adAccountId}/adimages`)
      const uploadRes = await fb.post(`/${adAccountId}/adimages`, form, { headers: form.getHeaders(), timeout: 20_000 })
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

  async createFacebookAd(dto0: CreateFacebookAdDto, user: User) {
    type LocalDto = AnyDto & {
      contents?: string[]
      images?: string[]
      selectedPosts?: Array<{ id: string; caption?: string; permalink_url?: string }>
      postIds?: string[]
      imageUrl?: string
      messageDestination?: 'MESSENGER' | 'WHATSAPP' | 'INSTAGRAM_DIRECT'
      whatsappNumber?: string
      adsetBudgetSharing?: boolean // cho phép set nếu muốn
      campaignDailyBudget?: number // nếu chạy CBO
    }

    const dto = dto0 as LocalDto

    // --- Normalize goal ---
    const normalizeGoal = (g: any) => {
      const s = String(g || '').toLowerCase()
      if (['message', 'messages', 'conversations'].includes(s)) return AdsGoal.MESSAGE
      if (s === 'traffic') return AdsGoal.TRAFFIC
      if (s === 'leads' || s === 'lead') return AdsGoal.LEADS
      return AdsGoal.ENGAGEMENT
    }
    dto.goal = normalizeGoal(dto.goal)
    if (dto.goal === AdsGoal.LEADS) dto.goal = AdsGoal.ENGAGEMENT // giữ flow hiện tại

    // --- Load user & fb client ---
    const userData = await this.userRepo.findOne({ where: { email: user.email } })
    if (!userData) throw new BadRequestException(`Không tìm thấy user: ${user.email}`)
    const { internalUserAccessToken, accountAdsId: adAccountId, idPage: pageId } = userData
    if (!internalUserAccessToken) throw new BadRequestException(`Thiếu accessTokenUser – vui lòng liên kết Facebook`)
    if (!adAccountId) throw new BadRequestException(`Thiếu adAccountId`)
    if (!pageId) throw new BadRequestException(`Thiếu idPage (fanpage)`)

    // time
    const ensureIso = (label: string, val?: string) => {
      if (!val || isNaN(Date.parse(val))) throw new BadRequestException(`${label} không đúng ISO 8601`)
    }
    ensureIso('startTime', dto.startTime)
    ensureIso('endTime', dto.endTime)

    const fb = this.fb(internalUserAccessToken, 'v23.0')

    // --- 1) Create Campaign on Meta ---
    const campaignId = await this.createCampaign(dto as any, adAccountId, fb)

    // --- 2) Create AdSet (targeting+budget) ---
    const mediaKind: MediaKind =
      dto.goal === AdsGoal.ENGAGEMENT && (dto as any).postId
        ? await this.detectMediaKind((dto as any).postId!, fb)
        : 'unknown'

    const { adSetId, usedCampaignId } = await this.createAdSetWithPerfGoalAndDestination(
      dto as any,
      campaignId,
      pageId!,
      adAccountId,
      mediaKind,
      fb,
    )

    const metaCampaignId = usedCampaignId || campaignId
    const objective = mapCampaignObjective(dto.goal)

    // --- 3) UPSERT Campaign vào DB ---
    let campaignEntity = await this.facebookCampaignRepo.findOne({ where: { campaignId: metaCampaignId } })
    if (!campaignEntity) {
      campaignEntity = this.facebookCampaignRepo.create({
        campaignId: metaCampaignId,
        name: dto.campaignName,
        objective,
        status: 'ACTIVE',
        dailyBudget: dto.dailyBudget,
        startTime: new Date(dto.startTime),
        endTime: new Date(dto.endTime),
        createdBy: userData,
      })
    } else {
      campaignEntity.name = dto.campaignName
      campaignEntity.objective = objective
      campaignEntity.dailyBudget = dto.dailyBudget
      campaignEntity.startTime = new Date(dto.startTime)
      campaignEntity.endTime = new Date(dto.endTime)
    }
    await this.facebookCampaignRepo.save(campaignEntity)

    // --- 4) Creative builders ---
    const createCreativeForMessage = async (imageUrl: string, message: string) => {
      const imgHash = await this.uploadAdImageFromUrl(adAccountId, imageUrl, fb)
      let destination = (dto.messageDestination || 'MESSENGER') as 'MESSENGER' | 'WHATSAPP' | 'INSTAGRAM_DIRECT'

      if (destination === 'INSTAGRAM_DIRECT' && !dto.instagramActorId) {
        this.logger.warn('No instagram_actor_id → fallback destination MESSENGER')
        destination = 'MESSENGER'
      }

      let call_to_action: any
      if (destination === 'WHATSAPP') {
        if (!dto.whatsappNumber) throw new BadRequestException('Thiếu whatsappNumber cho Click-to-WhatsApp')
        call_to_action = {
          type: 'WHATSAPP_MESSAGE',
          value: { app_destination: 'WHATSAPP', whatsapp_number: dto.whatsappNumber },
        }
      } else if (destination === 'INSTAGRAM_DIRECT') {
        call_to_action = { type: 'INSTAGRAM_MESSAGE', value: { app_destination: 'INSTAGRAM' } }
      } else {
        call_to_action = { type: 'MESSAGE_PAGE', value: { app_destination: 'MESSENGER' } }
      }

      const linkUrl = dto.urlWebsite || 'https://www.alloneads.com/'
      const object_story_spec = {
        page_id: pageId,
        link_data: { link: linkUrl, message: message || '', image_hash: imgHash, call_to_action },
      }

      const res = await fb.post(
        `/${adAccountId}/adcreatives`,
        qs.stringify({ name: dto.campaignName, object_story_spec: JSON.stringify(object_story_spec) }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      )
      return res.data.id as string
    }

    const createCreativeForTraffic = async (imageUrl: string, message: string) => {
      const link = (dto.urlWebsite || '').trim()
      if (!/^https?:\/\//i.test(link) || /facebook\.com|fb\.com/i.test(link)) {
        throw new BadRequestException('urlWebsite không hợp lệ cho LINK_CLICKS (phải là link ngoài Facebook).')
      }
      const imgHash = await this.uploadAdImageFromUrl(adAccountId, imageUrl, fb)
      const link_data: any = {
        link,
        message: message || '',
        image_hash: imgHash,
        call_to_action: { type: 'LEARN_MORE', value: { link } },
      }
      const object_story_spec = { page_id: pageId, link_data }

      const res = await fb.post(
        `/${adAccountId}/adcreatives`,
        qs.stringify({ name: dto.campaignName, object_story_spec: JSON.stringify(object_story_spec) }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      )
      return res.data.id as string
    }

    const createCreativeForEngagement = async (postId: string) => {
      const res = await fb.post(
        `/${adAccountId}/adcreatives`,
        qs.stringify({ name: dto.campaignName, object_story_id: postId }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      )
      return res.data.id as string
    }

    // --- 5) Xây items ---
    const items: AdItem[] = []

    if (dto.goal === AdsGoal.ENGAGEMENT) {
      const pool =
        dto.selectedPosts && dto.selectedPosts.length
          ? dto.selectedPosts.map((p) => ({ postId: p.id, caption: p.caption || '', urlPost: p.permalink_url }))
          : (dto.postIds || []).map((id) => ({ postId: id, caption: '', urlPost: undefined }))
      if (!pool.length) throw new BadRequestException(`ENGAGEMENT cần 'selectedPosts[]' hoặc 'postIds[]'`)
      for (const p of pool) items.push({ kind: 'ENGAGEMENT', postId: p.postId, caption: p.caption, urlPost: p.urlPost })
    } else if (dto.goal === AdsGoal.MESSAGE) {
      const poolFromSelected =
        Array.isArray(dto.selectedPosts) && dto.selectedPosts.length
          ? dto.selectedPosts.map((p) => ({ postId: p.id, caption: p.caption || '', urlPost: p.permalink_url }))
          : []

      const poolFromIds =
        Array.isArray(dto.postIds) && dto.postIds.length
          ? dto.postIds.map((id) => ({ postId: id, caption: '', urlPost: undefined }))
          : []

      const pool = poolFromSelected.length ? poolFromSelected : poolFromIds

      if (pool.length) {
        for (const p of pool)
          items.push({ kind: 'MESSAGE', postId: p.postId, message: p.caption || dto.caption || '', urlPost: p.urlPost })
      } else {
        const images = Array.isArray(dto.images) ? dto.images : []
        const contents = Array.isArray(dto.contents) ? dto.contents : []
        const n = Math.min(images.length, Math.max(contents.length, images.length))
        if (n > 0) {
          for (let i = 0; i < n; i++) {
            const img = images[i] ?? images[0]
            const msg = (contents[i] ?? contents[0] ?? dto.caption ?? '').toString()
            if (!img) continue
            items.push({ kind: 'MESSAGE', imageUrl: img, message: msg })
          }
        } else {
          if (!dto.imageUrl) throw new BadRequestException(`Thiếu 'images[]' (hoặc 'imageUrl') cho MESSAGE`)
          items.push({ kind: 'MESSAGE', imageUrl: dto.imageUrl, message: dto.caption || '' })
        }
      }
    } else if (dto.goal === AdsGoal.TRAFFIC) {
      const images = Array.isArray(dto.images) ? dto.images : []
      const contents = Array.isArray(dto.contents) ? dto.contents : []
      const n = Math.min(images.length, Math.max(contents.length, images.length))
      if (n > 0) {
        for (let i = 0; i < n; i++) {
          const img = images[i] ?? images[0]
          const msg = (contents[i] ?? contents[0] ?? dto.caption ?? '').toString()
          if (!img) continue
          items.push({ kind: 'TRAFFIC', imageUrl: img, message: msg })
        }
      } else {
        if (!dto.imageUrl) throw new BadRequestException(`Thiếu 'images[]' (hoặc 'imageUrl') cho TRAFFIC`)
        items.push({ kind: 'TRAFFIC', imageUrl: dto.imageUrl, message: dto.caption || '' })
      }
    }

    if (!items.length) throw new BadRequestException('Không tìm thấy item nào để tạo quảng cáo.')

    // --- 6) Tạo creatives & ads ---
    const ads: any[] = []

    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      const rawContent = it.kind === 'ENGAGEMENT' ? it.caption || dto.caption || '' : it.message || dto.caption || ''
      const clean = rawContent.toString().trim().replace(/\s+/g, ' ')
      const snippet = clean ? clean.slice(0, 50) : ''
      const now = moment().tz('Asia/Ho_Chi_Minh').format('YYYY-MM-DD HH:mm')
      const adName = snippet ? `Ad ${now} - ${snippet}` : `Ad ${now}`

      let creativeId: string
      if (it.kind === 'ENGAGEMENT') {
        creativeId = await createCreativeForEngagement(it.postId!)
      } else if (it.kind === 'MESSAGE') {
        if (it.postId) {
          creativeId = await createCreativeForEngagement(it.postId)
        } else if (it.imageUrl) {
          creativeId = await createCreativeForMessage(it.imageUrl!, it.message || '')
        } else {
          throw new BadRequestException('Invalid MESSAGE item: missing postId or imageUrl')
        }
      } else {
        // TRAFFIC
        creativeId = await createCreativeForTraffic(it.imageUrl!, it.message || '')
      }

      const adRes = await this.createAd(
        { ...dto, campaignName: adName } as any,
        adSetId,
        creativeId,
        adAccountId,
        metaCampaignId,
        pageId,
        fb,
      )

      adRes.__caption = (it as any).message || (it as any).caption || dto.caption || ''
      adRes.__urlPost = (it as any).urlPost || dto.urlPost || ''
      adRes.__campaignName = adName
      ads.push(adRes)
    }

    // --- 7) Activate campaign + adset ---
    await this.activateCampaign(metaCampaignId, fb)
    await this.activateAdSet(adSetId, fb)

    // --- 8) Save Ads (FK campaign) ---
    for (const ad of ads) {
      await this.facebookAdRepo.save({
        adId: ad.id,
        campaignName: ad.__campaignName,
        caption: ad.__caption,
        dataTargeting: dto,
        urlPost: ad.__urlPost,
        objective,
        startTime: new Date(dto.startTime),
        endTime: new Date(dto.endTime),
        dailyBudget: dto.dailyBudget,
        status: 'ACTIVE',
        createdBy: userData,
        campaign: campaignEntity,
      })
    }

    return ads
  }

  private async createCampaign(
    dto: AnyDto & { adsetBudgetSharing?: boolean; campaignDailyBudget?: number },
    adAccountId: string,
    fb: AxiosInstance,
    overrideObjective?: string,
  ): Promise<string> {
    try {
      const objective = overrideObjective || mapCampaignObjective(dto.goal)
      const usingCBO = Number.isFinite(dto.campaignDailyBudget) && Number(dto.campaignDailyBudget) > 0

      this.logger.log(`STEP createCampaign → POST /${adAccountId}/campaigns objective=${objective}`)
      const payload: any = {
        name: dto.campaignName,
        objective,
        status: 'PAUSED',
        special_ad_categories: '["NONE"]',
      }

      if (usingCBO) {
        payload.daily_budget = Math.max(100, Math.trunc(Number(dto.campaignDailyBudget)))
      } else {
        // ABO → BẮT BUỘC trường này để tránh lỗi 4834011
        const isSharing = !!dto.adsetBudgetSharing // bạn có thể cho false mặc định
        payload.is_adset_budget_sharing_enabled = String(isSharing) // 'true' | 'false'
      }

      const res = await fb.post(
        `/${adAccountId}/campaigns`,
        qs.stringify(payload),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      )
      this.logger.log(`✅ Campaign created: ${res.data.id}`)
      return res.data.id
    } catch (error: any) {
      this.logMetaAxiosError('POST /campaigns', error)
      const message = error?.response?.data?.error?.error_user_msg || error.message
      this.logger.error('❌ Campaign creation error:', error?.response?.data)
      throw new BadRequestException(`Tạo chiến dịch thất bại: ${message}`)
    }
  }

  private buildPerfGoalSequence(dto: AnyDto, initial: string, mediaKind: MediaKind): string[] {
    if (dto.goal === AdsGoal.MESSAGE) return getPerfGoalSequenceForMessage(initial)
    if (dto.goal === AdsGoal.ENGAGEMENT) return getPerfGoalSequenceForEngagement(initial, mediaKind)
    if (dto.goal === AdsGoal.TRAFFIC) return getPerfGoalSequenceForTraffic(initial)
    if (dto.goal === AdsGoal.LEADS) return getPerfGoalSequenceForLeads(initial)
    return [initial]
  }

  private async createAdSetWithPerfGoalAndDestination(
    dto: AnyDto & { messageDestination?: 'MESSENGER' | 'WHATSAPP' | 'INSTAGRAM_DIRECT'; whatsappNumber?: string },
    campaignId: string,
    pageId: string,
    adAccountId: string,
    mediaKind: MediaKind,
    fb: AxiosInstance,
  ): Promise<{ adSetId: string; usedPerfGoal: string; usedCampaignId: string }> {
    validateIsoTime('start_time', dto.startTime)
    validateIsoTime('end_time', dto.endTime)

    this.logger.log(`STEP createAdSet: build targeting`)
    let targetingPayload = await this.buildTargeting(dto, adAccountId, fb)
    targetingPayload = normalizeTargetingForCreation(targetingPayload)
    this.logger.log(`STEP createAdSet: targeting built: ${JSON.stringify(targetingPayload)}`)

    const initial = mapAdsetOptimization(dto.goal)
    const sequence = this.buildPerfGoalSequence(dto, initial.optimization_goal, mediaKind)

    const isMessage = dto.goal === AdsGoal.MESSAGE
    const isEngagement = dto.goal === AdsGoal.ENGAGEMENT
    const isLeads = dto.goal === AdsGoal.LEADS
    let destination = (dto.messageDestination || 'MESSENGER') as 'MESSENGER' | 'WHATSAPP' | 'INSTAGRAM_DIRECT'

    if (destination === 'INSTAGRAM_DIRECT' && !dto.instagramActorId) {
      this.logger.warn('No instagram_actor_id for adset destination → fallback to MESSENGER')
      destination = 'MESSENGER'
    }

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
    } else if (isLeads) {
      basePromotedObject.page_id = pageId
    } else {
      basePromotedObject.page_id = pageId
    }

    const payloadBase: Record<string, any> = {
      name: dto.campaignName,
      campaign_id: campaignId,
      daily_budget: Math.max(100, Math.trunc(Number(dto.dailyBudget || 0))),
      billing_event: initial.billing_event,
      optimization_goal: initial.optimization_goal,
      bid_strategy: initial.bid_strategy,
      start_time: toIsoNoMs(dto.startTime),
      end_time: toIsoNoMs(dto.endTime),
      status: 'PAUSED',
    }

    const makeRequest = async (tp: any, goal: string, campId: string) => {
      this.logger.log(`STEP createAdSet → POST /${adAccountId}/adsets goal=${goal} camp=${campId}`)
      const body: any = { ...payloadBase, optimization_goal: goal, campaign_id: campId, targeting: JSON.stringify(tp) }
      if (isMessage) body.destination_type = destination
      if (pageId) body.promoted_object = JSON.stringify(basePromotedObject)

      try {
        return await fb.post(`/${adAccountId}/adsets`, qs.stringify(body), {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        })
      } catch (err: any) {
        this.logMetaAxiosError('POST /adsets', err)
        throw err
      }
    }

    const handleCommonErrorsAndRetry = async (err: any, currentPayload: any, goal: string, campId: string) => {
      const error = err?.response?.data?.error
      const sub = error?.error_subcode
      const msg = error?.error_user_msg || error?.message || ''
      const blame = error?.error_data?.blame_field || error?.error_data?.blame_field_specs

      // behaviors invalid → bỏ behaviors, GIỮ interests
      if (sub === 1487079 || /behaviors?.+invalid/i.test(msg)) {
        if (currentPayload?.flexible_spec) {
          const flex = (currentPayload.flexible_spec as any[])
            .map((fs) => {
              if (fs.behaviors) {
                const { behaviors, ...rest } = fs
                return rest
              }
              return fs
            })
            .filter((fs) => Object.keys(fs).length)
          const patched = { ...currentPayload, flexible_spec: flex }
          this.logger.warn('⚠️ Behaviors invalid → retry WITHOUT behaviors (keep interests)')
          const res2 = await makeRequest(patched, goal, campId)
          this.logger.log(`✅ AdSet created (no behaviors): ${res2.data.id}`)
          return { id: res2.data.id }
        }
      }

      // radius lỗi → set radius=50mi
      if (sub === 1487941 || /bán kính|radius/i.test(msg) || blame === 'targeting') {
        const hasCustomLoc = currentPayload?.geo_locations?.custom_locations?.length > 0
        if (hasCustomLoc) {
          currentPayload.geo_locations.custom_locations = currentPayload.geo_locations.custom_locations.map(
            (loc: any) => ({ ...loc, radius: 50, distance_unit: 'mile' }),
          )
          this.logger.warn('⚠️ Radius issue → retry radius=50')
          const res3 = await makeRequest(currentPayload, goal, campId)
          this.logger.log(`✅ AdSet created (radius=50): ${res3.data.id}`)
          return { id: res3.data.id }
        }
      }

      // Advantage flag thiếu
      if (sub === 1870227 || /Advantage Audience Flag Required/i.test(msg)) {
        const userFixedAge = typeof currentPayload.age_min === 'number' || typeof currentPayload.age_max === 'number'
        if (userFixedAge) {
          this.logger.warn('⚠️ Advantage flag required but user fixed age → retry with advantage_audience=0')
          const patched = { ...currentPayload, targeting_automation: { advantage_audience: 0 } }
          const res = await makeRequest(patched, goal, campId)
          this.logger.log(`✅ AdSet created (Advantage OFF): ${res.data.id}`)
          return { id: res.data.id }
        } else {
          const patched = { ...currentPayload, targeting_automation: { advantage_audience: 1 } }
          this.logger.warn('⚠️ Advantage flag missing → retry with advantage_audience=1')
          const res4 = await makeRequest(patched, goal, campId)
          this.logger.log(`✅ AdSet created (advantage=1): ${res4.data.id}`)
          return { id: res4.data.id }
        }
      }

      // 1870189: Age cap dưới ngưỡng khi Advantage ON → tắt Advantage
      if (sub === 1870189 || /tuổi tối đa/i.test(msg) || /age max/i.test(msg)) {
        this.logger.warn('⚠️ Age cap under limit (1870189) → disable Advantage Audience and retry')
        const patched = { ...currentPayload, targeting_automation: { advantage_audience: 0 } }
        const res = await makeRequest(patched, goal, campId)
        this.logger.log(`✅ AdSet created (Advantage OFF, keep user age): ${res.data.id}`)
        return { id: res.data.id }
      }

      // Incompatible goal: nới dần
      if (/performance goal|mục tiêu hiệu quả|incompatible/i.test(msg)) {
        let patched = { ...currentPayload }

        if (patched?.flexible_spec?.some((fs: any) => fs.behaviors)) {
          const flex = patched.flexible_spec
            .map((fs: any) => {
              if (fs.behaviors) {
                const { behaviors, ...rest } = fs
                return rest
              }
              return fs
            })
            .filter((fs: any) => Object.keys(fs).length)
          patched = { ...patched, flexible_spec: flex }
          this.logger.warn('⚠️ Incompatible → retry WITHOUT behaviors (keep interests)')
          try {
            const resB1 = await makeRequest(patched, goal, campId)
            this.logger.log(`✅ AdSet created (no behaviors): ${resB1.data.id}`)
            return { id: resB1.data.id }
          } catch {}
        }

        const hasInterests = patched?.flexible_spec?.some(
          (fs: any) => Array.isArray(fs.interests) && fs.interests.length,
        )
        if (hasInterests) {
          const flex = patched.flexible_spec.map((fs: any) => {
            if (Array.isArray(fs.interests)) return { interests: fs.interests.slice(0, 5) }
            return fs
          })
          const patched2 = { ...patched, flexible_spec: flex }
          this.logger.warn('⚠️ Incompatible → retry with TOP-5 interests only')
          try {
            const resB2 = await makeRequest(patched2, goal, campId)
            this.logger.log(`✅ AdSet created (top-5 interests): ${resB2.data.id}`)
            return { id: resB2.data.id }
          } catch {}
        }

        if (patched?.flexible_spec) {
          const { flexible_spec, ...rest } = patched
          this.logger.warn('⚠️ Incompatible → retry BROAD (no flexible_spec)')
          const resB3 = await makeRequest(rest, goal, campId)
          this.logger.log(`✅ AdSet created (broad): ${resB3.data.id}`)
          return { id: resB3.data.id }
        }
      }

      throw err
    }

    for (const goal of sequence) {
      try {
        const res = await makeRequest(targetingPayload, goal, campaignId)
        this.logger.log(`✅ AdSet created with goal '${goal}': ${res.data.id}`)
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
            this.logger.warn(`⚠️ goal '${goal}' incompatible on current campaign → try next`)
            continue
          }
          throw ee
        }
      }
    }

    const baseObjective = mapCampaignObjective(dto.goal)
    const fallbackObjectives = ['OUTCOME_ENGAGEMENT', 'OUTCOME_AWARENESS', 'OUTCOME_TRAFFIC'].filter(
      (obj) => obj !== baseObjective,
    )

    for (const fbObj of fallbackObjectives) {
      this.logger.warn(`⚠️ All goals failed → create fallback campaign ${fbObj}`)
      const fbCampaignId = await this.createCampaign(dto as any, adAccountId, fb, fbObj)
      const fbSequence = sequence

      for (const goal of fbSequence) {
        try {
          const res = await makeRequest(targetingPayload, goal, fbCampaignId)
          this.logger.log(`✅ AdSet created on fallback '${fbObj}' with goal '${goal}': ${res.data.id}`)
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
              this.logger.warn(`⚠️ goal '${goal}' incompatible on fallback '${fbObj}' → try next`)
              continue
            }
            throw ee
          }
        }
      }
    }

    throw new BadRequestException(
      `Performance goal hiện tại không tương thích với campaign objective (đã thử các phương án cứu & fallback objectives).`,
    )
  }

  /** ===================== Fallback Awareness (pixel) ===================== */
  private async createAwarenessFallbackAndAd(
    dto: AnyDto,
    adAccountId: string,
    pageId: string,
    creativeId: string,
    fb: AxiosInstance,
  ) {
    this.logger.warn('⚠️ Pixel required → fallback OUTCOME_AWARENESS / IMPRESSIONS')
    const fbCampaignId = await this.createCampaign(dto as any, adAccountId, fb, 'OUTCOME_AWARENESS')

    const targeting = await this.buildTargeting(dto, adAccountId, fb)
    const payload = {
      name: `${dto.campaignName} - Awareness Fallback`,
      campaign_id: fbCampaignId,
      daily_budget: Math.max(100, Math.trunc(Number((dto as any).dailyBudget || 0))),
      billing_event: 'IMPRESSIONS',
      optimization_goal: 'IMPRESSIONS',
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      start_time: toIsoNoMs(dto.startTime),
      end_time: toIsoNoMs(dto.endTime),
      status: 'PAUSED',
      targeting: JSON.stringify(normalizeTargetingForCreation(targeting)),
      promoted_object: JSON.stringify({ page_id: pageId }),
    }

    this.logger.log(`STEP fallback → POST /${adAccountId}/adsets`)
    const adsetRes = await fb.post(`/${adAccountId}/adsets`, qs.stringify(payload), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
    const fbAdSetId = adsetRes.data.id
    this.logger.log(`✅ Fallback AdSet created: ${fbAdSetId}`)

    this.logger.log(`STEP fallback → POST /${adAccountId}/ads`)
    const adRes = await fb.post(`/${adAccountId}/ads`, null, {
      params: {
        name: `${dto.campaignName} - Awareness Ad`,
        adset_id: fbAdSetId,
        creative: JSON.stringify({ creative_id: creativeId }),
        status: 'PAUSED',
      },
    })
    this.logger.log(`✅ Fallback Ad created: ${adRes.data.id}`)
    return { ad: adRes.data, fbCampaignId, fbAdSetId }
  }

  /** ===================== Ad ===================== */
  private async createAd(
    dto0: CreateFacebookAdDto,
    adSetId: string,
    creativeId: string,
    adAccountId: string,
    usedCampaignId?: string,
    pageId?: string,
    fb?: AxiosInstance,
  ) {
    const dto = dto0 as AnyDto
    if (!fb) throw new InternalServerErrorException('FB client missing')
    try {
      this.logger.log(`STEP createAd → POST /${adAccountId}/ads`)
      const res = await fb.post(`/${adAccountId}/ads`, null, {
        params: {
          name: dto.campaignName,
          adset_id: adSetId,
          creative: JSON.stringify({ creative_id: creativeId }),
          status: 'PAUSED',
        },
      })
      const adId = res.data.id
      this.logger.log(`✅ Ad created: ${adId}`)
      await this.activateAd(adId, fb)
      return res.data
    } catch (error: any) {
      this.logMetaAxiosError('POST /ads', error)
      const err = error?.response?.data?.error
      const sub = err?.error_subcode
      const msg = err?.error_user_msg || err?.message || ''

      if ((sub === 1487888 || /pixel|theo dõi|tracking/i.test(msg)) && dto.goal !== AdsGoal.MESSAGE && pageId) {
        try {
          const fallback = await this.createAwarenessFallbackAndAd(dto as AnyDto, adAccountId, pageId, creativeId, fb!)
          await this.activateCampaign(fallback.fbCampaignId, fb!)
          await this.activateAdSet(fallback.fbAdSetId, fb!)
          await this.activateAd(fallback.ad.id, fb!)
          return fallback.ad
        } catch (e: any) {
          const m = e?.response?.data?.error?.error_user_msg || e.message
          throw new BadRequestException(`Tạo quảng cáo thất bại (fallback Awareness): ${m}`)
        }
      }

      const message = err?.error_user_msg || err?.message
      this.logger.error('❌ Ad creation error:', error?.response?.data || error)
      throw new BadRequestException(`Tạo quảng cáo thất bại: ${message}`)
    }
  }

  private async activateCampaign(campaignId: string, fb: AxiosInstance) {
    this.logger.log(`STEP activateCampaign → POST /${campaignId}`)
    await fb.post(`/${campaignId}`, qs.stringify({ status: 'ACTIVE' }), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
    this.logger.log(`🚀 Campaign ${campaignId} activated.`)
  }

  private async activateAdSet(adSetId: string, fb: AxiosInstance) {
    this.logger.log(`STEP activateAdSet → POST /${adSetId}`)
    await fb.post(`/${adSetId}`, qs.stringify({ status: 'ACTIVE' }), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
    this.logger.log(`🚀 AdSet ${adSetId} activated.`)
  }

  private async activateAd(adId: string, fb: AxiosInstance) {
    try {
      this.logger.log(`STEP activateAd → POST /${adId}`)
      await fb.post(`/${adId}`, qs.stringify({ status: 'ACTIVE' }), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
      this.logger.log(`🚀 Ad ${adId} activated.`)
    } catch (error: any) {
      this.logMetaAxiosError('POST /{adId} status=ACTIVE', error)
      const message = error?.response?.data?.error?.error_user_msg || error.message
      this.logger.error(`❌ Failed to activate Ad ${adId}:`, error?.response?.data || error)
      throw new BadRequestException(`Kích hoạt quảng cáo thất bại: ${message}`)
    }
  }

  /** ===================== Insights & listing ===================== */
  private uniq<T>(arr: T[]): T[] {
    return Array.from(new Set(arr))
  }
  private sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms))
  }

  private async fetchCampaignInsights(args: {
    apiVersion: string
    adAccountId: string
    fb: AxiosInstance
    datePreset: string
  }) {
    const { adAccountId, fb, datePreset } = args
    const base = `/${adAccountId}/insights`
    const params = new URLSearchParams({
      level: 'campaign',
      fields: campaignFields.join(','),
      date_preset: datePreset,
      time_increment: '1',
      limit: '500',
    })

    let url: string | null = `${fb.defaults.baseURL?.replace(/\/$/, '')}${base}?${params.toString()}`
    const rows: any[] = []
    while (url) {
      const safeUrl = this.withAppSecretProof(url, fb)
      this.logger.log(`STEP insights paginate → GET ${safeUrl.substring(0, 80)}...`)
      const { data } = await fb.get(safeUrl)
      rows.push(...(data?.data ?? []))
      url = data?.paging?.next ?? null
      if (url) await this.sleep(150)
    }
    return rows
  }

  private async fetchAdsetTargetingBatch(args: { apiVersion: string; fb: AxiosInstance; adsetIds: string[] }) {
    const { fb, adsetIds } = args
    const out: Record<string, { effective?: any; raw?: any }> = {}
    const ids = [...adsetIds]
    const CONCURRENCY = 4

    const worker = async () => {
      while (ids.length) {
        const id = ids.shift()!
        try {
          this.logger.log(`STEP fetchAdsetTargeting → GET /${id}?fields=id,name,effective_targeting,targeting`)
          const { data } = await fb.get(`/${id}`, {
            params: { fields: 'id,name,effective_targeting,targeting' },
            timeout: 30_000,
          })
          out[id] = { effective: data?.effective_targeting ?? null, raw: data?.targeting ?? null }
        } catch (e: any) {
          this.logger.error(`fetchAdsetTargetingBatch error ${id}: ${JSON.stringify(e?.response?.data || e)}`)
          out[id] = { effective: null, raw: null }
        }
        await this.sleep(120)
      }
    }

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, adsetIds.length) }, worker))
    return out
  }

  async listAds(opts: ListOpts = {}, config: any) {
    const { apiVersion: vEnv, adAccountId, accessTokenUser } = config
    const apiVersion = opts.apiVersion || vEnv
    const fb = this.fb(accessTokenUser, apiVersion)

    const fields = (
      opts.fields && opts.fields.length
        ? opts.fields
        : ['id', 'name', 'adset_id', 'campaign_id', 'status', 'effective_status', 'created_time', 'updated_time']
    ).join(',')

    const effective_status = JSON.stringify(
      opts.effective_status && opts.effective_status.length ? opts.effective_status : ['ACTIVE', 'PAUSED', 'ARCHIVED'],
    )

    const limit = Math.max(1, opts.limit ?? 200)
    const rankBy = opts.rankBy ?? 'roas'
    const datePreset = opts.datePreset ?? 'last_7d'

    const baseUrl = `/${adAccountId}/ads`
    const baseParams = { fields, limit, effective_status }

    const all: any[] = []
    let nextUrl: string | null = baseUrl
    let nextParams: Record<string, any> = { ...baseParams }

    try {
      while (nextUrl) {
        this.logger.log(`STEP listAds paginate → GET ${nextUrl} with params?=${Object.keys(nextParams).length > 0}`)
        const { data } = await fb.get(nextUrl, { params: nextParams, timeout: 30_000 })
        if (Array.isArray(data?.data)) all.push(...data.data)
        const nxt = data?.paging?.next
        if (nxt) {
          nextUrl = this.withAppSecretProof(nxt, fb)
          nextParams = {}
        } else {
          nextUrl = null
        }
      }

      if (!all.length) {
        this.logger.log(`STEP listAds: no ads found`)
        return { count: 0, items: [], top3Campaigns: [] }
      }

      const campaignIds = this.uniq(all.map((a) => a.campaign_id).filter(Boolean))
      if (!campaignIds.length) {
        this.logger.log(`STEP listAds: no campaign ids`)
        return { count: all.length, items: all, top3Campaigns: [] }
      }

      this.logger.log(`STEP listAds: fetch campaign insights datePreset=${datePreset}`)
      const insightsAll = await this.fetchCampaignInsights({ apiVersion, adAccountId, fb, datePreset })
      const rows = insightsAll.filter((r: any) => campaignIds.includes(r.campaign_id))

      const byCamp = new Map<string, any[]>()
      for (const r of rows) {
        const arr = byCamp.get(r.campaign_id) || []
        arr.push(r)
        byCamp.set(r.campaign_id, arr)
      }

      const scored: Array<{
        campaign_id: string
        campaign_name: string
        metric: number
        meta: { avg_roas?: number | null; cpl?: number | null; ctr?: number | null; spend?: number }
      }> = []

      for (const [campId, arr] of byCamp) {
        const name = arr.find((x: any) => x.campaign_name)?.campaign_name || campId

        let spend = 0
        let clicks = 0
        let impressions = 0
        let leads = 0
        const roasVals: number[] = []
        const ctrVals: number[] = []

        for (const r of arr) {
          const s = Number(r.spend ?? '0')
          if (!Number.isNaN(s)) spend += s
          const c = Number(r.clicks ?? '0')
          if (!Number.isNaN(c)) clicks += c
          const imp = Number(r.impressions ?? '0')
          if (!Number.isNaN(imp)) impressions += imp

          const leadRow = (r.actions ?? []).find((a: any) => a.action_type === 'lead')
          if (leadRow) {
            const v = Number(leadRow.value)
            if (!Number.isNaN(v)) leads += v
          }

          const proas = (r.purchase_roas ?? []).find((p: any) => p.action_type === 'purchase')
          if (proas && proas.value != null && !Number.isNaN(Number(proas.value))) roasVals.push(Number(proas.value))
          if (r.ctr != null && !Number.isNaN(Number(r.ctr))) ctrVals.push(Number(r.ctr))
        }

        const avgROAS = roasVals.length ? roasVals.reduce((a, b) => a + b, 0) / roasVals.length : null
        const avgCTR = ctrVals.length ? ctrVals.reduce((a, b) => a + b, 0) / ctrVals.length : null
        const cpl = leads > 0 ? spend / leads : null

        let metric: number | null = null
        if (rankBy === 'roas') metric = avgROAS ?? avgCTR ?? 0
        else if (rankBy === 'cpl') metric = cpl != null ? -cpl : avgCTR != null ? avgCTR : 0
        else if (rankBy === 'ctr') metric = avgCTR ?? 0

        scored.push({
          campaign_id: campId,
          campaign_name: name,
          metric: metric ?? 0,
          meta: { avg_roas: avgROAS, cpl, ctr: avgCTR, spend },
        })
      }

      const top3 = scored.sort((a, b) => b.metric - a.metric).slice(0, 3)
      if (!top3.length) {
        this.logger.log(`STEP listAds: no top3 (empty scored)`)
        return { count: all.length, items: top3, top3Campaigns: [] }
      }

      const topCampIds = new Set(top3.map((x) => x.campaign_id))
      const adsetsOfTop = this.uniq(
        all
          .filter((a) => topCampIds.has(a.campaign_id))
          .map((a) => a.adset_id)
          .filter(Boolean),
      )

      this.logger.log(`STEP listAds: fetch adset targeting for ${adsetsOfTop.length} adsets`)
      const adsetTargeting = await this.fetchAdsetTargetingBatch({ apiVersion, fb, adsetIds: adsetsOfTop })

      const summarizeTargeting = (items: Array<{ targeting: any }>) => {
        const countries = new Set<string>()
        const cities: Array<{ key: string; name?: string }> = []
        const customLocs: Array<{ lat: number; lng: number; radius: number; unit: string }> = []
        const age = { min: Infinity, max: -Infinity }
        const genders = new Set<number>()
        const interestMap = new Map<string, string>()

        const collect = (tg: any) => {
          if (!tg) return
          const geo = tg.geo_locations || {}
          ;(geo.countries || []).forEach((c: string) => countries.add(c))
          ;(geo.cities || []).forEach((c: any) => cities.push({ key: String(c.key ?? c.name ?? ''), name: c.name }))

          if (Array.isArray(geo.custom_locations)) {
            for (const loc of geo.custom_locations) {
              const lat = Number(loc.latitude)
              const lng = Number(loc.longitude)
              const radius = Number(loc.radius)
              const unit = String(loc.distance_unit || 'mile')
              if (!Number.isNaN(lat) && !Number.isNaN(lng) && !Number.isNaN(radius)) {
                customLocs.push({ lat, lng, radius, unit })
              }
            }
          }

          if (typeof tg.age_min === 'number') age.min = Math.min(age.min, tg.age_min)
          if (typeof tg.age_max === 'number') age.max = Math.max(age.max, tg.age_max)
          ;(tg.genders || []).forEach((g: number) => genders.add(g))

          if (Array.isArray(tg.interests)) {
            tg.interests.forEach((i: any) => {
              const id = String(i?.id ?? '')
              if (id) interestMap.set(id, i.name || id)
            })
          }
          if (Array.isArray(tg.flexible_spec)) {
            for (const fs of tg.flexible_spec) {
              if (Array.isArray(fs?.interests)) {
                fs.interests.forEach((i: any) => {
                  const id = String(i?.id ?? '')
                  if (id) interestMap.set(id, i.name || id)
                })
              }
            }
          }
        }

        for (const it of items) {
          const tgt = (it as any).targeting
          collect(tgt?.effective || tgt?.raw || tgt)
        }

        return {
          countries: Array.from(countries),
          cities: cities.slice(0, 10),
          custom_locations: customLocs.slice(0, 10),
          age_min: age.min === Infinity ? null : age.min,
          age_max: age.max === -Infinity ? null : age.max,
          genders: Array.from(genders),
          interests: Array.from(interestMap)
            .slice(0, 15)
            .map(([id, name]) => ({ id, name })),
        }
      }

      const adsetsByCamp: Record<string, Array<{ adset_id: string; targeting: any }>> = {}
      for (const a of all) {
        if (!topCampIds.has(a.campaign_id)) continue
        const t = adsetTargeting[a.adset_id]
        if (!t) continue
        if (!adsetsByCamp[a.campaign_id]) adsetsByCamp[a.campaign_id] = []
        if (!adsetsByCamp[a.campaign_id].some((x) => x.adset_id === a.adset_id)) {
          adsetsByCamp[a.campaign_id].push({ adset_id: a.adset_id, targeting: t })
        }
      }

      const top3Campaigns = top3.map((x) => {
        const adsets = adsetsByCamp[x.campaign_id] || []
        const summary = summarizeTargeting(adsets)

        let locationText = 'Không giới hạn'
        if (summary.custom_locations?.length) {
          locationText = summary.custom_locations
            .slice(0, 3)
            .map((l) => `${l.lat.toFixed(4)},${l.lng.toFixed(4)} (${l.radius} ${l.unit})`)
            .join(' • ')
        } else if (summary.cities?.length) {
          locationText = summary.cities
            .slice(0, 3)
            .map((c) => c.name || c.key)
            .join(' • ')
        } else if (summary.countries?.length) {
          locationText = summary.countries.slice(0, 5).join(', ')
        }

        return {
          campaign_id: x.campaign_id,
          campaign_name: x.campaign_name,
          metric_used: rankBy,
          metric_value: x.metric,
          performance: x.meta,
          targeting_summary: {
            ...summary,
            location_text: locationText,
          },
          adsets,
        }
      })

      this.logger.log(`STEP listAds DONE: total=${all.length} top3=${top3.length}`)
      return { count: all.length, items: all, top3Campaigns }
    } catch (err: any) {
      const apiErr = err?.response?.data || err
      this.logger.error(`listAds error: ${JSON.stringify(apiErr)}`)
      throw new InternalServerErrorException(apiErr)
    }
  }
}
