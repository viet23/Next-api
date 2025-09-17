import { Injectable, BadRequestException, InternalServerErrorException, Logger } from '@nestjs/common' 
import axios, { AxiosInstance } from 'axios'
import { CreateFacebookAdDto, AdsGoal } from './dto/facebook-ads.dto'
import qs from 'qs'
import { User } from '@models/user.entity'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { FacebookAd } from '@models/facebook-ad.entity'
import { AdInsightUpdateDTO } from './dto/ads-update.dto'
import FormData from 'form-data'
import crypto from 'node:crypto'
import { AdInsight } from '@models/ad-insight.entity'

type AnyDto = CreateFacebookAdDto & {
  messageDestination?: 'MESSENGER' | 'WHATSAPP' | 'INSTAGRAM_DIRECT'
  whatsappNumber?: string
  imageHash?: string
  imageUrl?: string
  linkUrl?: string
  instagramActorId?: string
  /** dùng cho Lead Ads */
  leadgenFormId?: string
}

type ListOpts = {
  fields?: string[];
  effective_status?: string[];
  limit?: number;
  apiVersion?: string;
  rankBy?: 'roas' | 'cpl' | 'ctr';
  datePreset?: string; // 'last_7d', 'last_30d', 'today'
};

type MediaKind = 'video' | 'photo' | 'link' | 'status' | 'unknown'

// ================= FB CLIENT =================
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
    if (proof) {
      config.params = { ...(config.params || {}), appsecret_proof: proof }
    }
    return config
  })
  return client
}
// ============================================

@Injectable()
export class FacebookAdsService {
  constructor(
    @InjectRepository(AdInsight) private readonly adInsightRepo: Repository<AdInsight>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(FacebookAd) private readonly facebookAdRepo: Repository<FacebookAd>,
  ) { }

  private readonly logger = new Logger(FacebookAdsService.name);

  private fb(token: string, cookie?: string, version = 'v23.0', timeoutMs = 20_000) {
    return createFbGraphClient({ token, cookie, version, timeoutMs })
  }

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
      case AdsGoal.TRAFFIC: return 'OUTCOME_TRAFFIC'
      case AdsGoal.ENGAGEMENT: return 'OUTCOME_ENGAGEMENT'
      case AdsGoal.LEADS: return 'OUTCOME_LEADS'
      case AdsGoal.MESSAGE: return 'OUTCOME_SALES'
      default: return 'OUTCOME_AWARENESS'
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
  private getPerfGoalSequenceForEngagement(initial: string, media: MediaKind): string[] {
    const base: string[] = [
      'PROFILE_AND_PAGE_ENGAGEMENT',
      'POST_ENGAGEMENT',
      'PAGE_LIKES',
      'EVENT_RESPONSES',
      'THRUPLAY',
      'PROFILE_VISIT',
      'REACH',
      'IMPRESSIONS',
      'AUTOMATIC_OBJECTIVE',
    ]
    let seq = Array.from(new Set([initial, ...base]))
    if (media !== 'video') seq = seq.filter(g => g !== 'THRUPLAY')
    return seq
  }
  private getPerfGoalSequenceForTraffic(initial: string): string[] {
    const seq = ['LINK_CLICKS', 'LANDING_PAGE_VIEWS', 'AUTOMATIC_OBJECTIVE']
    return Array.from(new Set([initial, ...seq]))
  }
  private getPerfGoalSequenceForLeads(initial: string): string[] {
    const seq = ['LEAD_GENERATION', 'QUALITY_LEAD', 'SUBSCRIBERS', 'AUTOMATIC_OBJECTIVE']
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

  private async detectMediaKind(postId: string, fb: AxiosInstance): Promise<MediaKind> {
    if (!postId) return 'unknown'
    try {
      this.logger.log(`STEP detectMediaKind → GET /${postId} (attachments,type)`)
      const { data } = await fb.get(`/${postId}`, {
        params: { fields: 'attachments{media_type},type' },
        timeout: 15_000,
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

  private async searchInterestsByNames(names: string[], fb: AxiosInstance): Promise<{ id: string; name: string }[]> {
    const results: { id: string; name: string }[] = []
    const uniq = Array.from(new Set((names || []).filter(Boolean).map(s => s.trim())))
    for (const q of uniq) {
      try {
        this.logger.log(`STEP searchInterest '${q}' → GET /search?type=adinterest`)
        const { data } = await fb.get('/search', {
          params: { type: 'adinterest', q, limit: 5 },
          timeout: 15_000,
        })
        const top = Array.isArray(data?.data) ? data.data[0] : undefined
        if (top?.id) results.push({ id: top.id, name: top.name })
      } catch { }
    }
    return results
  }

  private async validateBehaviors(
    behaviors: Array<{ id: string; name?: string }> | undefined,
    adAccountId: string,
    fb: AxiosInstance
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

  private async buildTargeting(
    dto: AnyDto,
    adAccountId: string,
    fb: AxiosInstance
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
      const lookedUp = await this.searchInterestsByNames(needLookup, fb)
      if (lookedUp.length) targeting.interests = lookedUp.slice(0, 10)
    }

    if (dto.goal !== AdsGoal.MESSAGE && Array.isArray(dto?.targetingAI?.behaviors) && dto.targetingAI.behaviors.length) {
      const raw = dto.targetingAI.behaviors
        .filter((b: any) => b?.id && /^\d+$/.test(String(b.id)))
        .map((b: any) => ({ id: String(b.id), name: b.name }))
        .slice(0, 10)
      const valid = await this.validateBehaviors(raw, adAccountId, fb)
      if (valid.length) targeting.behaviors = valid
    }

    return targeting
  }

  // =============== Upload ảnh ===============
  private async uploadAdImageFromUrl(adAccountId: string, imageUrl: string, fb: AxiosInstance): Promise<string> {
    const parseHash = (data: any): string | undefined => {
      try {
        const images = data?.images
        if (!images) return
        const firstKey = Object.keys(images)[0]
        return images[firstKey]?.hash
      } catch { return }
    }

    try {
      this.logger.log(`STEP uploadImage by URL → POST /${adAccountId}/adimages (url)`)
      const res = await fb.post(
        `/${adAccountId}/adimages`,
        qs.stringify({ url: imageUrl }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15_000 },
      )
      const hash = parseHash(res.data)
      if (hash) return hash
    } catch { }

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
      const uploadRes = await fb.post(
        `/${adAccountId}/adimages`,
        form,
        { headers: form.getHeaders(), timeout: 20_000 }
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

  private async ensureImageHash(dto: AnyDto, adAccountId: string, fb: AxiosInstance): Promise<string> {
    if (dto.imageHash) return dto.imageHash
    if (dto.imageUrl) return await this.uploadAdImageFromUrl(adAccountId, dto.imageUrl, fb)
    throw new BadRequestException('Thiếu ảnh cho quảng cáo: vui lòng truyền imageHash hoặc imageUrl.')
  }

  // ====== Lead Form helpers (auto-pick/create) ======
  private async pickLatestPublishedLeadFormId(pageId: string, fb: AxiosInstance): Promise<string | null> {
    try {
      const { data } = await fb.get(`/${pageId}/leadgen_forms`, {
        params: { fields: 'id,name,status,created_time', limit: 50 },
      })
      const rows: Array<{ id: string; status?: string; created_time?: string }> = data?.data ?? []
      if (!rows.length) return null
      const published = rows.filter(r => (r.status || '').toUpperCase() === 'PUBLISHED')
      const sorted = (published.length ? published : rows).sort(
        (a, b) => new Date(b.created_time || 0).getTime() - new Date(a.created_time || 0).getTime()
      )
      return sorted[0]?.id || null
    } catch (e) {
      this.logger.warn(`pickLatestPublishedLeadFormId error: ${JSON.stringify((e as any)?.response?.data || e)}`)
      return null
    }
  }

  /** Tạo 1 Instant Form mặc định (Họ tên + SĐT, vi_VN) */
  // Thay nguyên hàm cũ bằng hàm này
private async createBasicLeadForm(pageId: string, fb: AxiosInstance, name = 'Form cơ bản - Họ tên + SĐT') {
  const questions = [
    { type: 'FULL_NAME' },
    { type: 'PHONE' },
  ];

  // button_type phải thuộc {VIEW_WEBSITE, CALL_BUSINESS, MESSAGE_BUSINESS, DOWNLOAD,
  // SCHEDULE_APPOINTMENT, VIEW_ON_FACEBOOK, PROMO_CODE, NONE, WHATSAPP, P2B_MESSENGER}
  const thank_you_page = {
    title: 'Cảm ơn bạn!',
    body: 'Chúng tôi sẽ liên hệ trong thời gian sớm nhất.',
    button_type: 'NONE', // <-- dùng 'NONE' thay vì 'NO_BUTTON'
  };

  const body = qs.stringify({
    name,
    privacy_policy_url: 'https://www.freeprivacypolicy.com/live/e61a4cad-b80f-451e-a877-c3e31e929689', // TODO: đổi sang URL policy thật
    questions: JSON.stringify(questions),
    locale: 'vi_VN',
    thank_you_page: JSON.stringify(thank_you_page),
  });

  this.logger.log(`POST /${pageId}/leadgen_forms → tạo form mặc định`);
  const { data } = await fb.post(`/${pageId}/leadgen_forms`, body, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  return data?.id as string;
}


  /** Lấy form id: ưu tiên form PUBLISHED mới nhất; nếu không có thì tạo mới */
  private async ensureLeadFormId(pageId: string, fb: AxiosInstance, campaignName?: string) {
    const picked = await this.pickLatestPublishedLeadFormId(pageId, fb)
    if (picked) return picked
    const created = await this.createBasicLeadForm(pageId, fb, `Form - ${campaignName || 'Lead'}`)
    return created
  }

  // =============== Flow chính ===============
  async createFacebookAd(dto0: CreateFacebookAdDto, user: User) {
    try {
      console.log(`dto0`, dto0);
      
      const dto = dto0 as AnyDto
      this.logger.log(`STEP 0: Input DTO & user loaded`)
      const userData = await this.userRepo.findOne({ where: { email: user.email } })
      if (!userData) throw new BadRequestException(`Không tìm thấy thông tin người dùng với email: ${user.email}`)

      const { accessTokenUser, accountAdsId: adAccountId, idPage: pageId, cookie: rawCookie } = userData
      if (!accessTokenUser) throw new BadRequestException(`Người dùng chưa liên kết Facebook hoặc thiếu accessTokenUser.`)
      if (!adAccountId) throw new BadRequestException(`Người dùng chưa có accountAdsId. Vui lòng kiểm tra lại.`)
      if (!pageId && dto.goal !== AdsGoal.LEADS) throw new BadRequestException(`Người dùng chưa liên kết Fanpage (idPage).`)

      const fb = this.fb(accessTokenUser, rawCookie, 'v23.0')

      this.logger.log(`STEP 1: Detect media kind (if needed)`)
      const mediaKind: MediaKind = dto.goal === AdsGoal.ENGAGEMENT && dto.postId
        ? await this.detectMediaKind(dto.postId, fb)
        : 'unknown'
      this.logger.log(`STEP 1 DONE: mediaKind=${mediaKind}`)

      this.logger.log(`STEP 2: Create Campaign`)
      const campaignId = await this.createCampaign(dto, adAccountId, fb)
      this.logger.log(`STEP 2 DONE: campaignId=${campaignId}`)

      this.logger.log(`STEP 3: Create AdSet with perf goal & destination`)
      const { adSetId, usedCampaignId, usedPerfGoal } =
        await this.createAdSetWithPerfGoalAndDestination(dto, campaignId, pageId, adAccountId, mediaKind, fb)
      this.logger.log(`STEP 3 DONE: adSetId=${adSetId} usedCampaignId=${usedCampaignId} perf=${usedPerfGoal}`)

      this.logger.log(`STEP 4: Create Creative`)
      const creativeId = await this.createCreative(dto, adAccountId, pageId, fb)
      this.logger.log(`STEP 4 DONE: creativeId=${creativeId}`)

      this.logger.log(`STEP 5: Create Ad`)
      const ad = await this.createAd(dto, adSetId, creativeId, adAccountId, usedCampaignId, pageId, fb)
      this.logger.log(`STEP 5 DONE: adId=${ad.id}`)

      this.logger.log(`STEP 6: Activate Campaign & AdSet`)
      await this.activateCampaign(usedCampaignId, fb)
      await this.activateAdSet(adSetId, fb)
      this.logger.log(`STEP 6 DONE`)

      this.logger.log(`STEP 7: Save DB record`)
      await this.facebookAdRepo.save({
        adId: ad.id,
        campaignName: dto.campaignName,
        caption: dto.caption,
        dataTargeting: dto,
        urlPost: dto.urlPost,
        objective: this.mapCampaignObjective(dto.goal),
        startTime: new Date(dto.startTime),
        endTime: new Date(dto.endTime),
        dailyBudget: dto.dailyBudget,
        status: 'ACTIVE',
        createdBy: userData,
      })
      this.logger.log(`STEP 7 DONE: DB saved`)

      this.logger.log(`STEP 8: Completed. Final perf goal: ${usedPerfGoal}`)
      return ad
    } catch (error: any) {
      const errorMessage = error?.response?.data?.error?.error_user_msg || error.message
      this.logger.error('❌ createFacebookAd failed:', error?.response?.data || error)
      throw new BadRequestException(`Tạo quảng cáo thất bại: ${errorMessage}`)
    }
  }

  private async createCampaign(
    dto: AnyDto,
    adAccountId: string,
    fb: AxiosInstance,
    overrideObjective?: string,
  ): Promise<string> {
    try {
      const objective = overrideObjective || this.mapCampaignObjective(dto.goal)
      this.logger.log(`STEP createCampaign → POST /${adAccountId}/campaigns objective=${objective}`)
      const res = await fb.post(
        `/${adAccountId}/campaigns`,
        qs.stringify({
          name: dto.campaignName,
          objective,
          status: 'PAUSED',
          special_ad_categories: '["NONE"]',
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      )
      this.logger.log(`✅ Campaign created: ${res.data.id}`)
      return res.data.id
    } catch (error: any) {
      const message = error?.response?.data?.error?.error_user_msg || error.message
      this.logger.error('❌ Campaign creation error:', error?.response?.data)
      throw new BadRequestException(`Tạo chiến dịch thất bại: ${message}`)
    }
  }

  private buildPerfGoalSequence(dto: AnyDto, initial: string, mediaKind: MediaKind): string[] {
    if (dto.goal === AdsGoal.MESSAGE) return this.getPerfGoalSequenceForMessage(initial)
    if (dto.goal === AdsGoal.ENGAGEMENT) return this.getPerfGoalSequenceForEngagement(initial, mediaKind)
    if (dto.goal === AdsGoal.TRAFFIC) return this.getPerfGoalSequenceForTraffic(initial)
    if (dto.goal === AdsGoal.LEADS) return this.getPerfGoalSequenceForLeads(initial)
    return [initial]
  }

  private async createAdSetWithPerfGoalAndDestination(
    dto: AnyDto,
    campaignId: string,
    pageId: string,
    adAccountId: string,
    mediaKind: MediaKind,
    fb: AxiosInstance,
  ): Promise<{ adSetId: string; usedPerfGoal: string; usedCampaignId: string }> {
    this.validateIsoTime('start_time', dto.startTime)
    this.validateIsoTime('end_time', dto.endTime)

    this.logger.log(`STEP createAdSet: build targeting`)
    let targetingPayload = await this.buildTargeting(dto, adAccountId, fb)
    this.logger.log(`STEP createAdSet: targeting built: ${JSON.stringify(targetingPayload)}`)

    const initial = this.mapAdsetOptimization(dto.goal)
    const sequence = this.buildPerfGoalSequence(dto, initial.optimization_goal, mediaKind)

    const isMessage = dto.goal === AdsGoal.MESSAGE
    const isEngagement = dto.goal === AdsGoal.ENGAGEMENT
    const isLeads = dto.goal === AdsGoal.LEADS
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
    } else if (isLeads) {
      basePromotedObject.page_id = pageId
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
    }

    // Luôn gửi promoted_object khi có pageId (đặc biệt ENGAGEMENT/LEADS)
    const makeRequest = (tp: any, goal: string, campId: string) => {
      this.logger.log(`STEP createAdSet → POST /${adAccountId}/adsets goal=${goal} camp=${campId}`)
      const body: any = { ...payloadBase, optimization_goal: goal, campaign_id: campId, targeting: JSON.stringify(tp) }
      if (isMessage) body.destination_type = destination
      if (pageId) {
        body.promoted_object = JSON.stringify(basePromotedObject)
      }
      return fb.post(
        `/${adAccountId}/adsets`,
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
          this.logger.warn('⚠️ Behaviors invalid → retry WITHOUT behaviors')
          const { behaviors, ...rest } = currentPayload
          const res2 = await makeRequest(rest, goal, campId)
          this.logger.log(`✅ AdSet created (no behaviors): ${res2.data.id}`)
          return { id: res2.data.id }
        }
      }

      if (sub === 1487941 || /bán kính|radius/i.test(msg) || blame === 'targeting') {
        const hasCustomLoc = currentPayload?.geo_locations?.custom_locations?.length > 0
        if (hasCustomLoc) {
          currentPayload.geo_locations.custom_locations = currentPayload.geo_locations.custom_locations.map((loc: any) => ({
            ...loc, radius: 50, distance_unit: 'mile',
          }))
          this.logger.warn('⚠️ Radius issue → retry radius=50')
          const res3 = await makeRequest(currentPayload, goal, campId)
          this.logger.log(`✅ AdSet created (radius=50): ${res3.data.id}`)
          return { id: res3.data.id }
        }
      }

      if (sub === 1870227 || /Advantage Audience Flag Required/i.test(msg)) {
        const patched = { ...currentPayload, targeting_automation: { advantage_audience: 1 } }
        this.logger.warn('⚠️ Advantage flag missing → retry with advantage_audience=1')
        const res4 = await makeRequest(patched, goal, campId)
        this.logger.log(`✅ AdSet created (advantage=1): ${res4.data.id}`)
        return { id: res4.data.id }
      }

      // ⚠️ ENGAGEMENT: KHÔNG bỏ promoted_object. Cứu bằng cách nới targeting/placements.
      if (isEngagement && (/performance goal|mục tiêu hiệu quả|incompatible/i.test(msg))) {
        if (currentPayload?.targeting_automation) {
          const { targeting_automation, ...rest } = currentPayload
          this.logger.warn('⚠️ ENGAGEMENT incompatible → retry WITHOUT targeting_automation')
          const resA = await makeRequest(rest, goal, campId)
          this.logger.log(`✅ AdSet created (no targeting_automation): ${resA.data.id}`)
          return { id: resA.data.id }
        }
        if (currentPayload?.interests?.length || currentPayload?.flexible_spec || currentPayload?.detailed_targeting) {
          const { interests, flexible_spec, detailed_targeting, ...rest } = currentPayload
          this.logger.warn('⚠️ ENGAGEMENT incompatible → retry WITHOUT detailed targeting (broad)')
          const resB = await makeRequest(rest, goal, campId)
          this.logger.log(`✅ AdSet created (broad, kept promoted_object): ${resB.data.id}`)
          return { id: resB.data.id }
        }
        if (Array.isArray(currentPayload.publisher_platforms) && currentPayload.publisher_platforms.includes('instagram')) {
          const rest = {
            ...currentPayload,
            publisher_platforms: ['facebook'],
            facebook_positions: ['feed'],
          }
          delete (rest as any).instagram_positions
          this.logger.warn('⚠️ ENGAGEMENT incompatible → retry with Facebook-only placements')
          const resC = await makeRequest(rest, goal, campId)
          this.logger.log(`✅ AdSet created (FB-only, kept promoted_object): ${resC.data.id}`)
          return { id: resC.data.id }
        }
      }

      if (/performance goal|mục tiêu hiệu quả|incompatible/i.test(msg)) {
        if (currentPayload?.targeting_automation) {
          const { targeting_automation, ...rest } = currentPayload
          this.logger.warn('⚠️ Incompatible → retry WITHOUT targeting_automation')
          const res6 = await makeRequest(rest, goal, campId)
          this.logger.log(`✅ AdSet created (no targeting_automation): ${res6.data.id}`)
          return { id: res6.data.id }
        }
        if (currentPayload?.interests?.length || currentPayload?.flexible_spec || currentPayload?.detailed_targeting) {
          const { interests, flexible_spec, detailed_targeting, ...rest } = currentPayload
          this.logger.warn('⚠️ Incompatible → retry WITHOUT interests (broad)')
          const res7 = await makeRequest(rest, goal, campId)
          this.logger.log(`✅ AdSet created (broad): ${res7.data.id}`)
          return { id: res7.data.id }
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

    const baseObjective = this.mapCampaignObjective(dto.goal)
    const fallbackObjectives = ['OUTCOME_ENGAGEMENT', 'OUTCOME_AWARENESS', 'OUTCOME_TRAFFIC'].filter(obj => obj !== baseObjective)

    for (const fbObj of fallbackObjectives) {
      this.logger.warn(`⚠️ All goals failed → create fallback campaign ${fbObj}`)
      const fbCampaignId = await this.createCampaign(dto, adAccountId, fb, fbObj)
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
      `Performance goal hiện tại không tương thích với campaign objective (đã thử các phương án cứu & fallback objectives).`
    )
  }

  private async createCreative(
    dto0: CreateFacebookAdDto,
    adAccountId: string,
    pageId: string,
    fb: AxiosInstance,
  ): Promise<string> {
    try {
      const dto = dto0 as AnyDto

      // LEADS
      if (dto.goal === AdsGoal.LEADS) {
        // 1) Lấy/ tạo form nếu thiếu
        let formId = dto.leadgenFormId
        if (!formId) {
          formId = await this.ensureLeadFormId(pageId, fb, dto.campaignName)
          if (!formId) {
            throw new BadRequestException('Thiếu leadgenFormId và không thể tạo/tìm Instant Form nào trên Page.')
          }
          this.logger.log(`Using leadgenFormId=${formId}`)
        }

        // 2) Ảnh (tuỳ chọn)
        let image_hash: string | undefined
        if (dto.imageHash) image_hash = dto.imageHash
        else if (dto.imageUrl) {
          try { image_hash = await this.uploadAdImageFromUrl(adAccountId, dto.imageUrl, fb) } catch { }
        }

        // 3) CTA gắn form
        const call_to_action: any = {
          type: 'LEARN_MORE',
          value: { lead_gen_form_id: formId },
        }

        // 4) link_data vẫn cần (Meta sẽ dùng form)
        const link_data: any = {
          link: 'https://www.facebook.com/', // placeholder
          message: dto.caption || '',
          call_to_action,
        }
        if (image_hash) link_data.image_hash = image_hash

        const object_story_spec = { page_id: pageId, link_data }
        this.logger.log(`STEP createCreative LEADS → POST /${adAccountId}/adcreatives`)
        const res = await fb.post(
          `/${adAccountId}/adcreatives`,
          qs.stringify({ name: dto.campaignName, object_story_spec: JSON.stringify(object_story_spec) }),
          { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
        )
        this.logger.log(`✅ Creative created (LEADS): ${res.data.id}`)
        return res.data.id
      }

      if (dto.goal === AdsGoal.TRAFFIC) {
        const link = (dto.urlWebsite || dto.linkUrl || '').trim()
        if (!/^https?:\/\//i.test(link) || /facebook\.com|fb\.com/i.test(link)) {
          throw new BadRequestException('urlWebsite không hợp lệ cho LINK_CLICKS. Vui lòng dùng liên kết ngoài.')
        }

        let image_hash: string | undefined
        if (dto.imageHash) image_hash = dto.imageHash
        else if (dto.imageUrl) {
          try { image_hash = await this.uploadAdImageFromUrl(adAccountId, dto.imageUrl, fb) } catch { }
        }

        const link_data: any = {
          link,
          message: dto.caption || '',
          call_to_action: { type: 'LEARN_MORE', value: { link } },
        }
        if (image_hash) link_data.image_hash = image_hash

        const object_story_spec = { page_id: pageId, link_data }
        this.logger.log(`STEP createCreative TRAFFIC → POST /${adAccountId}/adcreatives`)
        const res = await fb.post(
          `/${adAccountId}/adcreatives`,
          qs.stringify({ name: dto.campaignName, object_story_spec: JSON.stringify(object_story_spec) }),
          { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
        )
        this.logger.log(`✅ Creative created (LINK AD): ${res.data.id}`)
        return res.data.id
      }

      if (dto.goal === AdsGoal.MESSAGE) {
        const destination = (dto.messageDestination || 'MESSENGER') as 'MESSENGER' | 'WHATSAPP' | 'INSTAGRAM_DIRECT'
        const imgHash = dto.imageHash || await this.ensureImageHash(dto, adAccountId, fb)

        let call_to_action: any
        if (destination === 'WHATSAPP') {
          if (!dto.whatsappNumber) throw new BadRequestException('Thiếu whatsappNumber cho Click-to-WhatsApp.')
          call_to_action = { type: 'WHATSAPP_MESSAGE', value: { app_destination: 'WHATSAPP', whatsapp_number: dto.whatsappNumber } }
        } else {
          call_to_action = { type: 'MESSAGE_PAGE', value: { app_destination: 'MESSENGER' } }
        }

        const linkUrl = dto.linkUrl || dto.urlWebsite || 'https://www.alloneads.com/'
        const object_story_spec = {
          page_id: pageId,
          link_data: { link: linkUrl, message: dto.caption || '', image_hash: imgHash, call_to_action },
        }

        this.logger.log(`STEP createCreative CTM → POST /${adAccountId}/adcreatives`)
        const res = await fb.post(
          `/${adAccountId}/adcreatives`,
          qs.stringify({ name: dto.campaignName, object_story_spec: JSON.stringify(object_story_spec) }),
          { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
        )
        this.logger.log(`✅ Creative created (CTM): ${res.data.id}`)
        return res.data.id
      }

      // ENGAGEMENT / BOOST
      if (!dto.postId) throw new BadRequestException('Thiếu postId cho bài viết.')
      this.logger.log(`STEP createCreative BOOST → POST /${adAccountId}/adcreatives`)
      const res = await fb.post(
        `/${adAccountId}/adcreatives`,
        qs.stringify({ name: dto.campaignName, object_story_id: dto.postId }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      )
      this.logger.log(`✅ Creative created: ${res.data.id}`)
      return res.data.id
    } catch (error: any) {
      const message = error?.response?.data?.error?.error_user_msg || error.message
      this.logger.error('❌ Creative creation error:', error?.response?.data || error)
      throw new BadRequestException(`Tạo Creative thất bại: ${message}`)
    }
  }

  private async createAwarenessFallbackAndAd(
    dto: AnyDto,
    adAccountId: string,
    pageId: string,
    creativeId: string,
    fb: AxiosInstance
  ) {
    this.logger.warn('⚠️ Pixel required → fallback OUTCOME_AWARENESS / IMPRESSIONS')
    const fbCampaignId = await this.createCampaign(dto, adAccountId, fb, 'OUTCOME_AWARENESS')

    const targeting = await this.buildTargeting(dto, adAccountId, fb)

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
    await fb.post(
      `/${campaignId}`,
      qs.stringify({ status: 'ACTIVE' }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    )
    this.logger.log(`🚀 Campaign ${campaignId} activated.`)
  }

  private async activateAdSet(adSetId: string, fb: AxiosInstance) {
    this.logger.log(`STEP activateAdSet → POST /${adSetId}`)
    await fb.post(
      `/${adSetId}`,
      qs.stringify({ status: 'ACTIVE' }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    )
    this.logger.log(`🚀 AdSet ${adSetId} activated.`)
  }

  private async activateAd(adId: string, fb: AxiosInstance) {
    try {
      this.logger.log(`STEP activateAd → POST /${adId}`)
      await fb.post(
        `/${adId}`,
        qs.stringify({ status: 'ACTIVE' }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      )
      this.logger.log(`🚀 Ad ${adId} activated.`)
    } catch (error: any) {
      const message = error?.response?.data?.error?.error_user_msg || error.message
      this.logger.error(`❌ Failed to activate Ad ${adId}:`, error?.response?.data || error)
      throw new BadRequestException(`Kích hoạt quảng cáo thất bại: ${message}`)
    }
  }

  async updateAdInsight(id: string, dto: AdInsightUpdateDTO) {
    try {
      this.logger.log(`STEP updateAdInsight: id=${id} isActive=${dto.isActive}`)
      const adInsight = await this.adInsightRepo
        .createQueryBuilder('adInsight')
        .where('adInsight.id=:id', { id })
        .getOne()
      adInsight.isActive = dto.isActive
      const saved = await this.adInsightRepo.save(adInsight)
      this.logger.log(`STEP updateAdInsight DONE`)
      return saved
    } catch (error: any) {
      const errorMessage = error?.response?.data?.error?.error_user_msg || error.message
      this.logger.error('❌ updateAdInsight failed:', error?.response?.data || error)
      throw new BadRequestException(`Cập nhập quảng cáo thất bại: ${errorMessage}`)
    }
  }

  // ====== tiện ích ======
  private uniq<T>(arr: T[]): T[] {
    return Array.from(new Set(arr));
  }
  private sleep(ms: number) {
    return new Promise(r => setTimeout(r, ms));
  }

  private async fetchCampaignInsights(args: {
    apiVersion: string;
    adAccountId: string;
    fb: AxiosInstance;
    datePreset: string;
  }) {
    const { apiVersion, adAccountId, fb, datePreset } = args;
    const base = `/${adAccountId}/insights`;
    const params = new URLSearchParams({
      level: 'campaign',
      fields: [
        'campaign_id',
        'campaign_name',
        'date_start',
        'date_stop',
        'spend',
        'impressions',
        'clicks',
        'ctr',
        'actions',
        'action_values',
        'purchase_roas',
      ].join(','),
      date_preset: datePreset,
      time_increment: '1',
      limit: '500',
    });

    let url: string | null = `${fb.defaults.baseURL?.replace(/\/$/, '')}${base}?${params.toString()}`;
    const rows: any[] = [];
    while (url) {
      this.logger.log(`STEP insights paginate → GET ${url.substring(0, 80)}...`)
      const { data } = await fb.get(url);
      rows.push(...(data?.data ?? []));
      url = data?.paging?.next ?? null;
      if (url) await this.sleep(150);
    }
    return rows;
  }

  private async fetchAdsetTargetingBatch(args: {
    apiVersion: string;
    fb: AxiosInstance;
    adsetIds: string[];
  }) {
    const { fb, adsetIds } = args;
    const out: Record<string, any> = {};
    const ids = [...adsetIds];
    const CONCURRENCY = 4;

    const worker = async () => {
      while (ids.length) {
        const id = ids.shift()!;
        try {
          this.logger.log(`STEP fetchAdsetTargeting → GET /${id}?fields=id,name,targeting`)
          const { data } = await fb.get(`/${id}`, { params: { fields: 'id,name,targeting' }, timeout: 30_000 });
          out[id] = data?.targeting ?? null;
        } catch (e: any) {
          this.logger.error(`fetchAdsetTargetingBatch error ${id}: ${JSON.stringify(e?.response?.data || e)}`);
          out[id] = null;
        }
        await this.sleep(120);
      }
    };

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, adsetIds.length) }, worker));
    return out;
  }

  async listAds(opts: ListOpts = {}, config: any) {
    console.log(`config for listAds: `, config);

    const { apiVersion: vEnv, adAccountId, accessTokenUser, cookie } = config;
    const apiVersion = opts.apiVersion || vEnv;
    const fb = this.fb(accessTokenUser, cookie, apiVersion)

    const fields = (opts.fields && opts.fields.length
      ? opts.fields
      : [
        'id',
        'name',
        'adset_id',
        'campaign_id',
        'status',
        'effective_status',
        'created_time',
        'updated_time',
      ]).join(',');

    const effective_status = JSON.stringify(
      (opts.effective_status && opts.effective_status.length
        ? opts.effective_status
        : ['ACTIVE', 'PAUSED', 'ARCHIVED'])
    );

    const limit = Math.max(1, opts.limit ?? 200);
    const rankBy = opts.rankBy ?? 'roas';
    const datePreset = opts.datePreset ?? 'last_7d';

    const baseUrl = `/${adAccountId}/ads`;
    const baseParams = { fields, limit, effective_status };

    const all: any[] = [];
    let nextUrl: string | null = baseUrl;
    let nextParams: Record<string, any> = { ...baseParams };

    try {
      while (nextUrl) {
        this.logger.log(`STEP listAds paginate → GET ${nextUrl} with params?=${Object.keys(nextParams).length > 0}`)
        const { data } = await fb.get(nextUrl, { params: nextParams, timeout: 30_000 });
        if (Array.isArray(data?.data)) all.push(...data.data);
        const nxt = data?.paging?.next;
        if (nxt) { nextUrl = nxt; nextParams = {}; } else { nextUrl = null; }
      }

      if (!all.length) {
        this.logger.log(`STEP listAds: no ads found`)
        return { count: 0, items: [], top3Campaigns: [] };
      }

      console.log(`Fetched total ${all.length} ads`, all.slice(0, 2));

      const campaignIds = this.uniq(all.map(a => a.campaign_id).filter(Boolean));
      if (!campaignIds.length) {
        this.logger.log(`STEP listAds: no campaign ids`)
        return { count: all.length, items: all, top3Campaigns: [] };
      }

      this.logger.log(`STEP listAds: fetch campaign insights datePreset=${datePreset}`)
      const insightsAll = await this.fetchCampaignInsights({ apiVersion, adAccountId, fb, datePreset });
      const rows = insightsAll.filter((r: any) => campaignIds.includes(r.campaign_id));

      const byCamp = new Map<string, any[]>();
      for (const r of rows) {
        const arr = byCamp.get(r.campaign_id) || [];
        arr.push(r);
        byCamp.set(r.campaign_id, arr);
      }

      const scored: Array<{
        campaign_id: string;
        campaign_name: string;
        metric: number;
        meta: { avg_roas?: number | null; cpl?: number | null; ctr?: number | null; spend?: number };
      }> = [];

      for (const [campId, arr] of byCamp) {
        const name = arr.find((x: any) => x.campaign_name)?.campaign_name || campId;

        let spend = 0;
        let clicks = 0;
        let impressions = 0;
        let leads = 0;
        const roasVals: number[] = [];
        const ctrVals: number[] = [];

        for (const r of arr) {
          const s = Number(r.spend ?? '0'); if (!Number.isNaN(s)) spend += s;
          const c = Number(r.clicks ?? '0'); if (!Number.isNaN(c)) clicks += c;
          const imp = Number(r.impressions ?? '0'); if (!Number.isNaN(imp)) impressions += imp;

          const leadRow = (r.actions ?? []).find((a: any) => a.action_type === 'lead');
          if (leadRow) {
            const v = Number(leadRow.value);
            if (!Number.isNaN(v)) leads += v;
          }

          const proas = (r.purchase_roas ?? []).find((p: any) => p.action_type === 'purchase');
          if (proas && proas.value != null && !Number.isNaN(Number(proas.value))) {
            roasVals.push(Number(proas.value));
          }

          if (r.ctr != null && !Number.isNaN(Number(r.ctr))) {
            ctrVals.push(Number(r.ctr));
          }
        }

        const avgROAS = roasVals.length ? (roasVals.reduce((a, b) => a + b, 0) / roasVals.length) : null;
        const avgCTR = ctrVals.length ? (ctrVals.reduce((a, b) => a + b, 0) / ctrVals.length) : null;
        const cpl = leads > 0 ? (spend / leads) : null;

        let metric: number | null = null;
        if (rankBy === 'roas') {
          metric = avgROAS ?? (avgCTR ?? 0);
        } else if (rankBy === 'cpl') {
          metric = cpl != null ? -cpl : (avgCTR != null ? avgCTR : 0);
        } else if (rankBy === 'ctr') {
          metric = avgCTR ?? 0;
        }

        scored.push({
          campaign_id: campId,
          campaign_name: name,
          metric: metric ?? 0,
          meta: { avg_roas: avgROAS, cpl, ctr: avgCTR, spend },
        });
      }

      const top3 = scored.sort((a, b) => b.metric - a.metric).slice(0, 3);
      if (!top3.length) {
        this.logger.log(`STEP listAds: no top3 (empty scored)`)
        return { count: all.length, items: top3, top3Campaigns: [] };
      }

      const topCampIds = new Set(top3.map(x => x.campaign_id));
      const adsetsOfTop = this.uniq(
        all.filter(a => topCampIds.has(a.campaign_id)).map(a => a.adset_id).filter(Boolean)
      );

      this.logger.log(`STEP listAds: fetch adset targeting for ${adsetsOfTop.length} adsets`)
      const adsetTargeting = await this.fetchAdsetTargetingBatch({
        apiVersion,
        fb,
        adsetIds: adsetsOfTop,
      });

      const adsetsByCamp: Record<string, Array<{ adset_id: string; targeting: any }>> = {};
      for (const a of all) {
        if (!topCampIds.has(a.campaign_id)) continue;
        const t = adsetTargeting[a.adset_id];
        if (!t) continue;
        if (!adsetsByCamp[a.campaign_id]) adsetsByCamp[a.campaign_id] = [];
        if (!adsetsByCamp[a.campaign_id].some(x => x.adset_id === a.adset_id)) {
          adsetsByCamp[a.campaign_id].push({ adset_id: a.adset_id, targeting: t });
        }
      }

      const summarizeTargeting = (items: Array<{ targeting: any }>) => {
        const countries = new Set<string>();
        const cities: Array<{ key: string; name?: string }> = [];
        const age = { min: Infinity, max: -Infinity };
        const genders = new Set<number>();
        const interests = new Map<string, string>();
        for (const it of items) {
          const tg = it.targeting || {};
          const geo = tg.geo_locations || {};
          (geo.countries || []).forEach((c: string) => countries.add(c));
          (geo.cities || []).forEach((c: any) => cities.push({ key: String(c.key), name: c.name }));
          if (typeof tg.age_min === 'number') age.min = Math.min(age.min, tg.age_min);
          if (typeof tg.age_max === 'number') age.max = Math.max(age.max, tg.age_max);
          (tg.genders || []).forEach((g: number) => genders.add(g));
          (tg.interests || []).forEach((i: any) => {
            const id = String(i.id ?? '');
            if (id) interests.set(id, i.name || id);
          });
        }
        return {
          countries: Array.from(countries),
          cities: cities.slice(0, 10),
          age_min: age.min === Infinity ? null : age.min,
          age_max: age.max === -Infinity ? null : age.max,
          genders: Array.from(genders),
          interests: Array.from(interests).slice(0, 15).map(([id, name]) => ({ id, name })),
        };
      };

      const top3Campaigns = top3.map(x => {
        const adsets = adsetsByCamp[x.campaign_id] || [];
        return {
          campaign_id: x.campaign_id,
          campaign_name: x.campaign_name,
          metric_used: rankBy,
          metric_value: x.metric,
          performance: x.meta,
          targeting_summary: summarizeTargeting(adsets),
          adsets,
        };
      });

      this.logger.log(`STEP listAds DONE: total=${all.length} top3=${top3.length}`)
      return { count: all.length, items: top3, top3Campaigns };

    } catch (err: any) {
      const apiErr = err?.response?.data || err;
      this.logger.error(`listAds error: ${JSON.stringify(apiErr)}`);
      throw new InternalServerErrorException(apiErr);
    }
  }

  private async pauseAd(adId: string, fb: AxiosInstance) {
    try {
      this.logger.log(`STEP pauseAd → POST /${adId}`)
      await fb.post(
        `/${adId}`,
        qs.stringify({ status: 'PAUSED' }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      )
      this.logger.log(`⏸️  Ad ${adId} paused.`)
    } catch (error: any) {
      const message = error?.response?.data?.error?.error_user_msg || error.message
      this.logger.error(`❌ Failed to pause Ad ${adId}:`, error?.response?.data || error)
      throw new BadRequestException(`Tạm dừng quảng cáo thất bại: ${message}`)
    }
  }

  async setAdStatus(params: {
    adId: string;
    isActive: boolean;
    user: User;
    dto0?: AnyDto;
  }) {
    const { adId, isActive, user, dto0 } = params;

    try {
      this.logger.log(`STEP setAdStatus: adId=${adId} → ${isActive ? 'ACTIVE' : 'PAUSED'}`)

      const dto = (dto0 ?? {}) as AnyDto
      this.logger.log(`STEP 0: Input DTO & user loaded`)
      const userData = await this.userRepo.findOne({ where: { email: user.email } })
      if (!userData) throw new BadRequestException(`Không tìm thấy thông tin người dùng với email: ${user.email}`)

      const { accessTokenUser, accountAdsId: adAccountId, idPage: pageId, cookie: rawCookie } = userData
      if (!accessTokenUser) throw new BadRequestException(`Người dùng chưa liên kết Facebook hoặc thiếu accessTokenUser.`)
      if (!adAccountId) throw new BadRequestException(`Người dùng chưa có accountAdsId. Vui lòng kiểm tra lại.`)
      if (!pageId && dto.goal !== AdsGoal.LEADS) {
        this.logger.warn(`User chưa liên kết Fanpage (idPage) – vẫn tiếp tục do chỉ đổi trạng thái ad.`)
      }

      const fb = this.fb(accessTokenUser, rawCookie, 'v23.0')

      if (isActive) await this.activateAd(adId, fb)
      else await this.pauseAd(adId, fb)

      try {
        const rec = await this.facebookAdRepo.findOne({ where: { adId } })
        if (rec) {
          rec.status = isActive ? 'ACTIVE' : 'PAUSED'
          await this.facebookAdRepo.save(rec)
        }
      } catch (e) {
        this.logger.warn(`DB update status warning for adId=${adId}: ${e?.message || e}`)
      }

      return {
        success: true,
        adId,
        status: isActive ? 'ACTIVE' : 'PAUSED',
        message: isActive ? 'Đã bật quảng cáo' : 'Đã tắt quảng cáo',
      }
    } catch (error: any) {
      const message = error?.response?.data?.error?.error_user_msg || error.message
      this.logger.error('❌ setAdStatus failed:', error?.response?.data || error)
      throw new BadRequestException(`Cập nhật trạng thái quảng cáo thất bại: ${message}`)
    }
  }

}
