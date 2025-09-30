// src/meta/targeting-search.service.ts
import { Injectable, BadRequestException, Logger } from '@nestjs/common'
import axios, { AxiosInstance } from 'axios'
import { createHmac } from 'node:crypto'

/* ====================== FB client helpers ====================== */
const isServer = typeof window === 'undefined'

function buildAppSecretProof(token?: string) {
  const secret = process.env.FB_APP_SECRET
  if (!token || !secret) return undefined
  return createHmac('sha256', secret).update(token).digest('hex')
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

/* ============================ Types ============================ */
export type LocationType = 'country' | 'region' | 'city' | 'subcity' | 'neighborhood'

export interface TargetingSearchParams {
  q: string
  country_code?: string                // default 'VN'
  location_types?: string              // default '["city","region","country","subcity"]' (JSON string)
  limit?: string                       // default '10'
  version?: string                     // default 'v23.0'
}

export interface NormalizedGeoItem {
  key: string
  name: string
  type: LocationType
  country_code?: string
  country_name?: string
  region?: string
  region_id?: number
  supports_radius?: boolean
  label: string
}

export interface SelectedLocation {
  type: LocationType | 'custom'
  key?: string
  name: string
  country_code?: string
  latitude?: number
  longitude?: number
  radius?: number                      // theo đơn vị client truyền
  radiusUnit?: 'm' | 'km' | 'mi'
  distance_unit?: 'kilometer' | 'mile'
}

/* ===================== TargetingSearchService ===================== */
@Injectable()
export class TargetingSearchService {
  private readonly logger = new Logger(TargetingSearchService.name)

  /** Luôn yêu cầu truyền token của user (controller truyền vào). Không fallback ENV để đảm bảo đúng user. */
  private fb(version = 'v23.0', token?: string, cookie?: string) {
    const useToken = token || ''
    if (!useToken) {
      throw new BadRequestException('Thiếu access token: cần user.accessTokenUser.')
    }
    return createFbGraphClient({ token: useToken, cookie, version })
  }

  /** Gọi Graph API: /search?type=adgeolocation (tìm địa điểm giống Ads Manager) */
  async search(
    params: TargetingSearchParams,
    opts?: { token?: string; cookie?: string } // truyền accessTokenUser/cookie của user đang đăng nhập
  ) {
    const {
      q,
      country_code = 'VN',
      location_types = '["city","region","country","subcity"]',
      limit = '10',
      version = 'v23.0',
    } = params

    const qFinal = String(q || '').trim()
    if (!qFinal) return []

    const fb = this.fb(version, opts?.token, opts?.cookie)
    this.logger.log(`TargetingSearch → GET /search type=adgeolocation q="${qFinal}" country=${country_code}`)

    const { data } = await fb.get('/search', {
      params: {
        type: 'adgeolocation',
        q: qFinal,
        country_code,
        location_types,
        strict_name_search: true,
        limit,
      },
    })

    return Array.isArray(data?.data) ? data.data : data
  }

  /** Chuẩn hoá kết quả để FE đổ vào Select */
  normalize(items: any[] = []): NormalizedGeoItem[] {
    return items.map((it) => {
      const type = String(it.type || '').toLowerCase() as LocationType
      const supports =
        it.supports_radius ??
        ['city', 'subcity', 'neighborhood'].includes(type)
      const label = `[${type}] ${[it.name, it.region, it.country_name || it.country_code].filter(Boolean).join(' · ')}`
      return {
        key: String(it.key),
        name: it.name,
        type,
        country_code: it.country_code,
        country_name: it.country_name,
        region: it.region,
        region_id: it.region_id,
        supports_radius: !!supports,
        label,
      }
    })
  }

  /** Quy đổi bán kính về mile (1–50) (khớp với logic tạo ad) */
  private normalizeRadiusToMiles(value?: number, unit?: 'm' | 'km' | 'mi'): number | undefined {
    if (typeof value !== 'number' || isNaN(value) || value <= 0) return undefined
    let miles: number
    if (unit === 'mi') miles = value
    else if (unit === 'km') miles = value / 1.609
    else if (unit === 'm') miles = (value / 1000) / 1.609
    else {
      if (value > 2000) miles = (value / 1000) / 1.609
      else if (value > 50) miles = value / 1.609
      else miles = value
    }
    return Math.max(1, Math.min(50, Number(miles.toFixed(2))))
  }

  /** Convert selections từ FE → geo_locations chuẩn Graph API */
  toGeoLocations(selections: SelectedLocation[]) {
    const countries: string[] = []
    const regions: any[] = []
    const cities: any[] = []
    const subcities: any[] = []
    const custom_locations: any[] = []

    for (const s of selections || []) {
      if (s.type === 'country' && s.country_code) {
        if (!countries.includes(s.country_code)) countries.push(s.country_code)
      } else if (s.type === 'region') {
        if (s.key) regions.push({ key: s.key })
      } else if (s.type === 'city') {
        if (s.key) {
          const radius = this.normalizeRadiusToMiles(s.radius, s.radiusUnit)
          if (typeof radius === 'number') cities.push({ key: s.key, radius, distance_unit: 'mile' })
          else cities.push({ key: s.key })
        }
      } else if (s.type === 'subcity' || s.type === 'neighborhood') {
        if (s.key) {
          const radius = this.normalizeRadiusToMiles(s.radius, s.radiusUnit)
          if (typeof radius === 'number') subcities.push({ key: s.key, radius, distance_unit: 'mile' })
          else subcities.push({ key: s.key })
        }
      } else if (s.type === 'custom') {
        if (typeof s.latitude === 'number' && typeof s.longitude === 'number') {
          const radius = this.normalizeRadiusToMiles(s.radius, s.radiusUnit) ?? 10
          custom_locations.push({
            latitude: s.latitude,
            longitude: s.longitude,
            radius,
            distance_unit: 'mile',
          })
        }
      }
    }

    const out: any = {}
    if (countries.length) out.countries = countries
    if (regions.length) out.regions = regions
    if (cities.length) out.cities = cities
    if (subcities.length) out.subcities = subcities
    if (custom_locations.length) out.custom_locations = custom_locations

    if (!Object.keys(out).length) out.countries = ['VN'] // fallback
    return out
  }
}
