import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { FindAdsQuery } from '../impl/find-ads.query'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Logger } from '@nestjs/common'
import moment from 'moment-timezone'
import * as crypto from 'crypto'
import axios from 'axios'
import { FacebookAd } from '@models/facebook-ad.entity'
import { AdInsight } from '@models/ad-insight.entity'

type AIReturn = {
  danh_gia: { chi_so: string; muc?: 'Tốt' | 'Trung bình' | 'Kém'; nhan_xet: string }[]
  tong_quan?: string
  goi_y?: string[]
  targeting_goi_y?: string[]
}

const GRAPH_VER = 'v23.0'

const toNum = (v: any, def = 0) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : def
}
const vnd = (v: any) => toNum(v).toLocaleString('vi-VN', { maximumFractionDigits: 0 })
const pct = (v: any, digits = 2) => toNum(v).toFixed(digits)
const int = (v: any) => Math.round(toNum(v)).toLocaleString('vi-VN')

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
  'cost_per_action_type', // giúp lấy cost per message nếu FB trả
].join(',')

function buildAppSecretProof(token?: string) {
  const secret = process.env.FB_APP_SECRET
  if (!token || !secret) return undefined
  return crypto.createHmac('sha256', secret).update(token).digest('hex')
}

@QueryHandler(FindAdsQuery)
export class FindAdsQueryHandler implements IQueryHandler<FindAdsQuery> {
  private readonly logger = new Logger(FindAdsQueryHandler.name)

  constructor(
    @InjectRepository(FacebookAd)
    private readonly facebookAdRepo: Repository<FacebookAd>,

    @InjectRepository(AdInsight)
    private readonly adInsightRepo: Repository<AdInsight>,
  ) {}

  /** Tóm tắt targeting gọn cho email & prompt */
  private summarizeTargeting(t: any) {
    if (!t) return { summary: 'Không có dữ liệu targeting.', lines: [], raw: null }

    const genderMap: Record<number, string> = { 1: 'Nam', 2: 'Nữ' }
    const genders =
      Array.isArray(t.genders) && t.genders.length
        ? t.genders.map((g: number) => genderMap[g] ?? String(g)).join(', ')
        : 'Không giới hạn'

    const age = t.age_min || t.age_max ? `${t.age_min || 13}–${t.age_max || 65}+` : 'Không giới hạn'

    const loc = t.geo_locations || {}
    const customLocs: string[] = Array.isArray(loc.custom_locations)
      ? loc.custom_locations.slice(0, 3).map((c: any) => {
          const lat = Number(c.latitude)
          const lng = Number(c.longitude)
          const r = Number(c.radius)
          const unit = String(c.distance_unit || 'mile')
          const latStr = Number.isFinite(lat) ? lat.toFixed(4) : '?'
          const lngStr = Number.isFinite(lng) ? lng.toFixed(4) : '?'
          const radiusMi = Number.isFinite(r) ? r : NaN
          const radiusKm = Number.isFinite(radiusMi) ? (unit === 'mile' ? radiusMi * 1.609 : radiusMi) : NaN
          const radiusTxt = Number.isFinite(radiusMi)
            ? unit === 'mile'
              ? `${radiusMi} mi (~${radiusKm.toFixed(1)} km)`
              : `${radiusKm.toFixed(1)} km`
            : ''
          return `${latStr},${lngStr}${radiusTxt ? ` (${radiusTxt})` : ''}`
        })
      : []

    const countries = Array.isArray(loc.countries) && loc.countries.length ? loc.countries.join(', ') : null
    const cities =
      Array.isArray(loc.cities) && loc.cities.length
        ? loc.cities
            .slice(0, 3)
            .map(
              (c: any) => `${c.name || c.key}${c.distance_unit && c.radius ? ` (+${c.radius}${c.distance_unit})` : ''}`,
            )
            .join(' • ')
        : null

    const regions =
      Array.isArray(loc.regions) && loc.regions.length
        ? loc.regions
            .map((r: any) => r.name || r.key)
            .slice(0, 3)
            .join(' • ')
        : null

    const locationStr =
      (customLocs.length && customLocs.join(' • ')) ||
      cities ||
      [countries, regions].filter(Boolean).join(' | ') ||
      'Không giới hạn'

    const interestsFromFlex: string[] = (Array.isArray(t.flexible_spec) ? t.flexible_spec : []).flatMap((spec: any) =>
      Array.isArray(spec.interests) ? spec.interests.map((i: any) => i.name) : [],
    )
    const interestsRoot: string[] = Array.isArray(t.interests) ? t.interests.map((i: any) => i?.name || i) : []
    const interests = [...interestsFromFlex, ...interestsRoot]

    const behaviors: string[] = (Array.isArray(t.flexible_spec) ? t.flexible_spec : []).flatMap((spec: any) =>
      Array.isArray(spec.behaviors) ? spec.behaviors.map((b: any) => b.name) : [],
    )

    const exclusions: string[] = Array.isArray(t.exclusions?.interests)
      ? t.exclusions.interests.map((i: any) => i.name)
      : []

    const placementDetail = (() => {
      const platforms = Array.isArray(t.publisher_platforms) ? t.publisher_platforms.join(', ') : ''
      const pos =
        (Array.isArray(t.instagram_positions) && t.instagram_positions.length
          ? t.instagram_positions
          : Array.isArray(t.facebook_positions) && t.facebook_positions.length
            ? t.facebook_positions
            : t.positions || []) || []
      return pos.length ? `${platforms || '—'} / ${pos.join(', ')}` : platforms || 'Tự động'
    })()

    const lines: string[] = [
      `• Độ tuổi: ${age}`,
      `• Giới tính: ${genders}`,
      `• Vị trí: ${locationStr}`,
      `• Sở thích (top): ${interests.slice(0, 10).join(', ') || '—'}`,
      behaviors.length ? `• Hành vi: ${behaviors.slice(0, 10).join(', ')}` : '',
      exclusions.length ? `• Loại trừ: ${exclusions.slice(0, 10).join(', ')}` : '',
      `• Vị trí hiển thị: ${placementDetail}`,
    ].filter(Boolean)

    return {
      summary: `Độ tuổi ${age}; ${genders.toLowerCase()}; vị trí ${locationStr.toLowerCase()}; ${interests.length ? `có ${interests.length} interest` : 'không set interest'}, ${behaviors.length ? `${behaviors.length} behavior` : 'không set behavior'}.`,
      lines,
      raw: t,
    }
  }

  private renderEvalTable(r: AIReturn | null) {
    if (!r?.danh_gia?.length) return '<p>Không có đánh giá từ AI.</p>'
    const rows = r.danh_gia
      .map(
        (d) =>
          `<tr>
        <td style="padding:8px;border:1px solid #eee;">${d.chi_so}</td>
        <td style="padding:8px;border:1px solid #eee;">${d.nhan_xet}</td>
      </tr>`,
      )
      .join('')
    return `
      <table style="border-collapse:collapse;width:100%;margin-top:6px;">
        <thead>
          <tr style="background:#f9fafb;">
            <th style="text-align:left;padding:8px;border:1px solid #eee;">Chỉ số</th>
            <th style="text-align:left;padding:8px;border:1px solid #eee;">Nhận xét</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`
  }

  private renderTips(items?: string[]) {
    if (!items || !items.length) return '<p>Không có gợi ý.</p>'
    const li = items.map((g) => `<li>${g}</li>`).join('')
    return `<ul style="padding-left:18px;margin:6px 0 0 0;">${li}</ul>`
  }

  async execute(query: FindAdsQuery): Promise<any> {
    const { id, user } = query
    this.logger.log(`🔍 Bắt đầu lấy dữ liệu quảng cáo cho adId=${id}`)

    const ad = await this.facebookAdRepo.findOne({
      where: { adId: id, createdBy: { email: user.email } },
      relations: ['createdBy'],
    })

    if (!ad) {
      this.logger.warn(`⚠️ Không tìm thấy quảng cáo có adId=${id} của user=${user.email}`)
      return null
    }

    const { startTime, endTime } = ad
    const start = moment(startTime).startOf('day')
    const end = moment(endTime).endOf('day')

    // Các bản ghi đã có
    const existingInsights = await this.adInsightRepo.find({
      where: { adId: id },
      order: { createdAt: 'ASC' },
    })
    const existingDates = existingInsights.map((i) => moment(i.createdAt).format('YYYY-MM-DD'))

    // Danh sách ngày cần có
    const allDates: string[] = []
    for (let c = start.clone(); c.isSameOrBefore(end); c.add(1, 'day')) {
      allDates.push(c.format('YYYY-MM-DD'))
    }

    // Ngày thiếu
    const missingDates = allDates.filter((d) => !existingDates.includes(d))
    if (missingDates.length === 0) {
      this.logger.log(`✅ Đã có đủ báo cáo từ ${start.format('YYYY-MM-DD')} → ${end.format('YYYY-MM-DD')}`)
      return existingInsights
    }

    this.logger.log(`🧩 Còn thiếu ${missingDates.length} ngày: ${missingDates.join(', ')}`)

    // ===== Auth & headers theo INTERNAL / EXTERNAL =====
    const isInternal = !!ad.createdBy?.isInternal
    const token: string | undefined = isInternal
      ? (ad.createdBy as any)?.internalUserAccessToken
      : (ad.createdBy as any)?.accessTokenUser
    const rawCookie: string | undefined = !isInternal ? (ad.createdBy?.cookie as string | undefined) : undefined

    const headers: Record<string, string> = { Accept: 'application/json' }
    if (rawCookie) headers.Cookie = rawCookie
    if (token) headers.Authorization = `Bearer ${token}`

    const appsecret_proof = buildAppSecretProof(token)

    // ===== Targeting: lấy 1 lần (đủ dùng cho tất cả ngày) =====
    let targeting: any = null
    try {
      const tRes = await axios.get(`https://graph.facebook.com/${GRAPH_VER}/${id}`, {
        params: {
          fields: 'targeting,name',
          ...(appsecret_proof ? { appsecret_proof } : {}),
        },
        headers,
        timeout: 20000,
      })
      targeting = tRes.data?.targeting || null
    } catch (tErr: any) {
      this.logger.warn(`⚠️ Không lấy được targeting cho ad ${id}: ${tErr.message}`)
    }

    // ===== INTERNAL: gom call cho toàn khoảng thiếu bằng time_increment=1 =====
    if (isInternal && token) {
      const minDate = moment(missingDates[0], 'YYYY-MM-DD')
      const maxDate = moment(missingDates[missingDates.length - 1], 'YYYY-MM-DD')
      try {
        const fbRes = await axios.get(`https://graph.facebook.com/${GRAPH_VER}/${id}/insights`, {
          params: {
            fields: INSIGHTS_FIELDS,
            time_range: JSON.stringify({
              since: minDate.format('YYYY-MM-DD'),
              until: maxDate.format('YYYY-MM-DD'),
            }),
            time_increment: 1, // ✅ trả về theo từng ngày
            action_report_time: 'conversion', // gần giống Ads Manager
            use_account_attribution_setting: true,
            ...(appsecret_proof ? { appsecret_proof } : {}),
          },
          headers,
          timeout: 30000,
        })

        const rows: any[] = Array.isArray(fbRes?.data?.data) ? fbRes.data.data : []
        // Lọc chỉ những ngày còn thiếu
        const rowsByDate = new Map<string, any>()
        for (const r of rows) {
          const k = String(r?.date_start || '')
          if (k) rowsByDate.set(k, r)
        }

        for (const date of missingDates) {
          const r = rowsByDate.get(date)
          if (!r) {
            this.logger.warn(`⚠️ INTERNAL: thiếu dữ liệu ngày ${date} trong kết quả gom-call, bỏ qua.`)
            continue
          }
          await this.upsertDailyInsight({ ad, adId: id, date, row: r, targeting })
        }
      } catch (err: any) {
        this.logger.error(`❌ INTERNAL fetch range failed, fallback sang per-day. Lý do: ${err?.message || err}`)
        // fallback: per-day như external
        for (const date of missingDates) {
          await this.fetchAndSaveOneDay({ ad, adId: id, date, headers, appsecret_proof, targeting })
        }
      }
    } else {
      // ===== EXTERNAL (hoặc thiếu token): per-day như trước =====
      for (const date of missingDates) {
        await this.fetchAndSaveOneDay({ ad, adId: id, date, headers, appsecret_proof, targeting })
      }
    }

    // Lấy lại tất cả báo cáo
    const finalReports = await this.adInsightRepo
      .createQueryBuilder('adInsight')
      .where('adInsight.adId = :id', { id })
      .orderBy('adInsight.createdAt', 'ASC')
      .getMany()

    this.logger.log(`✅ Hoàn tất đồng bộ ${finalReports.length} bản ghi insight cho ad ${id}`)
    return finalReports
  }

  /** EXTERNAL/per-day (và INTERNAL fallback): gọi 1 ngày, render + lưu */
  private async fetchAndSaveOneDay(params: {
    ad: FacebookAd
    adId: string
    date: string
    headers: Record<string, string>
    appsecret_proof?: string
    targeting: any
  }) {
    const { ad, adId, date, headers, appsecret_proof, targeting } = params
    const dateStart = moment(date).startOf('day')
    const dateStop = moment(date).endOf('day')

    const fbRes = await axios.get(`https://graph.facebook.com/${GRAPH_VER}/${adId}/insights`, {
      params: {
        fields: INSIGHTS_FIELDS,
        time_range: JSON.stringify({
          since: dateStart.format('YYYY-MM-DD'),
          until: dateStop.format('YYYY-MM-DD'),
        }),
        ...(appsecret_proof ? { appsecret_proof } : {}),
      },
      headers,
      timeout: 20000,
    })

    const data = fbRes.data?.data?.[0]
    if (!data) {
      this.logger.warn(`⚠️ Không có dữ liệu insights cho ngày ${date}`)
      return
    }

    await this.upsertDailyInsight({ ad, adId, date, row: data, targeting })
  }

  /** Chuẩn hoá 1 dòng insight/ngày + gọi AI + render + upsert DB */
  private async upsertDailyInsight(args: { ad: FacebookAd; adId: string; date: string; row: any; targeting: any }) {
    const { ad, adId, date, row, targeting } = args
    const dateStart = moment(date).startOf('day')

    const impressions = toNum(row.impressions)
    const reach = toNum(row.reach)
    const frequency = toNum(row.frequency)
    const clicks = toNum(row.clicks)
    const inlineLinkClicks = toNum(row.inline_link_clicks)
    const spend = toNum(row.spend)
    const ctr = toNum(row.ctr)
    const cpm = toNum(row.cpm)
    const cpc = toNum(row.cpc)

    this.logger.log(`📊 [AdID: ${adId}] ${date} - Impr: ${impressions}, Click: ${clicks}, Spend: ${vnd(spend)}đ`)

    // Tương tác
    const actionTypeMap: Record<string, string> = {
      post_engagement: 'Tương tác với bài viết',
      page_engagement: 'Tương tác với trang',
      photo_view: 'Lượt xem ảnh',
      like: 'Lượt thích',
      comment: 'Bình luận',
      share: 'Chia sẻ',
      link_click: 'Click vào liên kết',
      offsite_conversion: 'Chuyển đổi ngoài nền tảng',
      view_content: 'Xem nội dung',
      add_to_cart: 'Thêm vào giỏ',
      purchase: 'Mua hàng',
    }
    const actions = Array.isArray(row?.actions) ? row.actions : []
    let totalEngagement = 0
    const engagementItems = actions
      .filter((a: any) => actionTypeMap[a.action_type])
      .map((a: any) => {
        const label = actionTypeMap[a.action_type] || a.action_type
        const value = toNum(a.value)
        totalEngagement += value
        return { label, value }
      })

    // Messaging
    const messageActions = actions.filter((a: any) => {
      const at = String(a.action_type || '').toLowerCase()
      return /message|messaging|conversation|messenger/.test(at)
    })
    const messageCount = messageActions.reduce((s: number, a: any) => s + toNum(a.value), 0)

    let costPerMessageFromApi: number | null = null
    if (Array.isArray(row?.cost_per_action_type)) {
      const found = row.cost_per_action_type.find(
        (c: any) =>
          String(c.action_type || '')
            .toLowerCase()
            .includes('message') ||
          String(c.action_type || '')
            .toLowerCase()
            .includes('messaging') ||
          String(c.action_type || '')
            .toLowerCase()
            .includes('conversation') ||
          String(c.action_type || '')
            .toLowerCase()
            .includes('messenger'),
      )
      if (found) costPerMessageFromApi = toNum(found.value)
    }
    const costPerMessageComputed = messageCount > 0 ? spend / messageCount : null
    const costPerMessage = costPerMessageFromApi ?? costPerMessageComputed

    // AI
    let aiJson: AIReturn | null = null
    try {
      const targetingSummary = this.summarizeTargeting(targeting)
      if (process.env.OPENAI_API_KEY) {
        const systemPrompt = `Bạn là chuyên gia quảng cáo Facebook.
NHIỆM VỤ:
1) ĐÁNH GIÁ TỪNG CHỈ SỐ bằng mô tả ngắn gọn, tập trung vào xu hướng và mức độ hiệu quả (không dùng nhãn Tốt/Trung bình/Kém): Hiển thị (Impressions), Clicks, Chi phí, CTR, CPM.
2) ĐƯA 2–3 GỢI Ý tối ưu có tác động lớn nhất đến hiệu suất quảng cáo.
3) PHÂN TÍCH TARGETING: độ tuổi, giới tính, vị trí, sở thích/hành vi, vị trí hiển thị; nêu điểm hợp lý & điểm cần cải thiện; đề xuất 2–3 chỉnh targeting.
YÊU CẦU: chỉ trả JSON theo schema đã nêu, không markdown.`

        const userPrompt = `
- Ad ID: ${adId}
- Chiến dịch: ${ad.campaignName || ''}
- Ngày: ${moment(date).format('DD/MM/YYYY')}
- Impr: ${impressions}
- Clicks: ${clicks}
- Spend: ${vnd(spend)} VNĐ
- CTR (%): ${pct(ctr)}
- CPM (VNĐ): ${vnd(cpm)}
- CPC (VNĐ): ${vnd(cpc)}
- Messages: ${messageCount}
- Cost/Message: ${costPerMessage ? vnd(costPerMessage) + ' VNĐ' : 'Không xác định'}

TÓM TẮT TARGETING:
${targetingSummary.lines.join('\n')}

TARGETING RAW:
${JSON.stringify(targetingSummary.raw || {}, null, 2)}
`

        const body: any = {
          model: 'gpt-4',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.2,
          max_tokens: 700,
        }

        const openaiRes = await axios.post('https://api.openai.com/v1/chat/completions', body, {
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        })
        const raw = openaiRes.data?.choices?.[0]?.message?.content ?? '{}'
        const safeSlice = (t: string) => {
          const s = t.indexOf('{')
          const e = t.lastIndexOf('}')
          return s >= 0 && e >= 0 ? t.slice(s, e + 1) : '{}'
        }
        aiJson = JSON.parse(safeSlice(raw))
      }
    } catch (e: any) {
      this.logger.error(`⚠️ Lỗi OpenAI (ad ${adId} ngày ${date}): ${e?.message || e}`)
      aiJson = null
    }

    // HTML report
    const targetingSummary = this.summarizeTargeting(targeting)
    const htmlReport = `
      <h3>📅 Báo cáo ngày ${moment(date).format('DD/MM/YYYY')}</h3>
      <p><strong>Ad ID:</strong> ${ad.adId}</p>
      <p><strong>Chiến dịch:</strong> ${ad.campaignName || ''}</p>
      <p><strong>Người tạo:</strong> ${ad.createdBy?.email || ''}</p>

      <p><strong>👁 Hiển thị:</strong> ${int(impressions)}</p>
      <p><strong>🙋‍♂️ Reach:</strong> ${int(reach)}</p>
      <p><strong>🔁 Tần suất:</strong> ${pct(frequency)}</p>
      <p><strong>🖱 Click:</strong> ${int(clicks)}</p>
      <p><strong>🔗 Link Click:</strong> ${int(inlineLinkClicks)}</p>
      <p><strong>💸 Chi phí:</strong> ${vnd(spend)} VNĐ</p>
      <p><strong>📊 CTR:</strong> ${pct(ctr)}% &nbsp;•&nbsp; CPM: ${vnd(cpm)} VNĐ &nbsp;•&nbsp; CPC: ${vnd(cpc)} VNĐ</p>

      <p><strong>📌 Tổng tương tác:</strong> ${int(totalEngagement)}</p>
      ${engagementItems.length ? `<ul>${engagementItems.map((e) => `<li>${e.label}: ${int(e.value)}</li>`).join('')}</ul>` : ''}

      <hr style="margin:16px 0;"/>
      <h4>✉️ Tin nhắn (Messaging)</h4>
      <p><strong>Số lượng hành động liên quan tin nhắn:</strong> ${messageCount ? int(messageCount) : '0'}</p>
      <p><strong>Chi phí / 1 tin nhắn:</strong> ${costPerMessage ? vnd(costPerMessage) + ' VNĐ' : 'Không xác định'}</p>

      <hr style="margin:16px 0;"/>
      <h4>🎯 Tóm tắt Targeting</h4>
      <p>${targetingSummary.summary}</p>
      <div style="margin-top:8px;">${
        targetingSummary.lines.length
          ? `<ul>${targetingSummary.lines.map((l) => `<li>${l.replace(/^•\\s*/, '')}</li>`).join('')}</ul>`
          : ''
      }</div>
    `

    // Upsert theo ngày
    const existed = await this.adInsightRepo.findOne({
      where: [{ adId: String(adId), createdAt: dateStart.startOf('day').toDate() }],
    })

    if (existed) {
      Object.assign(existed, {
        impressions: String(impressions),
        reach: String(reach),
        frequency: String(frequency),
        clicks: String(clicks),
        inlineLinkClicks: String(inlineLinkClicks),
        spendVnd: String(spend),
        ctrPercent: pct(ctr),
        cpmVnd: vnd(cpm),
        cpcVnd: vnd(cpc),
        totalEngagement: String(totalEngagement),
        engagementDetails: JSON.stringify(engagementItems),
        recommendation: aiJson ? JSON.stringify(aiJson) : existed.recommendation || null,
        htmlReport,
        updatedAt: new Date(),
      })
      await this.adInsightRepo.save(existed)
      this.logger.log(`♻️ Đã cập nhật báo cáo ngày ${dateStart.format('DD/MM/YYYY')} cho ad ${adId}`)
    } else {
      const newInsight = this.adInsightRepo.create({
        adId: String(adId),
        campaignName: ad.campaignName || null,
        createdByEmail: ad.createdBy?.email || null,
        impressions: String(impressions),
        reach: String(reach),
        frequency: String(frequency),
        clicks: String(clicks),
        inlineLinkClicks: String(inlineLinkClicks),
        spendVnd: String(spend),
        ctrPercent: pct(ctr),
        cpmVnd: vnd(cpm),
        cpcVnd: vnd(cpc),
        totalEngagement: String(totalEngagement),
        engagementDetails: JSON.stringify(engagementItems),
        recommendation: aiJson ? JSON.stringify(aiJson) : null,
        htmlReport,
        userId: ad.createdBy?.id ? String(ad.createdBy.id) : null,
        createdAt: dateStart.startOf('day').toDate(),
        updatedAt: new Date(),
      })
      await this.adInsightRepo.save(newInsight)
      this.logger.log(`💾 Đã lưu báo cáo ngày ${dateStart.format('DD/MM/YYYY')} cho ad ${adId}`)
    }
  }
}
