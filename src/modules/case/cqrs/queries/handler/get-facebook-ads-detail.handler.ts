import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { User } from '@models/user.entity'
import { FacebookAd } from '@models/facebook-ad.entity'
import { Logger } from '@nestjs/common'
import axios from 'axios'
import crypto from 'node:crypto'
import { FacebookCampaign } from '@models/facebook_campaign.entity'
import { GetFacebookAdsHistoryQuery } from '../impl/get-facebook-ads-detatil.query'

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
const formatCurrency = (v: any) => Number(v).toLocaleString('en-US')
const format2 = (v: any) => Number(v).toFixed(2)
const isServer = typeof window === 'undefined'

function buildAppSecretProof(token?: string) {
  const secret = process.env.FB_APP_SECRET
  if (!token || !secret) return undefined
  return crypto.createHmac('sha256', secret).update(token).digest('hex')
}

@QueryHandler(GetFacebookAdsHistoryQuery)
export class GetFacebookAdsHistoryQueryHandler implements IQueryHandler<GetFacebookAdsHistoryQuery> {
  private readonly logger = new Logger(`${GetFacebookAdsHistoryQueryHandler.name}`)

  constructor(
    @InjectRepository(FacebookCampaign)
    private readonly facebookCampaignRepo: Repository<FacebookCampaign>,
    @InjectRepository(FacebookAd)
    private readonly facebookAdRepo: Repository<FacebookAd>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  async execute(q: GetFacebookAdsHistoryQuery): Promise<any> {
    const { id } = q
    const userData = await this.userRepo.findOne({ where: { id: id } })

    // ===== 1) Lấy danh sách Campaign của user (kèm ads) =====
    const qb = this.facebookCampaignRepo
      .createQueryBuilder('campaign')
      .leftJoinAndSelect('campaign.createdBy', 'createdBy')
      .leftJoinAndSelect('campaign.ads', 'ads')
      .where('createdBy.id = :uid', { uid: userData?.id })
      .orderBy('campaign.createdAt', 'DESC')

    // Phân trang theo campaign (mặc định lấy nhiều để lịch sử)
    let page = 1
    let pageSize = 100

    qb.take(pageSize).skip((page - 1) * pageSize)

    const [campaigns, campaignTotal] = await qb.getManyAndCount()

    // ===== 2) Chuẩn bị FB client per user (dùng cho insights của từng ad) =====
    const token = userData?.accessTokenUser as string | undefined
    const rawCookie = userData?.cookie as string | undefined
    const commonHeaders: Record<string, string> = { Accept: 'application/json' }
    if (isServer && rawCookie) commonHeaders['Cookie'] = rawCookie

    const appsecret_proof = buildAppSecretProof(token)
    const client = axios.create({
      baseURL: 'https://graph.facebook.com/v23.0',
      timeout: 20000,
      headers: commonHeaders,
    })

    // ===== 3) Helper: fetch status + insights theo adId (kèm messages) =====
    const fetchAdRealtime = async (adId: string) => {
      if (!token || !adId) {
        return {
          status: 'PAUSED',
          insights: { impressions: 0, clicks: 0, spend: '0', ctr: '0.00', cpm: '0', messages: 0 },
        }
      }
      try {
        const [statusRes, insightsRes] = await Promise.all([
          client.get(`/${adId}`, {
            params: { fields: 'status', ...(appsecret_proof ? { appsecret_proof } : {}) },
            headers: { Authorization: `Bearer ${token}` },
            timeout: 15000,
          }),
          client.get(`/${adId}/insights`, {
            params: {
              fields: INSIGHTS_FIELDS,
              date_preset: 'maximum',
              ...(appsecret_proof ? { appsecret_proof } : {}),
            },
            headers: { Authorization: `Bearer ${token}` },
            timeout: 20000,
          }),
        ])

        const status = typeof statusRes?.data?.status === 'string' ? statusRes.data.status : 'PAUSED'
        const fb = insightsRes?.data?.data?.[0] ?? {}

        const impressions = toNumber(fb.impressions)
        const clicks = toNumber(fb.clicks)
        const spend = toNumber(fb.spend)
        const ctr = toNumber(fb.ctr)
        const cpm = toNumber(fb.cpm)

        // --- NEW: tính messages từ fb.actions ---
        let messages = 0
        if (Array.isArray(fb.actions)) {
          for (const a of fb.actions) {
            const atype = a && a.action_type ? String(a.action_type) : ''
            if (/(message|messag|conversation|onsite_conversion|omni_message)/i.test(atype)) {
              messages += toNumber(a.value ?? a['count'] ?? 0)
            }
          }
        }

        return {
          status,
          insights: {
            impressions,
            clicks,
            spend: formatCurrency(spend),
            ctr: format2(ctr),
            cpm: formatCurrency(format2(cpm)),
            messages,
          },
        }
      } catch (error: any) {
        const e = error?.response?.data?.error
        this.logger.error(
          `❌ Lỗi lấy dữ liệu ad ${adId}: ${e?.message || error?.message} (code=${e?.code}, sub=${e?.error_subcode})`,
        )
        return {
          status: 'PAUSED',
          insights: { impressions: 0, clicks: 0, spend: '0', ctr: '0.00', cpm: '0', messages: 0 },
        }
      }
    }

    // ===== 4) Duyệt từng campaign → map danh sách ads bên trong =====
    const dataFromCampaigns = await Promise.all(
      campaigns.map(async (camp) => {
        const adRealtime = await Promise.all(
          (camp.ads || []).map(async (ad) => {
            const rt = await fetchAdRealtime(ad.adId)
            return {
              adId: ad.adId,
              name: ad.campaignName,
              caption: ad.caption,
              urlPost: ad.urlPost,
              status: rt.status,
              data: rt.insights,
              createdAt: ad.createdAt,
            }
          }),
        )

        // Tính tổng (bao gồm messages)
        const summary = adRealtime.reduce(
          (acc, a) => {
            acc.impressions += toNumber(a.data.impressions)
            acc.clicks += toNumber(a.data.clicks)
            acc.spend += Number((a.data.spend || '0').toString().replace(/,/g, ''))
            acc.messages += toNumber(a.data.messages ?? 0)
            return acc
          },
          { impressions: 0, clicks: 0, spend: 0, messages: 0 },
        )

        return {
          campaignRefId: camp.id,
          campaignId: camp.campaignId,
          name: camp.name,
          objective: camp.objective,
          startTime: camp.startTime,
          endTime: camp.endTime,
          dailyBudget: camp.dailyBudget,
          status: camp.status,
          createdAt: camp.createdAt,
          totals: {
            impressions: summary.impressions,
            clicks: summary.clicks,
            spend: formatCurrency(summary.spend),
            messages: summary.messages,
          },
          ads: adRealtime,
        }
      }),
    )

    // ===== 5) Lấy các ad "cũ" / orphan (không có campaign liên kết) của user =====
    const orphanAds = await this.facebookAdRepo
      .createQueryBuilder('ad')
      .leftJoin('ad.campaign', 'campaign')
      .leftJoin('ad.createdBy', 'createdBy')
      .where('createdBy.id = :uid', { uid: userData?.id })
      .andWhere('campaign.id IS NULL')
      .orderBy('ad.createdAt', 'ASC')
      .getMany()

    let syntheticCampaign = null
    if (orphanAds && orphanAds.length) {
      const adRealtime = await Promise.all(
        orphanAds.map(async (ad) => {
          const rt = await fetchAdRealtime(ad.adId)
          return {
            adId: ad.adId,
            name: ad.campaignName || '(No title)',
            caption: ad.caption || '(No content)',
            urlPost: ad.urlPost || '',
            status: rt.status,
            data: rt.insights,
            createdAt: ad.createdAt,
          }
        }),
      )

      const summary = adRealtime.reduce(
        (acc, a) => {
          acc.impressions += toNumber(a.data.impressions)
          acc.clicks += toNumber(a.data.clicks)
          acc.spend += Number((a.data.spend || '0').toString().replace(/,/g, ''))
          acc.messages += toNumber(a.data.messages ?? 0)
          return acc
        },
        { impressions: 0, clicks: 0, spend: 0, messages: 0 },
      )

      const earliestCreatedAt = adRealtime.reduce((earliest, a) => {
        if (!earliest) return a.createdAt
        return new Date(a.createdAt) < new Date(earliest) ? a.createdAt : earliest
      }, null as any)

      syntheticCampaign = {
        campaignRefId: 0,
        campaignId: null,
        name: 'Dữ liệu phiên bản trước',
        objective: null,
        startTime: null,
        endTime: null,
        dailyBudget: 0,
        status: 'ACTIVE',
        createdAt: earliestCreatedAt,
        totals: {
          impressions: summary.impressions,
          clicks: summary.clicks,
          spend: formatCurrency(summary.spend),
          messages: summary.messages,
        },
        ads: adRealtime,
      }
    }

    // ===== 6) Ghép kết quả: campaigns (theo trang) + synthetic (đưa cuối) =====
    const data = [...dataFromCampaigns]
    if (syntheticCampaign) {
      data.push(syntheticCampaign)
    }

    const total = campaignTotal + (syntheticCampaign ? 1 : 0)

    return { data, total, page, pageSize }
  }
}
