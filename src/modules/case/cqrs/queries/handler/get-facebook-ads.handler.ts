import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import _ from 'lodash'
import { AnalysisFb } from '@models/analysis-fb.entity'
import { User } from '@models/user.entity'
import { GetFacebookAdsQuery } from '../impl/get-facebook-ads.query'
import { FacebookAd } from '@models/facebook-ad.entity'
import { Logger } from '@nestjs/common'
import axios from 'axios'
import moment from 'moment-timezone'

const formatCurrency = (v) => Number(v).toLocaleString('en-US') // 1,234,567
const format2 = (v) => Number(v).toFixed(2) // 2 chữ số thập phân

const INSIGHTS_FIELDS = [
  'date_start',
  'date_stop',
  'impressions',
  'reach',
  'frequency',
  'spend',
  'cpm',
  'cpc',
  'ctr',
  'clicks',
  'inline_link_clicks',
  'actions',
  'action_values',
  'video_avg_time_watched_actions',
  'purchase_roas',
].join(',')

const toNumber = (v: any) => {
  if (v === null || v === undefined) return 0
  if (typeof v === 'number') return v
  const s = String(v).replace(/,/g, '')
  const n = Number(s)
  return Number.isFinite(n) ? n : 0
}

@QueryHandler(GetFacebookAdsQuery)
export class GetFacebookAdsQueryHandler implements IQueryHandler<GetFacebookAdsQuery> {
  private readonly logger = new Logger(`${GetFacebookAdsQueryHandler.name}`)

  constructor(
    @InjectRepository(FacebookAd)
    private readonly facebookAdRepo: Repository<FacebookAd>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  async execute(q: GetFacebookAdsQuery): Promise<any> {
    const { filter, user } = q
    const userData = await this.userRepo.findOne({ where: { email: user.email } })

    const query = this.facebookAdRepo
      .createQueryBuilder('facebook_ads')
      .leftJoinAndSelect('facebook_ads.createdBy', 'createdBy')
      .where('facebook_ads.createdBy.id = :updatedById', { updatedById: userData?.id })
      .orderBy('facebook_ads.createdAt', 'DESC')

    if (filter?.filter?.pageSize && filter?.filter?.page) {
      const skip = (filter.filter.page - 1) * filter.filter.pageSize
      query.take(filter.filter.pageSize).skip(skip)
    }

    const [data, total] = await query.getManyAndCount()

    // ---- helpers ----
    const buildFallbackRow = (ad: any, index: number, status = 'PAUSED') => ({
      key: ad?.key ?? index + 1,
      adId: ad?.adId,
      campaignName: ad?.campaignName,
      status,
      data: { impressions: 0, clicks: 0, spend: 0, ctr: 0, cpm: 0 },
    })

    const fetchOne = async (ad: any, index: number) => {
      const token = ad?.createdBy?.accessTokenUser
      if (!token || !ad?.adId) {
        return buildFallbackRow(ad, index, 'PAUSED')
      }

      try {
        // gọi song song status + insights cho nhanh
        const [statusRes, insightsRes] = await Promise.all([
          axios.get(`https://graph.facebook.com/v19.0/${ad.adId}`, {
            params: { fields: 'status', access_token: token },
            timeout: 15000,
          }),
          axios.get(`https://graph.facebook.com/v19.0/${ad.adId}/insights`, {
            params: { fields: INSIGHTS_FIELDS, date_preset: 'maximum', access_token: token },
            timeout: 20000,
          }),
        ])

        const status =
          typeof statusRes?.data?.status === 'string' ? statusRes.data.status : 'PAUSED'

        const fb = insightsRes?.data?.data?.[0] ?? {}
        const impressions = toNumber(fb.impressions)
        const clicks = toNumber(fb.clicks)
        const spend = toNumber(fb.spend)
        const ctr = toNumber(fb.ctr)
        const cpm = toNumber(fb.cpm)

        return {
          key: ad?.key ?? index + 1,
          adId: ad?.adId,
          campaignName: ad?.campaignName,
          status,
          data: {
            impressions,
            clicks,
            spend: formatCurrency(spend),
            ctr: format2(ctr),
            cpm: formatCurrency(format2(cpm)),
          },
        }
      } catch (error: any) {
        // log chi tiết lỗi từ FB để debug 400/403/… dễ hơn
        this.logger.error(
          `❌ Lỗi khi lấy dữ liệu cho ad ${ad?.adId}: ${
            error?.response?.data?.error?.message || error?.message
          }`,
        )
        // fallback an toàn
        return buildFallbackRow(ad, index, 'PAUSED')
      }
    }

    const settled = await Promise.allSettled(data.map((ad, i) => fetchOne(ad, i)))
    const dataAds = settled
      .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
      .map((r) => r.value)

    // Log những item bị reject (hiếm khi xảy ra vì fetchOne đã catch)
    settled
      .filter((r) => r.status === 'rejected')
      .forEach((r: any) => this.logger.error(`Rejected item: ${r?.reason}`))

    return { data: dataAds, total }
  }
}
