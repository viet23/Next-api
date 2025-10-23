// src/utils/facebook-helpers.ts
/**
 * Facebook helpers (mapping & util)
 * Reusable functions for mapping goals, placements, validations, radius normalization, etc.
 */

import { MediaKind, TargetingSpec } from './types/ads.type'

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
    'REACH',
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

/**
 * Tạo một entry cho flexible_spec từ chunk { interests?, behaviors? }.
 * Trả về null nếu không có gì để thêm.
 */
export function createFlexEntry(chunk: { interests?: any[]; behaviors?: any[] }) {
  const entry: Record<string, any> = {}
  if (Array.isArray(chunk.interests) && chunk.interests.length) entry.interests = [...chunk.interests]
  if (Array.isArray(chunk.behaviors) && chunk.behaviors.length) entry.behaviors = [...chunk.behaviors]
  return Object.keys(entry).length ? entry : null
}

/**
 * Normalize để dùng khi tạo targeting cho API:
 * - Gom interests/behaviors vào flexible_spec nếu tồn tại
 * - Không mutate input, trả về object mới
 */
export function normalizeTargetingForCreation(t?: TargetingSpec): TargetingSpec {
  const inSpec: TargetingSpec = t ? { ...t } : {}
  // copy existing flexible_spec (immutably)
  const existingFlex: any[] = Array.isArray(inSpec.flexible_spec) ? [...inSpec.flexible_spec] : []

  // tạo entry từ interests/behaviors (nếu có)
  const entry = createFlexEntry({ interests: inSpec.interests, behaviors: inSpec.behaviors })
  if (entry) {
    existingFlex.push(entry)
    // remove legacy props
    delete inSpec.interests
    delete inSpec.behaviors
  }

  if (existingFlex.length) inSpec.flexible_spec = existingFlex
  else delete inSpec.flexible_spec

  return inSpec
}

/**
 * Merge một chunk {interests?, behaviors?} vào flexible_spec của targeting.
 * Trả về object mới (không mutate input).
 */
type FlexChunk = {
  interests?: Array<{ id: string; name?: string }>
  behaviors?: Array<{ id: string; name?: string }>
}

export function mergeFlex(t?: TargetingSpec, chunk?: FlexChunk): TargetingSpec {
  console.log(`mergeFlex called with chunk:`, chunk)

  // clone nông targeting gốc
  const base: TargetingSpec = t ? { ...t } : {}

  // Lấy flexible_spec hiện có (clone nông), hoặc tạo mảng rỗng
  const flex: any[] = Array.isArray(base.flexible_spec)
    ? base.flexible_spec.map(g => ({ ...g }))
    : []

  // Đảm bảo luôn có 1 group đầu tiên để OR-merge
  const g0: any = flex[0] || (flex[0] = {})

  // Merge interests
  if (chunk?.interests?.length) {
    const existing = new Map<string, any>(
      Array.isArray(g0.interests)
        ? g0.interests.map((i: any) => [String(i.id), i])
        : []
    )
    for (const it of chunk.interests) {
      if (it && it.id) existing.set(String(it.id), it)
    }
    g0.interests = Array.from(existing.values())
  }

  // Merge behaviors
  if (chunk?.behaviors?.length) {
    const existing = new Map<string, any>(
      Array.isArray(g0.behaviors)
        ? g0.behaviors.map((i: any) => [String(i.id), i])
        : []
    )
    for (const it of chunk.behaviors) {
      if (it && it.id) existing.set(String(it.id), it)
    }
    g0.behaviors = Array.from(existing.values())
  }

  // Nếu group đầu tiên rỗng (không có interests/behaviors), xoá nó
  const isG0Empty = !g0.interests?.length && !g0.behaviors?.length
  if (isG0Empty) flex.splice(0, 1)

  // Gán lại flexible_spec hoặc xoá nếu rỗng
  if (flex.length) base.flexible_spec = flex
  else delete base.flexible_spec

  return base
}
