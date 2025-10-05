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
import moment from 'moment'

/** ===================== Types & DTO (extended) ===================== */
type TargetingSpec = Record<string, any>;
type MediaKind = 'video' | 'photo' | 'link' | 'status' | 'unknown'

type PlacementsInput = {
  publisher_platforms?: string[];
  facebook_positions?: string[];
  instagram_positions?: string[];
  messenger_positions?: string[];
  audience_network_positions?: string[];
  device_platforms?: Array<'mobile' | 'desktop'>;
};

type GeoLocationsInput = {
  countries?: string[];
  cities?: Array<{ key: string; radius?: number; distance_unit?: 'mile' | 'kilometer' }>;
  custom_locations?: Array<{ latitude: number; longitude: number; radius: number; distance_unit?: 'mile' | 'kilometer' }>;
  regions?: any[];
  location_types?: string[];
};

type AnyDto = CreateFacebookAdDto & {
  messageDestination?: 'MESSENGER' | 'WHATSAPP' | 'INSTAGRAM_DIRECT'
  whatsappNumber?: string
  imageHash?: string
  imageUrl?: string
  linkUrl?: string
  instagramActorId?: string
  /** dùng cho Lead Ads */
  leadgenFormId?: string
  /** toggle mở Advantage Audience */
  aiTargeting?: boolean
  numAds?: number; // số lượng ads muốn tạo, mặc định 1
  /** gợi ý AI (tiếng Anh) */
  targetingAI?: {
    keywordsForInterestSearch?: string[]
    behaviors?: Array<{ id: string; name?: string }>
    // các key tiếng Việt có thể nằm trong targetingAI.mẫu_targeting
    'mẫu_targeting'?: {
      'sở_thích'?: Array<{ 'mã': string; 'tên'?: string }>
      'hành_vi'?: Array<{ 'mã': string; 'tên'?: string }>
      'giới_tính'?: number[]
      'tuổi_tối_thiểu'?: number
      'tuổi_tối_đa'?: number
      'vị_trí_địa_lý'?: { 'quốc_gia'?: string[] }
    }
  }
  /** NEW: đơn vị bán kính client truyền vào (m/km/mi) */
  radiusUnit?: 'm' | 'km' | 'mi'
  /** Cho phép truyền placements chi tiết */
  placements?: PlacementsInput | string[]
  /** Cho phép truyền geo_locations thô (cities + custom_locations) */
  geo_locations?: GeoLocationsInput
}

type ListOpts = {
  fields?: string[];
  effective_status?: string[];
  limit?: number;
  apiVersion?: string;
  rankBy?: 'roas' | 'cpl' | 'ctr';
  datePreset?: string; // 'last_7d', 'last_30d', 'today'
};

/** ===================== FB CLIENT ===================== */
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

/** ===================== Service ===================== */
@Injectable()
export class FacebookAdsService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(FacebookAd) private readonly facebookAdRepo: Repository<FacebookAd>,
    @InjectRepository(FacebookCampaign) private readonly facebookCampaignRepo: Repository<FacebookCampaign>,
  ) { }

  private readonly logger = new Logger(FacebookAdsService.name);

  private fb(token: string, cookie?: string, version = 'v23.0', timeoutMs = 20_000) {
    return createFbGraphClient({ token, cookie, version, timeoutMs })
  }

  /** ===================== Helpers (mapping) ===================== */
  private mapGender(g?: 'all' | 'male' | 'female'): number[] | undefined {
    if (!g || g === 'all') return undefined
    if (g === 'male') return [1]   // FB: 1=male
    if (g === 'female') return [2] // FB: 2=female
    return undefined
  }

  // chuẩn hóa token placements từ mảng rút gọn về object Graph
  private normalizePlacements(input?: PlacementsInput | string[]): PlacementsInput | undefined {
    if (!input) return undefined;
    if (Array.isArray(input)) {
      const out: PlacementsInput = {};
      const pp = new Set<string>();
      const fbPos = new Set<string>();
      const igPos = new Set<string>();
      const msPos = new Set<string>();
      const anPos = new Set<string>();
      const devs = new Set<'mobile' | 'desktop'>();

      for (const raw of input) {
        const t = String(raw || '').toLowerCase().trim();

        if (t.startsWith('facebook')) pp.add('facebook');
        if (t.startsWith('instagram') || t === 'reels' || t.includes('ig')) pp.add('instagram');
        if (t.startsWith('messenger')) pp.add('messenger');
        if (t.includes('audience_network') || t === 'audience_network') pp.add('audience_network');

        if (t.includes('feed')) fbPos.add('feed');
        if (t.includes('marketplace')) fbPos.add('marketplace');
        if (t.includes('instream') || t.includes('video')) fbPos.add('instream_video');
        if (t.includes('search')) fbPos.add('search');
        if (t.includes('reels')) fbPos.add('facebook_reels');
        if (t.includes('story')) fbPos.add('story');

        if (t.includes('ig_stream') || t.includes('instagram_stream')) igPos.add('stream');
        if (t.includes('ig_story') || (t.includes('instagram') && t.includes('story'))) igPos.add('story');
        if (t.includes('ig_reels') || (t.includes('instagram') && t.includes('reels'))) igPos.add('reels');
        if (t.includes('explore')) igPos.add('explore');

        if (t.includes('messenger_home')) msPos.add('messenger_home');
        if (t.includes('sponsored_messages')) msPos.add('sponsored_messages');

        if (t.includes('in_stream_video')) anPos.add('in_stream_video');
        if (t.includes('native') || t.includes('banner') || t.includes('interstitial')) {
          anPos.add('classic');
        }

        if (t.includes('desktop')) devs.add('desktop');
        if (t.includes('mobile')) devs.add('mobile');
      }

      if (pp.size) out.publisher_platforms = Array.from(pp);
      if (fbPos.size) out.facebook_positions = Array.from(fbPos);
      if (igPos.size) out.instagram_positions = Array.from(igPos);
      if (msPos.size) out.messenger_positions = Array.from(msPos);
      if (anPos.size) out.audience_network_positions = Array.from(anPos);
      if (devs.size) out.device_platforms = Array.from(devs);

      return out;
    }
    return input as PlacementsInput;
  }

  // ưu tiên placements người dùng, nếu không → mặc định
  private mapPlacements(goal: AdsGoal, opts?: { disableInstagram?: boolean, manual?: PlacementsInput }) {
    if (opts?.manual) {
      const m = { ...opts.manual };
      const pp = new Set(m.publisher_platforms || []);
      if (m.facebook_positions?.length) pp.add('facebook');
      if (m.instagram_positions?.length) pp.add('instagram');
      if (m.messenger_positions?.length) pp.add('messenger');
      if (m.audience_network_positions?.length) pp.add('audience_network');
      if (pp.size) m.publisher_platforms = Array.from(pp);
      return m;
    }
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

  // chuẩn hóa geo_locations truyền thô
  private sanitizeGeoLocations(geo?: GeoLocationsInput): any | undefined {
    if (!geo) return undefined;
    const out: any = {};

    // ✅ countries
    if (Array.isArray(geo.countries) && geo.countries.length) {
      out.countries = geo.countries.slice(0, 25);
    }

    // ✅ cities (Facebook chỉ cho phép key + radius, radius tính bằng mile)
    if (Array.isArray(geo.cities) && geo.cities.length) {
      out.cities = geo.cities
        .filter(c => c?.key)
        .slice(0, 200)
        .map(c => ({
          key: String(c.key),
          radius: Math.max(1, Math.min(50, Number(c.radius))), // mile cố định
          // ❌ KHÔNG thêm distance_unit cho cities
        }));
    }

    // ✅ custom_locations (cho phép distance_unit: mile/kilometer)
    if (Array.isArray(geo.custom_locations) && geo.custom_locations.length) {
      out.custom_locations = geo.custom_locations
        .filter(l =>
          Number.isFinite(l?.latitude as any) &&
          Number.isFinite(l?.longitude as any) &&
          Number.isFinite(l?.radius as any)
        )
        .slice(0, 200)
        .map(l => ({
          latitude: Number(l.latitude),
          longitude: Number(l.longitude),
          radius: Math.max(1, Math.min(50, Number(l.radius))),
          distance_unit: l.distance_unit === 'kilometer' ? 'kilometer' : 'mile',
        }));
    }

    if (Array.isArray(geo.regions) && geo.regions.length) {
      out.regions = geo.regions;
    }
    if (Array.isArray(geo.location_types) && geo.location_types.length) {
      out.location_types = geo.location_types;
    }

    return Object.keys(out).length ? out : undefined;
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

  /** Quy đổi bán kính về mile (1–50) theo đơn vị truyền vào/heuristic */
  private normalizeRadiusToMiles(value?: number, unit?: 'm' | 'km' | 'mi'): number | undefined {
    if (typeof value !== 'number' || isNaN(value) || value <= 0) return undefined;

    let miles: number;
    if (unit === 'mi') miles = value;
    else if (unit === 'km') miles = value / 1.609;
    else if (unit === 'm') miles = (value / 1000) / 1.609;
    else {
      if (value > 2000) miles = (value / 1000) / 1.609; // coi là mét
      else if (value > 50) miles = value / 1.609;       // coi là km
      else miles = value;                                // coi là mile
    }

    return Math.max(1, Math.min(50, Number(miles.toFixed(2))));
  }

  /** ===================== Helpers (Graph utils) ===================== */
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

  /** ===================== Targeting build/normalize ===================== */
  private normalizeTargetingForCreation(t: TargetingSpec) {
    const out: TargetingSpec = { ...(t || {}) };
    const flex: any[] = Array.isArray(out.flexible_spec) ? [...out.flexible_spec] : [];

    if (Array.isArray(out.interests) && out.interests.length) {
      flex.push({ interests: out.interests });
      delete out.interests;
    }
    if (Array.isArray(out.behaviors) && out.behaviors.length) {
      flex.push({ behaviors: out.behaviors });
      delete out.behaviors;
    }

    if (flex.length) out.flexible_spec = flex;
    return out;
  }

  private mergeFlex(t: TargetingSpec, chunk: { interests?: any[]; behaviors?: any[] }) {
    const flex: any[] = Array.isArray(t.flexible_spec) ? [...t.flexible_spec] : [];
    const add: any = {};
    if (chunk.interests?.length) add.interests = chunk.interests;
    if (chunk.behaviors?.length) add.behaviors = chunk.behaviors;
    if (Object.keys(add).length) flex.push(add);
    if (flex.length) t.flexible_spec = flex;
    return t;
  }

  private async buildTargeting(
    dto: AnyDto,
    adAccountId: string,
    fb: AxiosInstance
  ) {
    // GEO
    let geo_locations: any | undefined;
    if (dto.geo_locations) {
      geo_locations = this.sanitizeGeoLocations(dto.geo_locations);
    } else {
      const clampedRadius = this.normalizeRadiusToMiles(dto.radius, dto.radiusUnit);
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
          : { countries: ['VN'] };
    }

    // PLACEMENTS
    const disableInstagram =
      dto.goal === AdsGoal.ENGAGEMENT && !dto.instagramActorId;
    const manualPlacements = this.normalizePlacements(dto.placements);
    const placements = this.mapPlacements(dto.goal, {
      disableInstagram,
      manual: manualPlacements,
    });

    const targetingBase: TargetingSpec = {
      geo_locations,
      ...placements,
      targeting_automation: { advantage_audience: dto.aiTargeting ? 1 : 0 },
    };
    const targeting: TargetingSpec = { ...targetingBase };

    // AGE/GENDER
    if (Array.isArray(dto.ageRange) && dto.ageRange.length === 2) {
      const [min, max] = dto.ageRange;
      if (Number.isFinite(min)) targeting.age_min = Math.max(13, Math.floor(min));
      if (Number.isFinite(max)) targeting.age_max = Math.floor(max);
    }
    const genders = this.mapGender(dto.gender as any);
    if (genders) targeting.genders = genders;

    // Việt ngữ từ mẫu_targeting nếu chưa set
    const viTpl = dto?.targetingAI?.['mẫu_targeting'];
    if (viTpl) {
      if (
        typeof viTpl['tuổi_tối_thiểu'] === 'number' &&
        targeting.age_min == null
      )
        targeting.age_min = Math.max(13, Math.floor(viTpl['tuổi_tối_thiểu']));
      if (
        typeof viTpl['tuổi_tối_đa'] === 'number' &&
        targeting.age_max == null
      )
        targeting.age_max = Math.floor(viTpl['tuổi_tối_đa']);
      if (Array.isArray(viTpl['giới_tính']) && !targeting.genders) {
        const vs = viTpl['giới_tính'].filter((n) => n === 1 || n === 2);
        if (vs.length) targeting.genders = vs;
      }
      if (
        viTpl['vị_trí_địa_lý']?.['quốc_gia'] &&
        !dto.geo_locations &&
        !dto.location
      ) {
        targeting.geo_locations = {
          countries: viTpl['vị_trí_địa_lý']['quốc_gia'],
        };
      }
    }

    // INTERESTS
    const manualInterestNames: string[] = Array.isArray(dto.detailedTargeting)
      ? dto.detailedTargeting.filter(Boolean)
      : [];
    const aiKeywords: string[] = Array.isArray(
      dto?.targetingAI?.keywordsForInterestSearch,
    )
      ? dto.targetingAI.keywordsForInterestSearch
      : [];
    const viInterests = Array.isArray(viTpl?.['sở_thích'])
      ? viTpl!['sở_thích']
      : [];
    const viInterestNames: string[] = viInterests
      .map((x) => x?.['tên'] || '')
      .filter(Boolean);

    const needLookup = [
      ...new Set([...manualInterestNames, ...aiKeywords, ...viInterestNames]),
    ].slice(0, 30);
    if (needLookup.length > 0) {
      const lookedUp = await this.searchInterestsByNames(needLookup, fb);
      if (lookedUp.length)
        this.mergeFlex(targeting, { interests: lookedUp.slice(0, 10) });
    }

    // BEHAVIORS
    let rawBehaviors: Array<{ id: string; name?: string }> = [];
    if (Array.isArray(dto?.targetingAI?.behaviors)) {
      rawBehaviors = rawBehaviors.concat(
        dto.targetingAI.behaviors
          .filter((b: any) => b?.id && /^\d+$/.test(String(b.id)))
          .map((b: any) => ({ id: String(b.id), name: b.name })),
      );
    }
    const viBehaviors = Array.isArray(viTpl?.['hành_vi'])
      ? viTpl!['hành_vi']
      : [];
    rawBehaviors = rawBehaviors.concat(
      viBehaviors
        .filter((b: any) => b?.['mã'] && /^\d+$/.test(String(b['mã'])))
        .map((b: any) => ({ id: String(b['mã']), name: b['tên'] })),
    );

    if (dto.goal !== AdsGoal.MESSAGE && rawBehaviors.length) {
      const unique = Array.from(
        new Map(rawBehaviors.map((b) => [b.id, b])).values(),
      ).slice(0, 10);
      const valid = await this.validateBehaviors(unique, adAccountId, fb);
      if (valid.length) this.mergeFlex(targeting, { behaviors: valid });
    }

    // --- AUDIENCE SAFETY CHECK ---
    let totalInterests =
      targeting.flexible_spec
        ?.map((fs) => fs.interests?.length || 0)
        .reduce((a, b) => a + b, 0) || 0;

    if (totalInterests === 0) {
      // Không có interest nào → cho phép Facebook mở rộng
      this.logger.warn(
        `[FacebookAdsService] ⚠️ No interests found → enable Advantage Audience`,
      );
      targeting.targeting_automation = { advantage_audience: 1 };
    } else if (totalInterests > 0 && totalInterests < 3) {
      // Có nhưng quá ít → bổ sung thêm từ AI
      this.logger.warn(
        `[FacebookAdsService] ⚠️ Too few interests (${totalInterests}) → asking AI for fallback`,
      );
      const fallback = await this.suggestFallbackInterests(dto, fb);
      if (fallback.length) {
        this.mergeFlex(targeting, { interests: fallback });
        totalInterests += fallback.length;
      }
    }

    // --- FINAL FILTER: remove niche interests (film, movie, show…) ---
    if (targeting.flexible_spec) {
      targeting.flexible_spec = targeting.flexible_spec
        .map((fs) => {
          if (!fs.interests) return fs;
          return {
            ...fs,
            interests: fs.interests.filter(
              (i) => !/film|movie|show|penguin|cartoon/i.test(i.name),
            ),
          };
        })
        .filter((fs) => fs.interests && fs.interests.length > 0);
    }

    // --- FINAL GEO CHECK ---
    if (!targeting.geo_locations || Object.keys(targeting.geo_locations).length === 0) {
      this.logger.warn(
        `[FacebookAdsService] ⚠️ geo_locations lost after merge → reset to VN`,
      );
      targeting.geo_locations = { countries: ['VN'] };
    }

    return this.normalizeTargetingForCreation(targeting);
  }



  private async suggestFallbackInterests(
    dto: AnyDto,
    fb: AxiosInstance,
  ): Promise<Array<{ id: string; name: string }>> {
    const systemPrompt = `Bạn là chuyên gia Facebook Ads. 
  Nhiệm vụ: gợi ý các interest broad nhưng phù hợp ngành hàng để mở rộng audience. 
  Trả về JSON dạng {"interests":[{"name":"..."},{"name":"..."}]}`;

    const userPrompt = `
    Tôi muốn chạy quảng cáo Facebook.
    Mục tiêu: ${dto.goal}
    Tên chiến dịch: ${dto.campaignName}
    Caption: ${dto.caption || ""}
    Sản phẩm: ${dto?.targetingAI?.['sản phẩm'] || ""}
    Hãy gợi ý 5 interest broad phổ biến nhất, dễ target, liên quan sản phẩm hoặc ngành hàng này.
  `;

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
      };

      const res = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        body,
        {
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        },
      );

      const content = res.data?.choices?.[0]?.message?.content;
      if (!content) return [];

      const parsed = JSON.parse(content);
      const names: string[] = Array.isArray(parsed?.interests)
        ? parsed.interests.map((i: any) => i.name).filter(Boolean)
        : [];

      if (!names.length) return [];

      // ⚡️ Log GPT output
      this.logger.log(
        `[FacebookAdsService] ✅ GPT fallback interests: ${JSON.stringify(names)}`,
      );

      // Lookup ID bằng Facebook API
      const lookedUp = await this.searchInterestsByNames(names, fb);

      // ⚡️ Log sau khi lookup
      this.logger.log(
        `[FacebookAdsService] ✅ Lookup result interests: ${JSON.stringify(
          lookedUp.map((x) => ({ id: x.id, name: x.name })),
        )}`,
      );

      return lookedUp.slice(0, 5);
    } catch (e: any) {
      this.logger.error(`❌ suggestFallbackInterests error: ${e.message}`);
      return [];
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

  /** ===================== Lead Form helpers ===================== */
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

  private async createBasicLeadForm(pageId: string, fb: AxiosInstance, name = 'Form cơ bản - Họ tên + SĐT') {
    const questions = [{ type: 'FULL_NAME' }, { type: 'PHONE' }];
    const thank_you_page = { title: 'Cảm ơn bạn!', body: 'Chúng tôi sẽ liên hệ sớm.', button_type: 'NONE' };

    const body = qs.stringify({
      name,
      privacy_policy_url: 'https://www.freeprivacypolicy.com/live/e61a4cad-b80f-451e-a877-c3e31e929689', // TODO: thay URL thật
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

  private async ensureLeadFormId(pageId: string, fb: AxiosInstance, campaignName?: string) {
    const picked = await this.pickLatestPublishedLeadFormId(pageId, fb)
    if (picked) return picked
    const created = await this.createBasicLeadForm(pageId, fb, `Form - ${campaignName || 'Lead'}`)
    return created
  }

  /** ===================== Flow chính (create) ===================== */
  private normalizeGoal(g: any): AdsGoal {
    if (typeof g === 'string') {
      const s = g.toLowerCase();
      if (s === 'message' || s === 'messages' || s === 'conversations') return AdsGoal.MESSAGE;
      if (s === 'engagement') return AdsGoal.ENGAGEMENT;
      if (s === 'traffic') return AdsGoal.TRAFFIC;
      if (s === 'leads' || s === 'lead') return AdsGoal.LEADS;
      return AdsGoal.ENGAGEMENT;
    }
    return g ?? AdsGoal.ENGAGEMENT;
  }

  async createFacebookAd(dto0: CreateFacebookAdDto, user: User) {
    type AnyDto = CreateFacebookAdDto & {
      contents?: string[];
      images?: string[];
      selectedPosts?: Array<{ id: string; caption?: string; permalink_url?: string }>;
      postIds?: string[];
      imageUrl?: string;
      messageDestination?: 'MESSENGER' | 'WHATSAPP' | 'INSTAGRAM_DIRECT';
      whatsappNumber?: string;
    };

    const dto = dto0 as AnyDto;

    // --- Normalize goal ---
    const normalizeGoal = (g: any) => {
      const s = String(g || '').toLowerCase();
      if (['message', 'messages', 'conversations'].includes(s)) return AdsGoal.MESSAGE;
      if (s === 'traffic') return AdsGoal.TRAFFIC;
      if (s === 'leads' || s === 'lead') return AdsGoal.LEADS; // convert ngay bên dưới
      return AdsGoal.ENGAGEMENT;
    };
    dto.goal = normalizeGoal(dto.goal);
    if (dto.goal === AdsGoal.LEADS) dto.goal = AdsGoal.ENGAGEMENT; // giữ flow hiện tại

    // --- Load user & fb client ---
    const userData = await this.userRepo.findOne({ where: { email: user.email } });
    if (!userData) throw new BadRequestException(`Không tìm thấy user: ${user.email}`);
    const { accessTokenUser, accountAdsId: adAccountId, idPage: pageId, cookie: rawCookie } = userData;
    if (!accessTokenUser) throw new BadRequestException(`Thiếu accessTokenUser – vui lòng liên kết Facebook`);
    if (!adAccountId) throw new BadRequestException(`Thiếu adAccountId`);
    if (!pageId) throw new BadRequestException(`Thiếu idPage (fanpage)`);

    // time
    const ensureIso = (label: string, val?: string) => {
      if (!val || isNaN(Date.parse(val))) throw new BadRequestException(`${label} không đúng ISO 8601`);
    };
    ensureIso('startTime', dto.startTime);
    ensureIso('endTime', dto.endTime);

    const fb = this.fb(accessTokenUser, rawCookie, 'v23.0');

    // --- 1) Create Campaign on Meta ---
    const campaignId = await this.createCampaign(dto as any, adAccountId, fb);

    // --- 2) Create AdSet (targeting+budget) ---
    const mediaKind: MediaKind =
      dto.goal === AdsGoal.ENGAGEMENT && (dto as any).postId
        ? await this.detectMediaKind((dto as any).postId!, fb)
        : 'unknown';

    const { adSetId, usedCampaignId } =
      await this.createAdSetWithPerfGoalAndDestination(dto as any, campaignId, pageId!, adAccountId, mediaKind, fb);

    const metaCampaignId = usedCampaignId || campaignId;
    const objective = this.mapCampaignObjective(dto.goal);

    // --- 3) UPSERT Campaign vào DB ---
    let campaignEntity = await this.facebookCampaignRepo.findOne({ where: { campaignId: metaCampaignId } });
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
      });
    } else {
      campaignEntity.name = dto.campaignName;
      campaignEntity.objective = objective;
      campaignEntity.dailyBudget = dto.dailyBudget;
      campaignEntity.startTime = new Date(dto.startTime);
      campaignEntity.endTime = new Date(dto.endTime);
    }
    await this.facebookCampaignRepo.save(campaignEntity);

    // --- 4) Creative builders (per-item) ---
    const createCreativeForMessage = async (imageUrl: string, message: string) => {
      const imgHash = await this.uploadAdImageFromUrl(adAccountId, imageUrl, fb);
      const destination = (dto.messageDestination || 'MESSENGER') as 'MESSENGER' | 'WHATSAPP' | 'INSTAGRAM_DIRECT';

      let call_to_action: any;
      if (destination === 'WHATSAPP') {
        if (!dto.whatsappNumber) throw new BadRequestException('Thiếu whatsappNumber cho Click-to-WhatsApp');
        call_to_action = { type: 'WHATSAPP_MESSAGE', value: { app_destination: 'WHATSAPP', whatsapp_number: dto.whatsappNumber } };
      } else if (destination === 'INSTAGRAM_DIRECT') {
        call_to_action = { type: 'INSTAGRAM_MESSAGE', value: { app_destination: 'INSTAGRAM' } };
      } else {
        call_to_action = { type: 'MESSAGE_PAGE', value: { app_destination: 'MESSENGER' } };
      }

      const linkUrl = dto.urlWebsite || 'https://www.alloneads.com/';
      const object_story_spec = { page_id: pageId, link_data: { link: linkUrl, message: message || '', image_hash: imgHash, call_to_action } };

      const res = await fb.post(
        `/${adAccountId}/adcreatives`,
        qs.stringify({ name: dto.campaignName, object_story_spec: JSON.stringify(object_story_spec) }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );
      return res.data.id as string;
    };

    const createCreativeForTraffic = async (imageUrl: string, message: string) => {
      const link = (dto.urlWebsite || '').trim();
      if (!/^https?:\/\//i.test(link) || /facebook\.com|fb\.com/i.test(link)) {
        throw new BadRequestException('urlWebsite không hợp lệ cho LINK_CLICKS (phải là link ngoài Facebook).');
      }
      const imgHash = await this.uploadAdImageFromUrl(adAccountId, imageUrl, fb);
      const link_data: any = { link, message: message || '', image_hash: imgHash, call_to_action: { type: 'LEARN_MORE', value: { link } } };
      const object_story_spec = { page_id: pageId, link_data };

      const res = await fb.post(
        `/${adAccountId}/adcreatives`,
        qs.stringify({ name: dto.campaignName, object_story_spec: JSON.stringify(object_story_spec) }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );
      return res.data.id as string;
    };

    const createCreativeForEngagement = async (postId: string) => {
      const res = await fb.post(
        `/${adAccountId}/adcreatives`,
        qs.stringify({ name: dto.campaignName, object_story_id: postId }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );
      return res.data.id as string;
    };

    // --- 5) Xây items từ DTO (tạo ads theo số bài/ảnh) ---
    type AdItem =
      | { kind: 'ENGAGEMENT'; postId: string; caption?: string; urlPost?: string }
      | { kind: 'MESSAGE' | 'TRAFFIC'; imageUrl: string; message: string; urlPost?: string };

    const items: AdItem[] = [];
    if (dto.goal === AdsGoal.ENGAGEMENT) {
      const pool = (dto.selectedPosts && dto.selectedPosts.length)
        ? dto.selectedPosts.map(p => ({ postId: p.id, caption: p.caption || '', urlPost: p.permalink_url }))
        : (dto.postIds || []).map(id => ({ postId: id, caption: '', urlPost: undefined }));
      if (!pool.length) throw new BadRequestException(`ENGAGEMENT cần 'selectedPosts[]' hoặc 'postIds[]'`);
      for (const p of pool) items.push({ kind: 'ENGAGEMENT', postId: p.postId, caption: p.caption, urlPost: p.urlPost });
    } else if (dto.goal === AdsGoal.MESSAGE || dto.goal === AdsGoal.TRAFFIC) {
      const images = Array.isArray(dto.images) ? dto.images : [];
      const contents = Array.isArray(dto.contents) ? dto.contents : [];
      const n = Math.min(images.length, Math.max(contents.length, images.length));
      if (n > 0) {
        for (let i = 0; i < n; i++) {
          const img = images[i] ?? images[0];
          const msg = (contents[i] ?? contents[0] ?? dto.caption ?? '').toString();
          if (!img) continue;
          items.push({ kind: dto.goal.toUpperCase() as 'MESSAGE' | 'TRAFFIC', imageUrl: img, message: msg });
        }
      } else {
        if (!dto.imageUrl) throw new BadRequestException(`Thiếu 'images[]' (hoặc 'imageUrl') cho ${dto.goal}`);
        items.push({ kind: dto.goal.toUpperCase() as 'MESSAGE' | 'TRAFFIC', imageUrl: dto.imageUrl, message: dto.caption || '' });
      }
    }
    if (!items.length) throw new BadRequestException('Không tìm thấy item nào để tạo quảng cáo.');

    // --- 6) Tạo creatives & ads theo items ---
    const ads: any[] = [];

    for (let i = 0; i < items.length; i++) {
      const it = items[i];

      // Chọn content gốc để cắt snippet
      const rawContent =
        it.kind === 'ENGAGEMENT'
          ? (it.caption || dto.caption || '')
          : (it.message || dto.caption || '');

      const clean = rawContent.toString().trim().replace(/\s+/g, ' ');
      const snippet = clean ? clean.slice(0, 50) : ''; // 50 ký tự đầu
      const now = moment().format('YYYY-MM-DD HH:mm');

      // ✅ tên ad: ngày giờ + snippet (nhẹ nhàng, giống UI nhưng dài 50 ký tự)
      const adName = snippet ? `Ad ${now} - ${snippet}` : `Ad ${now}`;

      // tạo creative
      let creativeId: string;
      if (it.kind === 'ENGAGEMENT') {
        creativeId = await createCreativeForEngagement(it.postId);
      } else if (it.kind === 'MESSAGE') {
        creativeId = await createCreativeForMessage(it.imageUrl, it.message);
      } else {
        creativeId = await createCreativeForTraffic(it.imageUrl, it.message);
      }

      // tạo ad
      const adRes = await this.createAd(
        { ...dto, campaignName: adName } as any,
        adSetId,
        creativeId,
        adAccountId,
        metaCampaignId,
        pageId,
        fb
      );

      // lưu meta info cho DB
      adRes.__caption = (it as any).message || (it as any).caption || dto.caption || '';
      adRes.__urlPost = (it as any).urlPost || dto.urlPost || '';
      adRes.__campaignName = adName;

      ads.push(adRes);
    }

    // --- 7) Activate campaign + adset ---
    await this.activateCampaign(metaCampaignId, fb);
    await this.activateAdSet(adSetId, fb);

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
        campaign: campaignEntity, // 🔗 FK vào bảng campaigns
      });
    }

    return ads;
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
    targetingPayload = this.normalizeTargetingForCreation(targetingPayload)
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

    const makeRequest = (tp: any, goal: string, campId: string) => {
      this.logger.log(`STEP createAdSet → POST /${adAccountId}/adsets goal=${goal} camp=${campId}`)
      const body: any = { ...payloadBase, optimization_goal: goal, campaign_id: campId, targeting: JSON.stringify(tp) }
      if (isMessage) body.destination_type = destination
      if (pageId) body.promoted_object = JSON.stringify(basePromotedObject)
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

      // behaviors invalid → bỏ behaviors, GIỮ interests
      if (sub === 1487079 || /behaviors?.+invalid/i.test(msg)) {
        if (currentPayload?.flexible_spec) {
          const flex = (currentPayload.flexible_spec as any[]).map(fs => {
            if (fs.behaviors) { const { behaviors, ...rest } = fs; return rest; }
            return fs;
          }).filter(fs => Object.keys(fs).length);
          const patched = { ...currentPayload, flexible_spec: flex };
          this.logger.warn('⚠️ Behaviors invalid → retry WITHOUT behaviors (keep interests)');
          const res2 = await makeRequest(patched, goal, campId);
          this.logger.log(`✅ AdSet created (no behaviors): ${res2.data.id}`);
          return { id: res2.data.id };
        }
      }

      // radius lỗi → set radius=50mi
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

      // Advantage flag thiếu
      if (sub === 1870227 || /Advantage Audience Flag Required/i.test(msg)) {
        const patched = { ...currentPayload, targeting_automation: { advantage_audience: 1 } }
        this.logger.warn('⚠️ Advantage flag missing → retry with advantage_audience=1')
        const res4 = await makeRequest(patched, goal, campId)
        this.logger.log(`✅ AdSet created (advantage=1): ${res4.data.id}`)
        return { id: res4.data.id }
      }

      // Incompatible goal: nới dần
      if (/performance goal|mục tiêu hiệu quả|incompatible/i.test(msg)) {
        let patched = { ...currentPayload };

        if (patched?.flexible_spec?.some((fs: any) => fs.behaviors)) {
          const flex = patched.flexible_spec.map((fs: any) => {
            if (fs.behaviors) { const { behaviors, ...rest } = fs; return rest; }
            return fs;
          }).filter((fs: any) => Object.keys(fs).length);
          patched = { ...patched, flexible_spec: flex };
          this.logger.warn('⚠️ Incompatible → retry WITHOUT behaviors (keep interests)');
          try {
            const resB1 = await makeRequest(patched, goal, campId);
            this.logger.log(`✅ AdSet created (no behaviors): ${resB1.data.id}`);
            return { id: resB1.data.id };
          } catch { }
        }

        const hasInterests = patched?.flexible_spec?.some((fs: any) => Array.isArray(fs.interests) && fs.interests.length);
        if (hasInterests) {
          const flex = patched.flexible_spec.map((fs: any) => {
            if (Array.isArray(fs.interests)) {
              return { interests: fs.interests.slice(0, 5) };
            }
            return fs;
          });
          const patched2 = { ...patched, flexible_spec: flex };
          this.logger.warn('⚠️ Incompatible → retry with TOP-5 interests only');
          try {
            const resB2 = await makeRequest(patched2, goal, campId);
            this.logger.log(`✅ AdSet created (top-5 interests): ${resB2.data.id}`);
            return { id: resB2.data.id };
          } catch { }
        }

        if (patched?.flexible_spec) {
          const { flexible_spec, ...rest } = patched;
          this.logger.warn('⚠️ Incompatible → retry BROAD (no flexible_spec)');
          const resB3 = await makeRequest(rest, goal, campId);
          this.logger.log(`✅ AdSet created (broad): ${resB3.data.id}`);
          return { id: resB3.data.id };
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



  /** ===================== Fallback Awareness (pixel) ===================== */
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
      targeting: JSON.stringify(this.normalizeTargetingForCreation(targeting)),
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
  // ===== helpers: multi units =====
  private zip<T>(...arrs: T[][]): T[][] {
    const max = Math.max(...arrs.map(a => a?.length ?? 0));
    const out: T[][] = [];
    for (let i = 0; i < max; i++) out.push(arrs.map(a => a?.[i]));
    return out;
  }

  private adName(i: number, total: number, base: string) {
    const digits = String(total).length;
    return `#${String(i + 1).padStart(digits, '0')} - ${base}`;
  }

  /** ===================== Creative (single) ===================== */
  private async createSingleCreativeByDto(
    dto0: CreateFacebookAdDto,
    adAccountId: string,
    pageId: string,
    fb: AxiosInstance,
  ): Promise<string> {
    try {
      const dto = dto0 as AnyDto

      if (dto.goal === AdsGoal.LEADS) {
        let formId = dto.leadgenFormId
        if (!formId) {
          formId = await this.ensureLeadFormId(pageId, fb, dto.campaignName)
          if (!formId) throw new BadRequestException('Thiếu leadgenFormId và không thể tạo/tìm Instant Form nào trên Page.')
          this.logger.log(`Using leadgenFormId=${formId}`)
        }

        let image_hash: string | undefined
        if (dto.imageHash) image_hash = dto.imageHash
        else if (dto.imageUrl) { try { image_hash = await this.uploadAdImageFromUrl(adAccountId, dto.imageUrl, fb) } catch { } }

        const call_to_action: any = { type: 'LEARN_MORE', value: { lead_gen_form_id: formId } }
        const link_data: any = { link: 'https://www.facebook.com/', message: dto.caption || '', call_to_action }
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
        else if (dto.imageUrl) { try { image_hash = await this.uploadAdImageFromUrl(adAccountId, dto.imageUrl, fb) } catch { } }

        const link_data: any = { link, message: dto.caption || '', call_to_action: { type: 'LEARN_MORE', value: { link } } }
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
        } else if (destination === 'INSTAGRAM_DIRECT') {
          call_to_action = { type: 'INSTAGRAM_MESSAGE', value: { app_destination: 'INSTAGRAM' } }
        } else {
          call_to_action = { type: 'MESSAGE_PAGE', value: { app_destination: 'MESSENGER' } }
        }

        const linkUrl = dto.linkUrl || dto.urlWebsite || 'https://www.alloneads.com/'
        const object_story_spec = { page_id: pageId, link_data: { link: linkUrl, message: dto.caption || '', image_hash: imgHash, call_to_action } }

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

  /** ===================== Insights & listing ===================== */
  private uniq<T>(arr: T[]): T[] { return Array.from(new Set(arr)); }
  private sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

  private async fetchCampaignInsights(args: {
    apiVersion: string;
    adAccountId: string;
    fb: AxiosInstance;
    datePreset: string;
  }) {
    const { adAccountId, fb, datePreset } = args;
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

  private async fetchAdsetTargetingBatch(args: { apiVersion: string; fb: AxiosInstance; adsetIds: string[]; }) {
    const { fb, adsetIds } = args;
    const out: Record<string, { effective?: any; raw?: any }> = {};
    const ids = [...adsetIds];
    const CONCURRENCY = 4;

    const worker = async () => {
      while (ids.length) {
        const id = ids.shift()!;
        try {
          this.logger.log(`STEP fetchAdsetTargeting → GET /${id}?fields=id,name,effective_targeting,targeting`)
          const { data } = await fb.get(`/${id}`, { params: { fields: 'id,name,effective_targeting,targeting' }, timeout: 30_000 });
          out[id] = { effective: data?.effective_targeting ?? null, raw: data?.targeting ?? null };
        } catch (e: any) {
          this.logger.error(`fetchAdsetTargetingBatch error ${id}: ${JSON.stringify(e?.response?.data || e)}`);
          out[id] = { effective: null, raw: null };
        }
        await this.sleep(120);
      }
    };

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, adsetIds.length) }, worker));
    return out;
  }

  private renderLocationSummary(tg: any) {
    const geo = tg?.geo_locations || {};
    if (Array.isArray(geo.custom_locations) && geo.custom_locations.length) {
      const items = geo.custom_locations
        .slice(0, 3)
        .map((loc: any) => {
          const lat = Number(loc.latitude);
          const lng = Number(loc.longitude);
          const radius = Number(loc.radius);
          const unit = String(loc.distance_unit || 'mile');
          const latStr = Number.isFinite(lat) ? lat.toFixed(4) : '?';
          const lngStr = Number.isFinite(lng) ? lng.toFixed(4) : '?';
          const rStr = Number.isFinite(radius) ? `${radius} ${unit}` : '';
          return `${latStr},${lngStr}${rStr ? ` (${rStr})` : ''}`;
        });
      return { type: 'custom_locations', text: items.join(' • '), raw: geo.custom_locations };
    }
    if (Array.isArray(geo.cities) && geo.cities.length) {
      const items = geo.cities.slice(0, 3).map((c: any) => c?.name || c?.key || 'City');
      return { type: 'cities', text: items.join(' • '), raw: geo.cities };
    }
    if (Array.isArray(geo.countries) && geo.countries.length) {
      return { type: 'countries', text: geo.countries.slice(0, 5).join(', '), raw: geo.countries };
    }
    return { type: 'none', text: 'Không giới hạn', raw: null };
  }

  async listAds(opts: ListOpts = {}, config: any) {
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
          if (proas && proas.value != null && !Number.isNaN(Number(proas.value))) roasVals.push(Number(proas.value));
          if (r.ctr != null && !Number.isNaN(Number(r.ctr))) ctrVals.push(Number(r.ctr));
        }

        const avgROAS = roasVals.length ? (roasVals.reduce((a, b) => a + b, 0) / roasVals.length) : null;
        const avgCTR = ctrVals.length ? (ctrVals.reduce((a, b) => a + b, 0) / ctrVals.length) : null;
        const cpl = leads > 0 ? (spend / leads) : null;

        let metric: number | null = null;
        if (rankBy === 'roas') metric = avgROAS ?? (avgCTR ?? 0);
        else if (rankBy === 'cpl') metric = cpl != null ? -cpl : (avgCTR != null ? avgCTR : 0);
        else if (rankBy === 'ctr') metric = avgCTR ?? 0;

        scored.push({ campaign_id: campId, campaign_name: name, metric: metric ?? 0, meta: { avg_roas: avgROAS, cpl, ctr: avgCTR, spend } });
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
      const adsetTargeting = await this.fetchAdsetTargetingBatch({ apiVersion, fb, adsetIds: adsetsOfTop });

      const summarizeTargeting = (items: Array<{ targeting: any }>) => {
        const countries = new Set<string>();
        const cities: Array<{ key: string; name?: string }> = [];
        const customLocs: Array<{ lat: number; lng: number; radius: number; unit: string }> = [];
        const age = { min: Infinity, max: -Infinity };
        const genders = new Set<number>();
        const interestMap = new Map<string, string>();

        const collect = (tg: any) => {
          if (!tg) return;
          const geo = tg.geo_locations || {};
          (geo.countries || []).forEach((c: string) => countries.add(c));
          (geo.cities || []).forEach((c: any) => cities.push({ key: String(c.key ?? c.name ?? ''), name: c.name }));

          if (Array.isArray(geo.custom_locations)) {
            for (const loc of geo.custom_locations) {
              const lat = Number(loc.latitude);
              const lng = Number(loc.longitude);
              const radius = Number(loc.radius);
              const unit = String(loc.distance_unit || 'mile');
              if (!Number.isNaN(lat) && !Number.isNaN(lng) && !Number.isNaN(radius)) {
                customLocs.push({ lat, lng, radius, unit });
              }
            }
          }

          if (typeof tg.age_min === 'number') age.min = Math.min(age.min, tg.age_min);
          if (typeof tg.age_max === 'number') age.max = Math.max(age.max, tg.age_max);
          (tg.genders || []).forEach((g: number) => genders.add(g));

          if (Array.isArray(tg.interests)) {
            tg.interests.forEach((i: any) => {
              const id = String(i?.id ?? ''); if (id) interestMap.set(id, i.name || id);
            });
          }
          if (Array.isArray(tg.flexible_spec)) {
            for (const fs of tg.flexible_spec) {
              if (Array.isArray(fs?.interests)) {
                fs.interests.forEach((i: any) => {
                  const id = String(i?.id ?? ''); if (id) interestMap.set(id, i.name || id);
                });
              }
            }
          }
        };

        for (const it of items) {
          const tgt = (it as any).targeting;
          collect(tgt?.effective || tgt?.raw || tgt);
        }

        return {
          countries: Array.from(countries),
          cities: cities.slice(0, 10),
          custom_locations: customLocs.slice(0, 10),
          age_min: age.min === Infinity ? null : age.min,
          age_max: age.max === -Infinity ? null : age.max,
          genders: Array.from(genders),
          interests: Array.from(interestMap).slice(0, 15).map(([id, name]) => ({ id, name })),
        };
      };

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

      const top3Campaigns = top3.map(x => {
        const adsets = adsetsByCamp[x.campaign_id] || [];
        const summary = summarizeTargeting(adsets);

        let locationText = 'Không giới hạn';
        if (summary.custom_locations?.length) {
          locationText = summary.custom_locations
            .slice(0, 3)
            .map((l) => `${l.lat.toFixed(4)},${l.lng.toFixed(4)} (${l.radius} ${l.unit})`)
            .join(' • ');
        } else if (summary.cities?.length) {
          locationText = summary.cities.slice(0, 3).map(c => c.name || c.key).join(' • ');
        } else if (summary.countries?.length) {
          locationText = summary.countries.slice(0, 5).join(', ');
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
        };
      });

      this.logger.log(`STEP listAds DONE: total=${all.length} top3=${top3.length}`)
      return { count: all.length, items: all, top3Campaigns };

    } catch (err: any) {
      const apiErr = err?.response?.data || err;
      this.logger.error(`listAds error: ${JSON.stringify(apiErr)}`);
      throw new InternalServerErrorException(apiErr);
    }
  }

}
