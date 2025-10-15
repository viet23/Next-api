// src/meta/targeting-search.service.ts
import { Injectable, BadRequestException, Logger } from '@nestjs/common'
import { CreateFacebookAdDto } from './dto/facebook-ads.dto'
import qs from 'qs'
import { InjectRepository } from '@nestjs/typeorm'
import { User } from '@models/user.entity'
import { Repository } from 'typeorm'
import { FacebookAd } from '@models/facebook-ad.entity'
import axios, { AxiosInstance } from 'axios'
import crypto from 'node:crypto'

type PlacementsInput = {
  publisher_platforms?: string[]
  facebook_positions?: string[]
  instagram_positions?: string[]
  messenger_positions?: string[]
  audience_network_positions?: string[]
  device_platforms?: Array<'mobile' | 'desktop'>
}

type GeoLocationsInput = {
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

type AnyDto = CreateFacebookAdDto & {
  messageDestination?: 'MESSENGER' | 'WHATSAPP' | 'INSTAGRAM_DIRECT'
  whatsappNumber?: string
  imageHash?: string
  imageUrl?: string
  linkUrl?: string
  instagramActorId?: string
  leadgenFormId?: string
  aiTargeting?: boolean
  targetingAI?: {
    keywordsForInterestSearch?: string[]
    behaviors?: Array<{ id: string; name?: string }>
    mẫu_targeting?: {
      sở_thích?: Array<{ mã: string; tên?: string }>
      hành_vi?: Array<{ mã: string; tên?: string }>
      giới_tính?: number[]
      tuổi_tối_thiểu?: number
      tuổi_tối_đa?: number
      vị_trí_địa_lý?: { quốc_gia?: string[] }
    }
  }
  radiusUnit?: 'm' | 'km' | 'mi'
  placements?: PlacementsInput | string[]
  geo_locations?: GeoLocationsInput
}

const isServer = typeof window === 'undefined'
const GRAPH_VERSION = 'v23.0'

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
  const { token, cookie, version = GRAPH_VERSION, timeoutMs = 20_000 } = opts
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
export class SetStatusService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(FacebookAd) private readonly facebookAdRepo: Repository<FacebookAd>,
  ) {}

  private readonly logger = new Logger(SetStatusService.name)

  private fb(token: string, cookie?: string, version = GRAPH_VERSION, timeoutMs = 20_000) {
    return createFbGraphClient({ token, cookie, version, timeoutMs })
  }

  private async activateAd(adId: string, fb: AxiosInstance) {
    this.logger.log(`STEP activateAd → POST /${adId}`)
    await fb.post(`/${adId}`, qs.stringify({ status: 'ACTIVE' }), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
    this.logger.log(`🚀 Ad ${adId} activated.`)
  }

  private async pauseAd(adId: string, fb: AxiosInstance) {
    this.logger.log(`STEP pauseAd → POST /${adId}`)
    await fb.post(`/${adId}`, qs.stringify({ status: 'PAUSED' }), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
    this.logger.log(`⏸️  Ad ${adId} paused.`)
  }

  private async verifyStatus(adId: string, fb: AxiosInstance) {
    const { data } = await fb.get(`/${adId}`, { params: { fields: 'status,effective_status' } })
    const status: string = data?.status || ''
    const eff: string = data?.effective_status || ''
    return { status, effective_status: eff }
  }

  async setAdStatus(params: { adId: string; isActive: boolean; user: User; dto0?: AnyDto }) {
    const { adId, isActive, user, dto0 } = params

    try {
      this.logger.log(`STEP setAdStatus: adId=${adId} → ${isActive ? 'ACTIVE' : 'PAUSED'}`)

      const dto = (dto0 ?? {}) as AnyDto
      const userData = await this.userRepo.findOne({ where: { email: user.email } })
      if (!userData) throw new BadRequestException(`Không tìm thấy thông tin người dùng với email: ${user.email}`)

      // ===== Hai luồng AUTH =====
      const isInternal = !!(userData as any)?.isInternal
      const token = isInternal
        ? ((userData as any)?.internalUserAccessToken as string | undefined)
        : ((userData as any)?.accessTokenUser as string | undefined)
      const cookie = !isInternal ? ((userData as any)?.cookie as string | undefined) : undefined

      if (!token) throw new BadRequestException('Thiếu access token Facebook.')

      const fb = this.fb(token, cookie, GRAPH_VERSION)

      // ===== Đổi trạng thái (kèm retry/backoff nhẹ & xác minh) =====
      const doChange = async () => {
        const fn = isActive ? this.activateAd.bind(this) : this.pauseAd.bind(this)
        let attempt = 0
        while (true) {
          try {
            await fn(adId, fb)
            const v = await this.verifyStatus(adId, fb)
            const ok = isActive ? v.status === 'ACTIVE' || v.effective_status === 'ACTIVE' : v.status === 'PAUSED' || v.effective_status === 'PAUSED'
            if (!ok) {
              throw new Error(
                `Xác minh thất bại: status=${v.status || '—'}, effective_status=${v.effective_status || '—'}`,
              )
            }
            return v
          } catch (err: any) {
            attempt++
            const fbErr = err?.response?.data?.error
            const msg =
              fbErr?.error_user_msg ||
              fbErr?.message ||
              err?.message ||
              'Không rõ lỗi khi thay đổi trạng thái quảng cáo.'
            // một số lỗi có thể do race-condition, thử lại 1-2 lần
            if (attempt <= 2) {
              const delay = 600 * attempt
              this.logger.warn(`⚠️ Đổi trạng thái lần ${attempt} thất bại (${msg}). Thử lại sau ${delay}ms`)
              await new Promise((r) => setTimeout(r, delay))
              continue
            }
            throw new BadRequestException(msg)
          }
        }
      }

      const verified = await doChange()

      // ===== Cập nhật DB nhẹ nhàng (không chặn flow nếu lỗi) =====
      try {
        const rec = await this.facebookAdRepo.findOne({ where: { adId } })
        if (rec) {
          rec.status = isActive ? 'ACTIVE' : 'PAUSED'
          // nếu cần, có thể lưu effective_status để theo dõi
          ;(rec as any).effectiveStatus = verified.effective_status
          await this.facebookAdRepo.save(rec)
        }
      } catch (e: any) {
        this.logger.warn(`DB update status warning for adId=${adId}: ${e?.message || e}`)
      }

      return {
        success: true,
        adId,
        status: isActive ? 'ACTIVE' : 'PAUSED',
        effective_status: verified.effective_status,
        message: isActive ? 'Đã bật quảng cáo' : 'Đã tắt quảng cáo',
        auth_mode: isInternal ? 'internal' : 'external+cookie',
      }
    } catch (error: any) {
      const fbErr = error?.response?.data?.error
      const message =
        fbErr?.error_user_msg || fbErr?.message || error?.message || 'Cập nhật trạng thái quảng cáo thất bại.'
      this.logger.error('❌ setAdStatus failed:', error?.response?.data || error)
      throw new BadRequestException(`Cập nhật trạng thái quảng cáo thất bại: ${message}`)
    }
  }
}
