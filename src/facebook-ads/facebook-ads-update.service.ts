import { Injectable, BadRequestException, Logger } from '@nestjs/common'
import axios, { AxiosInstance } from 'axios'
import qs from 'qs'
import crypto from 'node:crypto'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { AdInsight } from '@models/ad-insight.entity'
import { FacebookAd } from '@models/facebook-ad.entity'
import { AdInsightUpdateDTO } from './dto/ads-update.dto'

/** KHÔNG dùng cookie */
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
  const client = axios.create({
    baseURL: `https://graph.facebook.com/${version}`,
    timeout: timeoutMs,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
    paramsSerializer: (p) => qs.stringify(p, { arrayFormat: 'brackets' }),
  })
  client.interceptors.request.use((config) => {
    const proof = buildAppSecretProof(token)
    if (proof) config.params = { ...(config.params || {}), appsecret_proof: proof }
    return config
  })
  return client
}

type FbAdset = { id: string; name?: string; status?: string }
type FbInterest = { id: string; name: string }

function extractFbError(err: any) {
  const e = err?.response?.data?.error ?? err?.response?.data ?? err
  const fb = {
    message: e?.error_user_msg || e?.message || err?.message || 'Unknown error',
    type: e?.type,
    code: e?.code,
    error_subcode: e?.error_subcode,
    fbtrace_id: e?.fbtrace_id,
  }
  const http = {
    status: err?.response?.status,
    url: err?.config?.url,
    method: err?.config?.method,
  }
  const raw = JSON.stringify(err?.response?.data || {}, null, 2)
  const rawTrimmed = raw.length > 4000 ? raw.slice(0, 4000) + '...<truncated>' : raw
  return { fb, http, raw: rawTrimmed }
}

@Injectable()
export class FacebookAdsUpdateService {
  private readonly logger = new Logger(FacebookAdsUpdateService.name)

  constructor(
    @InjectRepository(AdInsight) private readonly adInsightRepo: Repository<AdInsight>,
    @InjectRepository(FacebookAd) private readonly facebookAdRepo: Repository<FacebookAd>,
  ) {}

  private fb(token: string, version = 'v23.0', timeoutMs = 20_000) {
    return createFbGraphClient({ token, version, timeoutMs })
  }

  /** Lấy danh sách ad set của campaign */
  private async _getAdsetsByCampaign(fb: AxiosInstance, campaignId: string) {
    const out: FbAdset[] = []
    let after: string | undefined
    this.logger.debug(`[FB] Lấy danh sách ad sets cho campaign=${campaignId}`)
    do {
      try {
        const { data } = await fb.get(`/${campaignId}/adsets`, {
          params: { fields: 'id,name,status', limit: 50, after },
        })
        this.logger.debug(`[FB] Trả về ${data?.data?.length || 0} ad sets (after=${after || 'none'})`)
        if (Array.isArray(data?.data)) out.push(...data.data)
        after = data?.paging?.cursors?.after
      } catch (err) {
        const det = extractFbError(err)
        this.logger.error(`[FB] Lỗi lấy ad sets campaign=${campaignId}: ${det.fb.message}`, det)
        throw new BadRequestException(`FB get adsets failed: ${det.fb.message}`)
      }
    } while (after)
    this.logger.debug(`[FB] Tổng cộng ${out.length} ad sets lấy được.`)
    return out
  }

  /** Tra cứu interests keyword → Facebook interest objects */
  private async _resolveInterests(fb: AxiosInstance, interests?: string[]): Promise<FbInterest[]> {
    if (!interests?.length) return []
    const results: FbInterest[] = []
    this.logger.debug(`[FB] Bắt đầu tra cứu ${interests.length} interests...`)
    for (const kw of interests) {
      try {
        const { data } = await fb.get('/search', { params: { type: 'adinterest', q: kw, limit: 1 } })
        const item = data?.data?.[0]
        if (item?.id && item?.name) {
          results.push({ id: item.id, name: item.name })
          this.logger.debug(`[FB] Found interest "${kw}" → id=${item.id}`)
        } else {
          this.logger.warn(`[FB] Không tìm thấy interest cho "${kw}"`)
        }
      } catch (err) {
        const det = extractFbError(err)
        this.logger.warn(`[FB] Lỗi khi tìm interest "${kw}": ${det.fb.message}`, det)
      }
    }
    this.logger.debug(`[FB] Tổng cộng tìm thấy ${results.length}/${interests.length} interests.`)
    return results
  }

  /** GET targeting hiện tại của ad set */
  private async _getAdsetTargeting(fb: AxiosInstance, adsetId: string): Promise<any> {
    this.logger.debug(`[FB] GET /${adsetId}?fields=targeting`)
    const { data } = await fb.get(`/${adsetId}`, { params: { fields: 'targeting' } })
    const tg = data?.targeting || {}
    this.logger.debug(`[FB] Targeting hiện tại adset=${adsetId}: ${JSON.stringify(tg)}`)
    return tg
  }

  /** Dedupe theo 'id' (fallback stringify) */
  private uniqById<T extends { id?: string }>(arr: T[] = []) {
    const seen = new Set<string>()
    return arr.filter((x) => {
      const k = x?.id ?? JSON.stringify(x)
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
  }

  /** Merge targeting: giữ nguyên mọi thứ, chỉ cập nhật age & interests */
  private mergeTargeting(existing: any, ageRange?: [number, number], interestObjs?: FbInterest[]) {
    const merged = JSON.parse(JSON.stringify(existing || {})) // clone

    // Age
    if (ageRange && ageRange.length === 2) {
      const [min, max] = ageRange
      merged.age_min = Math.max(13, Math.floor(min))
      merged.age_max = Math.min(65, Math.floor(max))
    }

    // Interests → flexible_spec
    if (interestObjs?.length) {
      if (!Array.isArray(merged.flexible_spec)) merged.flexible_spec = []
      let group = merged.flexible_spec.find((g: any) => Array.isArray(g?.interests))
      if (!group) {
        group = { interests: [] as Array<{ id: string; name?: string }> }
        merged.flexible_spec.push(group)
      }
      const current = Array.isArray(group.interests) ? group.interests : []
      const next = this.uniqById([
        ...current,
        ...interestObjs.map((i) => ({ id: i.id, name: i.name })),
      ])
      group.interests = next
    }

    // Kiểm tra ràng buộc audience tối thiểu
    const hasSomeAudience =
      (merged.custom_audiences && merged.custom_audiences.length > 0) ||
      !!merged.geo_locations ||
      (merged.publisher_platforms && merged.publisher_platforms.length > 0) ||
      (merged.facebook_positions && merged.facebook_positions.length > 0) ||
      (merged.instagram_positions && merged.instagram_positions.length > 0) ||
      (merged.audience_network_positions && merged.audience_network_positions.length > 0)

    if (!hasSomeAudience) {
      this.logger.warn(
        `[FB] Targeting sau merge KHÔNG có geo/custom/placements. Cần giữ lại targeting cũ hoặc bổ sung geo_locations/custom_audiences/placements.`
      )
    }

    this.logger.debug(`[FB] Targeting sau merge: ${JSON.stringify(merged)}`)
    return merged
  }

  /** PATCH targeting cho ad set (log chi tiết) */
  private async _updateAdsetTargeting(fb: AxiosInstance, adsetId: string, targeting: any) {
    const body = qs.stringify({ targeting: JSON.stringify(targeting) })
    this.logger.debug(`[FB] POST /${adsetId} với targeting=${JSON.stringify(targeting)}`)
    try {
      const { data } = await fb.post(`/${adsetId}`, body, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
      this.logger.debug(`[FB] ✅ Cập nhật thành công adset=${adsetId}`)
      return { adsetId, targeting, result: data }
    } catch (err) {
      const det = extractFbError(err)
      this.logger.error(
        `[FB] ❌ Update adset thất bại (adset=${adsetId}): ${det.fb.message} | type=${det.fb.type} code=${det.fb.code} sub=${det.fb.error_subcode} trace=${det.fb.fbtrace_id}`,
        { ...det, adsetId, targeting }
      )
      throw Object.assign(new Error(det.fb.message), { details: det, adsetId, targeting })
    }
  }

  // ---------- PUBLIC: chỉ cập nhật targeting ad set ----------
  async updateAdInsight(id: string, dto: AdInsightUpdateDTO) {
    this.logger.log(`\n=== updateAdInsight called with id=${id}, dto=${JSON.stringify(dto)} ===`)
    try {
      // 0) Validate & fetch records
      const adInsight = await this.adInsightRepo.findOne({ where: { id } })
      if (!adInsight) throw new BadRequestException(`Không tìm thấy AdInsight id=${id}`)
      this.logger.debug(`AdInsight tìm thấy: adId=${adInsight.adId}`)

      // chỉ lưu cục bộ isActive; KHÔNG patch campaign
      if (typeof dto.isActive === 'boolean') adInsight.isActive = dto.isActive
      let saved = adInsight // hoặc await this.adInsightRepo.save(adInsight)

      const adId = adInsight.adId
      if (!adId) throw new BadRequestException(`AdInsight id=${id} không có adId`)
      const facebookAd = await this.facebookAdRepo.findOne({
        where: { adId },
        relations: ['campaign', 'createdBy'],
      })
      if (!facebookAd) throw new BadRequestException(`Không tìm thấy FacebookAd adId=${adId}`)

      const campaignId = facebookAd.campaign?.campaignId
      if (!campaignId) throw new BadRequestException(`Không có campaignId cho adId=${adId}`)
      this.logger.debug(`FacebookAd liên kết campaignId=${campaignId}`)

      // Auth từ createdBy (NO COOKIE)
      const createdBy: any = facebookAd.createdBy
      if (!createdBy) throw new BadRequestException('Bản ghi FacebookAd không có createdBy.')
      const isInternal = !!createdBy?.isInternal
      const token: string | undefined = isInternal ? createdBy?.internalUserAccessToken : createdBy?.accessTokenUser
      if (!token) throw new BadRequestException('Thiếu access token Facebook từ createdBy.')
      this.logger.debug(`[AUTH] Mode=${isInternal ? 'internal' : 'external'} | createdBy=${createdBy?.email || createdBy?.id}`)
      const fb = this.fb(token)

      // 1) Input mới
      const ageRange = dto.targeting?.ageRange
      const interestsKw = dto.targeting?.interests
      const hasInput = (ageRange && ageRange.length === 2) || (interestsKw && interestsKw.length > 0)
      if (!hasInput) {
        this.logger.log(`Không có targeting → không cập nhật gì lên Facebook.`)
        return { ...saved, fbApplied: { adsets: [] }, fbError: null, auth_mode: isInternal ? 'internal' : 'external' }
      }

      // 2) Resolve interests → IDs
      const interestObjs = await this._resolveInterests(fb, interestsKw)

      // 3) Lấy adsets
      const adsets = await this._getAdsetsByCampaign(fb, campaignId)
      if (!adsets.length) {
        this.logger.warn(`⚠ Campaign ${campaignId} không có ad set nào.`)
        return { ...saved, fbApplied: { adsets: [] }, fbError: null, auth_mode: isInternal ? 'internal' : 'external' }
      }

      // 4) Cho từng ad set: GET current targeting → merge → validate → POST update
      const fbAdsetUpdates: any[] = []
      for (const as of adsets) {
        try {
          this.logger.log(`➡ Bắt đầu cập nhật adset ${as.id} (${as.name})`)
          const current = await this._getAdsetTargeting(fb, as.id)
          const merged = this.mergeTargeting(current, ageRange, interestObjs)

          // Validation trước khi POST (tránh FB code 100/1885364)
          const hasSomeAudience =
            (merged.custom_audiences && merged.custom_audiences.length > 0) ||
            !!merged.geo_locations ||
            (merged.publisher_platforms && merged.publisher_platforms.length > 0) ||
            (merged.facebook_positions && merged.facebook_positions.length > 0) ||
            (merged.instagram_positions && merged.instagram_positions.length > 0) ||
            (merged.audience_network_positions && merged.audience_network_positions.length > 0)

          if (!hasSomeAudience) {
            const explain =
              'Targeting sau merge thiếu geo_locations/custom_audiences/placements. Giữ lại targeting cũ hoặc bổ sung một trong các trường này.'
            this.logger.error(`[VALIDATION] ${explain}`, { adsetId: as.id, merged })
            fbAdsetUpdates.push({ adsetId: as.id, name: as.name, error_message: explain, sent_targeting: merged })
            continue
          }

          const r = await this._updateAdsetTargeting(fb, as.id, merged)
          fbAdsetUpdates.push(r)
        } catch (e: any) {
          const det = e?.details || extractFbError(e)
          const errRecord = {
            adsetId: as.id,
            name: as.name,
            error_message: det?.fb?.message || e?.message || 'Unknown error',
            error_type: det?.fb?.type,
            error_code: det?.fb?.code,
            error_subcode: det?.fb?.error_subcode,
            fbtrace_id: det?.fb?.fbtrace_id,
            http_status: det?.http?.status,
            http_url: det?.http?.url,
            http_method: det?.http?.method,
            sent_targeting: det?.targeting,
            raw: det?.raw,
          }
          this.logger.error(
            `❌ Lỗi cập nhật adset ${as.id}: ${errRecord.error_message} (type=${errRecord.error_type} code=${errRecord.error_code} sub=${errRecord.error_subcode} trace=${errRecord.fbtrace_id})`,
            errRecord
          )
          fbAdsetUpdates.push(errRecord)
        }
      }

      this.logger.log(`✅ Hoàn tất updateAdInsight id=${id}`)
      saved = await this.adInsightRepo.save(adInsight)
      return { ...saved, fbApplied: { adsets: fbAdsetUpdates }, fbError: null, auth_mode: isInternal ? 'internal' : 'external' }
    } catch (error: any) {
      const det = extractFbError(error)
      this.logger.error('❌ updateAdInsight failed: ' + det.fb.message, det)
      throw new BadRequestException(`Cập nhật quảng cáo thất bại: ${det.fb.message}`)
    }
  }
}
