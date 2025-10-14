// src/utils/facebook-helpers.ts
/**
 * Facebook helpers (mapping & util)
 * Reusable functions for mapping goals, placements, validations, radius normalization, etc.
 */

import { MediaKind } from './types/ads.type'

export type GenderInput = 'all' | 'male' | 'female'

export type PlacementsInput = {
  publisher_platforms?: string[]
  facebook_positions?: string[]
  instagram_positions?: string[]
  messenger_positions?: string[]
  audience_network_positions?: string[]
  device_platforms?: Array<'mobile' | 'desktop'>
  [k: string]: any
}

/** AdsGoal enum — dùng enum cho readability, hàm vẫn chấp nhận string tương đương */
export enum AdsGoal {
  TRAFFIC = 'TRAFFIC',
  ENGAGEMENT = 'ENGAGEMENT',
  LEADS = 'LEADS',
  MESSAGE = 'MESSAGE',
  AWARENESS = 'AWARENESS', // fallback
}

/** ===================== Gender mapping ===================== */
export function mapGender(g?: GenderInput): number[] | undefined {
  if (!g || g === 'all') return undefined
  if (g === 'male') return [1] // FB: 1=male
  if (g === 'female') return [2] // FB: 2=female
  return undefined
}

/** ===================== Placements helpers ===================== */
export function normalizePlacements(input?: PlacementsInput | string[]): PlacementsInput | undefined {
  if (!input) return undefined
  if (!Array.isArray(input)) return input as PlacementsInput

  const out: PlacementsInput = {}
  const pp = new Set<string>()
  const fbPos = new Set<string>()
  const igPos = new Set<string>()
  const msPos = new Set<string>()
  const anPos = new Set<string>()
  const devs = new Set<'mobile' | 'desktop'>()

  for (const raw of input) {
    const t = String(raw || '')
      .toLowerCase()
      .trim()

    if (t.startsWith('facebook')) pp.add('facebook')
    if (t.startsWith('instagram') || t === 'reels' || t.includes('ig')) pp.add('instagram')
    if (t.startsWith('messenger')) pp.add('messenger')
    if (t.includes('audience_network') || t === 'audience_network') pp.add('audience_network')

    if (t.includes('feed')) fbPos.add('feed')
    if (t.includes('profile') || t.includes('profile_feed')) fbPos.add('profile_feed')
    if (t.includes('marketplace')) fbPos.add('marketplace')
    if (t.includes('instream') || t.includes('video')) fbPos.add('instream_video')
    if (t.includes('search')) fbPos.add('search')
    if (t.includes('reels')) fbPos.add('facebook_reels')
    if (t.includes('story')) fbPos.add('story')

    if (t.includes('ig_stream') || t.includes('instagram_stream') || t.includes('stream')) igPos.add('stream')
    if (t.includes('ig_story') || (t.includes('instagram') && t.includes('story'))) igPos.add('story')
    if (t.includes('ig_reels') || (t.includes('instagram') && t.includes('reels'))) igPos.add('reels')
    if (t.includes('explore')) igPos.add('explore')

    if (t.includes('messenger_home')) msPos.add('messenger_home')
    if (t.includes('sponsored_messages')) msPos.add('sponsored_messages')

    if (t.includes('in_stream_video')) anPos.add('in_stream_video')
    if (t.includes('native') || t.includes('banner') || t.includes('interstitial')) anPos.add('classic')

    if (t.includes('desktop')) devs.add('desktop')
    if (t.includes('mobile')) devs.add('mobile')
  }

  if (pp.size) out.publisher_platforms = Array.from(pp)
  if (fbPos.size) out.facebook_positions = Array.from(fbPos)
  if (igPos.size) out.instagram_positions = Array.from(igPos)
  if (msPos.size) out.messenger_positions = Array.from(msPos)
  if (anPos.size) out.audience_network_positions = Array.from(anPos)
  if (devs.size) out.device_platforms = Array.from(devs)

  return out
}

export function mapPlacements(
  goal: AdsGoal | string,
  opts?: { disableInstagram?: boolean; manual?: PlacementsInput },
): PlacementsInput {
  if (opts?.manual) {
    const m: PlacementsInput = { ...(opts.manual || {}) }
    const pp = new Set(m.publisher_platforms || [])
    if (m.facebook_positions?.length) pp.add('facebook')
    if (m.instagram_positions?.length) pp.add('instagram')
    if (m.messenger_positions?.length) pp.add('messenger')
    if (m.audience_network_positions?.length) pp.add('audience_network')
    if (pp.size) m.publisher_platforms = Array.from(pp)
    return m
  }

  const base: PlacementsInput = {
    publisher_platforms: ['facebook', 'messenger'],
    facebook_positions: ['feed', 'profile_feed', 'search'],
    messenger_positions: ['messenger_home'],
  }

  if (opts?.disableInstagram) {
    return base
  }

  return {
    ...base,
    publisher_platforms: ['facebook', 'instagram', 'messenger'],
    instagram_positions: ['stream', 'story', 'reels'],
  }
}

/** ===================== Campaign / adset mapping ===================== */

/**
 * Map AdsGoal -> campaign objective constant (string) used by your system / FB perf layer.
 * Adjust returns if your BE expects different constants.
 */
export function mapCampaignObjective(goal: AdsGoal | string): string {
  const g = String(goal).toUpperCase()
  switch (g) {
    case AdsGoal.TRAFFIC:
    case 'TRAFFIC':
      return 'OUTCOME_TRAFFIC'
    case AdsGoal.ENGAGEMENT:
    case 'ENGAGEMENT':
      return 'OUTCOME_ENGAGEMENT'
    case AdsGoal.LEADS:
    case 'LEADS':
      return 'OUTCOME_LEADS'
    case AdsGoal.MESSAGE:
    case 'MESSAGE':
      return 'OUTCOME_SALES'
    default:
      return 'OUTCOME_AWARENESS'
  }
}

/**
 * Map AdsGoal -> adset optimization payload (optimization_goal, billing_event, bid_strategy).
 * Returns a plain object you can spread into adset creation body.
 */
export function mapAdsetOptimization(goal: AdsGoal | string) {
  const g = String(goal).toUpperCase()
  switch (g) {
    case AdsGoal.TRAFFIC:
    case 'TRAFFIC':
      return { optimization_goal: 'LINK_CLICKS', billing_event: 'IMPRESSIONS', bid_strategy: 'LOWEST_COST_WITHOUT_CAP' }
    case AdsGoal.ENGAGEMENT:
    case 'ENGAGEMENT':
      return {
        optimization_goal: 'PROFILE_AND_PAGE_ENGAGEMENT',
        billing_event: 'IMPRESSIONS',
        bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      }
    case AdsGoal.LEADS:
    case 'LEADS':
      return {
        optimization_goal: 'LEAD_GENERATION',
        billing_event: 'IMPRESSIONS',
        bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      }
    case AdsGoal.MESSAGE:
    case 'MESSAGE':
      return {
        optimization_goal: 'CONVERSATIONS',
        billing_event: 'IMPRESSIONS',
        bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      }
    default:
      return { optimization_goal: 'REACH', billing_event: 'IMPRESSIONS', bid_strategy: 'LOWEST_COST_WITHOUT_CAP' }
  }
}

/** ===================== Performance Goal Sequences ===================== */
/**
 * Returns ordered preference list (unique) for performance goals for MESSAGE flow.
 */
export function getPerfGoalSequenceForMessage(initial: string): string[] {
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

/**
 * Returns ordered preference list for ENGAGEMENT flow. If media !== 'video', remove THRUPLAY.
 */
export function getPerfGoalSequenceForEngagement(initial: string, media: MediaKind): string[] {
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
  if (media !== 'video') seq = seq.filter((g) => g !== 'THRUPLAY')
  return seq
}

export function getPerfGoalSequenceForTraffic(initial: string): string[] {
  const seq = ['LINK_CLICKS', 'LANDING_PAGE_VIEWS', 'AUTOMATIC_OBJECTIVE']
  return Array.from(new Set([initial, ...seq].filter(Boolean)))
}

export function getPerfGoalSequenceForLeads(initial: string): string[] {
  const seq = ['LEAD_GENERATION', 'QUALITY_LEAD', 'SUBSCRIBERS', 'AUTOMATIC_OBJECTIVE']
  return Array.from(new Set([initial, ...seq].filter(Boolean)))
}

/** ===================== Misc utils ===================== */

/** Validate ISO time string (throws BadRequestException-like error if invalid).
 * Note: this helper throws Error to keep it framework-agnostic; caller can map to BadRequestException.
 */
export function validateIsoTime(label: string, val?: string) {
  if (!val) return
  if (isNaN(Date.parse(val))) throw new Error(`${label} không đúng định dạng ISO 8601`)
}

/**
 * Normalize radius to miles (1-50). Accepts value and optional unit 'm'|'km'|'mi'.
 */
export function normalizeRadiusToMiles(value?: number, unit?: 'm' | 'km' | 'mi'): number | undefined {
  if (typeof value !== 'number' || isNaN(value) || value <= 0) return undefined

  let miles: number
  if (unit === 'mi') miles = value
  else if (unit === 'km') miles = value / 1.609
  else if (unit === 'm') miles = value / 1000 / 1.609
  else {
    if (value > 2000)
      miles = value / 1000 / 1.609 // coi là mét
    else if (value > 50)
      miles = value / 1.609 // coi là km
    else miles = value // coi là mile
  }

  return Math.max(1, Math.min(50, Number(miles.toFixed(2))))
}
