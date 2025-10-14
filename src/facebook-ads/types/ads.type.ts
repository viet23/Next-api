import { CreateFacebookAdDto } from '../dto/facebook-ads.dto'

export type TargetingSpec = Record<string, any>
export type MediaKind = 'video' | 'photo' | 'link' | 'status' | 'unknown'

export type PlacementsInput = {
  publisher_platforms?: string[]
  facebook_positions?: string[]
  instagram_positions?: string[]
  messenger_positions?: string[]
  audience_network_positions?: string[]
  device_platforms?: Array<'mobile' | 'desktop'>
}

export type GeoLocationsInput = {
  countries?: string[]
  cities?: Array<{ key: string; radius?: number; distance_unit?: 'mile' | 'kilometer' }>
  custom_locations?: Array<{
    latitude: number
    longitude: number
    radius: number
    distance_unit?: 'mile' | 'kilometer'
  }>
  regions?: any[]
  location_types?: string[]
}

export type AnyDto = CreateFacebookAdDto & {
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
  numAds?: number // số lượng ads muốn tạo, mặc định 1
  /** gợi ý AI (tiếng Anh) */
  targetingAI?: {
    keywordsForInterestSearch?: string[]
    behaviors?: Array<{ id: string; name?: string }>
    // các key tiếng Việt có thể nằm trong targetingAI.mẫu_targeting
    mẫu_targeting?: {
      sở_thích?: Array<{ mã: string; tên?: string }>
      hành_vi?: Array<{ mã: string; tên?: string }>
      giới_tính?: number[]
      tuổi_tối_thiểu?: number
      tuổi_tối_đa?: number
      vị_trí_địa_lý?: { quốc_gia?: string[] }
    }
  }
  /** NEW: đơn vị bán kính client truyền vào (m/km/mi) */
  radiusUnit?: 'm' | 'km' | 'mi'
  /** Cho phép truyền placements chi tiết */
  placements?: PlacementsInput | string[]
  /** Cho phép truyền geo_locations thô (cities + custom_locations) */
  geo_locations?: GeoLocationsInput
}

export type ListOpts = {
  fields?: string[]
  effective_status?: string[]
  limit?: number
  apiVersion?: string
  rankBy?: 'roas' | 'cpl' | 'ctr'
  datePreset?: string // 'last_7d', 'last_30d', 'today'
}
