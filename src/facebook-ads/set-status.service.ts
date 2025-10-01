// src/meta/targeting-search.service.ts
import { Injectable, BadRequestException, Logger } from '@nestjs/common'
import { CreateFacebookAdDto } from './dto/facebook-ads.dto'
import qs from 'qs'
import { InjectRepository } from '@nestjs/typeorm';
import { User } from '@models/user.entity';
import { Repository } from 'typeorm';
import { FacebookAd } from '@models/facebook-ad.entity';
import axios, { AxiosInstance } from 'axios'
import crypto from 'node:crypto'

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
export class SetStatusService {
    constructor(

        @InjectRepository(User) private readonly userRepo: Repository<User>,
        @InjectRepository(FacebookAd) private readonly facebookAdRepo: Repository<FacebookAd>,
    ) { }

    private readonly logger = new Logger(SetStatusService.name)

    private fb(token: string, cookie?: string, version = 'v23.0', timeoutMs = 20_000) {
        return createFbGraphClient({ token, cookie, version, timeoutMs })
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

    async setAdStatus(params: { adId: string; isActive: boolean; user: User; dto0?: AnyDto; }) {
        const { adId, isActive, user, dto0 } = params;

        try {
            this.logger.log(`STEP setAdStatus: adId=${adId} → ${isActive ? 'ACTIVE' : 'PAUSED'}`)

            const dto = (dto0 ?? {}) as AnyDto
            const userData = await this.userRepo.findOne({ where: { email: user.email } })
            if (!userData) throw new BadRequestException(`Không tìm thấy thông tin người dùng với email: ${user.email}`)

            const { accessTokenUser, accountAdsId: adAccountId, idPage: pageId, cookie: rawCookie } = userData
            if (!accessTokenUser) throw new BadRequestException(`Người dùng chưa liên kết Facebook hoặc thiếu accessTokenUser.`)
            if (!adAccountId) throw new BadRequestException(`Người dùng chưa có accountAdsId. Vui lòng kiểm tra lại.`)

            const fb = this.fb(accessTokenUser, rawCookie, 'v23.0')

            if (isActive) await this.activateAd(adId, fb)
            else await this.pauseAd(adId, fb)

            try {
                const rec = await this.facebookAdRepo.findOne({ where: { adId } })
                if (rec) { rec.status = isActive ? 'ACTIVE' : 'PAUSED'; await this.facebookAdRepo.save(rec) }
            } catch (e) {
                this.logger.warn(`DB update status warning for adId=${adId}: ${e?.message || e}`)
            }

            return { success: true, adId, status: isActive ? 'ACTIVE' : 'PAUSED', message: isActive ? 'Đã bật quảng cáo' : 'Đã tắt quảng cáo' }
        } catch (error: any) {
            const message = error?.response?.data?.error?.error_user_msg || error.message
            this.logger.error('❌ setAdStatus failed:', error?.response?.data || error)
            throw new BadRequestException(`Cập nhật trạng thái quảng cáo thất bại: ${message}`)
        }
    }
}
