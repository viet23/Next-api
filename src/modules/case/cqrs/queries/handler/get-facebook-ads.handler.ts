import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { User } from '@models/user.entity'
import { GetFacebookAdsQuery } from '../impl/get-facebook-ads.query'
import { FacebookAd } from '@models/facebook-ad.entity'
import { Logger } from '@nestjs/common'
import axios from 'axios'
import crypto from 'node:crypto'
import { FacebookCampaign } from '@models/facebook_campaign.entity'

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

@QueryHandler(GetFacebookAdsQuery)
export class GetFacebookAdsQueryHandler implements IQueryHandler<GetFacebookAdsQuery> {
  private readonly logger = new Logger(`${GetFacebookAdsQueryHandler.name}`)

  constructor(
    @InjectRepository(FacebookCampaign)
    private readonly facebookCampaignRepo: Repository<FacebookCampaign>, // 👈 dùng bảng chiến dịch
    @InjectRepository(FacebookAd)
    private readonly facebookAdRepo: Repository<FacebookAd>, // vẫn cần nếu muốn query riêng
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  async execute(q: GetFacebookAdsQuery): Promise<any> {
    const { filter, user } = q
    const userData = await this.userRepo.findOne({ where: { email: user.email } })

    // ===== 1) Lấy danh sách Campaign của user (kèm ads) =====
    const qb = this.facebookCampaignRepo
      .createQueryBuilder('campaign')
      .leftJoinAndSelect('campaign.createdBy', 'createdBy')
      .leftJoinAndSelect('campaign.ads', 'ads') // 👈 lấy toàn bộ ads trong chiến dịch
      .where('createdBy.id = :uid', { uid: userData?.id })
      .orderBy('campaign.createdAt', 'DESC')

    // Phân trang theo campaign
    let page = 1
    let pageSize = 10
    if (filter?.filter?.page && filter?.filter?.pageSize) {
      page = Math.max(1, Number(filter.filter.page))
      pageSize = Math.max(1, Number(filter.filter.pageSize))
      qb.take(pageSize).skip((page - 1) * pageSize)
    }

    const [campaigns, campaignTotal] = await qb.getManyAndCount()

    // ===== Nếu không có campaign nào, vẫn tiếp tục vì có thể có orphan ads =====
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

    // ===== 3) Helper: fetch status + insights theo adId =====
    const fetchAdRealtime = async (adId: string) => {
      if (!token || !adId) {
        return {
          status: 'PAUSED',
          insights: {
            impressions: 0,
            clicks: 0,
            spend: '0',
            spendNumber: 0,
            ctr: '0.00',
            cpm: '0',
            messages: 0,
            costPerMessage: '0',
            costPerMessageNumber: 0,
            costPerClick: '0',
            costPerClickNumber: 0,
          },
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
        const spendNumber = toNumber(fb.spend)
        const ctr = toNumber(fb.ctr)
        const cpm = toNumber(fb.cpm)

        // --- NEW: tính messages từ fb.actions ---
        let messages = 0
        if (Array.isArray(fb.actions)) {
          for (const a of fb.actions) {
            const atype = a && a.action_type ? String(a.action_type) : ''
            // bắt các action_type liên quan tới message / conversation / onsite_conversion (thường có các tên khác nhau tuỳ Graph API version)
            if (/(message|messag|conversation|onsite_conversion|omni_message)/i.test(atype)) {
              // nhiều trường hợp Facebook trả { action_type: '...', value: '12' }
              // dùng toNumber an toàn
              messages += toNumber(a.value ?? a['count'] ?? 0)
            }
          }
        }

        // --- NEW: tính cost per message và cost per click (number + formatted) ---
        const costPerMessageNumber = messages > 0 ? spendNumber / messages : 0
        const costPerClickNumber = clicks > 0 ? spendNumber / clicks : 0

        return {
          status,
          insights: {
            impressions,
            clicks,
            spend: formatCurrency(spendNumber),
            spendNumber, // numeric spend để dễ tính toán sau này
            ctr: format2(ctr),
            cpm: formatCurrency(format2(cpm)),
            messages, // <-- trả về số tin nhắn
            costPerMessage: formatCurrency(format2(costPerMessageNumber)),
            costPerMessageNumber,
            costPerClick: formatCurrency(format2(costPerClickNumber)),
            costPerClickNumber,
          },
        }
      } catch (error: any) {
        const e = error?.response?.data?.error
        this.logger.error(
          `❌ Lỗi lấy dữ liệu ad ${adId}: ${e?.message || error?.message} (code=${e?.code}, sub=${e?.error_subcode})`,
        )
        return {
          status: 'PAUSED',
          insights: {
            impressions: 0,
            clicks: 0,
            spend: '0',
            spendNumber: 0,
            ctr: '0.00',
            cpm: '0',
            messages: 0,
            costPerMessage: '0',
            costPerMessageNumber: 0,
            costPerClick: '0',
            costPerClickNumber: 0,
          },
        }
      }
    }

    // ===== 4) Duyệt từng campaign → map danh sách ads bên trong =====
    const dataFromCampaigns = await Promise.all(
      campaigns.map(async (camp) => {
        // Lấy realtime cho tất cả ads thuộc campaign (song song)
        const adRealtime = await Promise.all(
          (camp.ads || []).map(async (ad) => {
            const rt = await fetchAdRealtime(ad.adId)
            return {
              adId: ad.adId,
              name: ad.campaignName, // tên ad (đã đặt khi tạo)
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
            // a.data.spend có thể là formatted string; nếu có spendNumber dùng trực tiếp
            const spendNum = toNumber(a.data.spendNumber ?? a.data.spend ?? 0)
            acc.spend += spendNum
            acc.messages += toNumber(a.data.messages ?? 0)
            return acc
          },
          { impressions: 0, clicks: 0, spend: 0, messages: 0 },
        )

        // Tính chi phí trung bình cho campaign
        const avgCostPerMessageNumber = summary.messages > 0 ? summary.spend / summary.messages : 0
        const avgCostPerClickNumber = summary.clicks > 0 ? summary.spend / summary.clicks : 0

        return {
          campaignRefId: camp.id, // id nội bộ (DB)
          campaignId: camp.campaignId, // id Graph
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
            spendNumber: summary.spend,
            messages: summary.messages,
            avgCostPerMessage: formatCurrency(format2(avgCostPerMessageNumber)),
            avgCostPerMessageNumber,
            avgCostPerClick: formatCurrency(format2(avgCostPerClickNumber)),
            avgCostPerClickNumber,
          },
          ads: adRealtime, // ⬅️ danh sách quảng cáo bên trong
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
      .orderBy('ad.createdAt', 'ASC') // đặt thứ tự cũ → mới, tuỳ bạn
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
          const spendNum = toNumber(a.data.spendNumber ?? a.data.spend ?? 0)
          acc.spend += spendNum
          acc.messages += toNumber(a.data.messages ?? 0)
          return acc
        },
        { impressions: 0, clicks: 0, spend: 0, messages: 0 },
      )

      // Determine earliest createdAt among orphan ads to use as synthetic createdAt (optional)
      const earliestCreatedAt = adRealtime.reduce((earliest, a) => {
        if (!earliest) return a.createdAt
        return new Date(a.createdAt) < new Date(earliest) ? a.createdAt : earliest
      }, null as any)

      const avgCostPerMessageNumber = summary.messages > 0 ? summary.spend / summary.messages : 0
      const avgCostPerClickNumber = summary.clicks > 0 ? summary.spend / summary.clicks : 0

      syntheticCampaign = {
        campaignRefId: 0, // dùng 0 để dễ phân biệt
        campaignId: null,
        name: 'Dữ liệu phiên bản trước', // tên theo yêu cầu
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
          spendNumber: summary.spend,
          messages: summary.messages,
          avgCostPerMessage: formatCurrency(format2(avgCostPerMessageNumber)),
          avgCostPerMessageNumber,
          avgCostPerClick: formatCurrency(format2(avgCostPerClickNumber)),
          avgCostPerClickNumber,
        },
        ads: adRealtime,
      }
    }

    // ===== 6) Ghép kết quả: campaigns (theo trang) + synthetic (đưa cuối) =====
    const data = [...dataFromCampaigns]
    if (syntheticCampaign) {
      data.push(syntheticCampaign) // luôn ở cuối
    }

    const total = campaignTotal + (syntheticCampaign ? 1 : 0)

    return { data, total, page, pageSize }
  }
}
