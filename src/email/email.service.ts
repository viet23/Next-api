import { Injectable, Logger } from '@nestjs/common'
import * as nodemailer from 'nodemailer'
import { CreateEmailDto } from './dto/create-email.dto'
import { Cron } from '@nestjs/schedule'
import axios from 'axios'
import { InjectRepository } from '@nestjs/typeorm'
import { FacebookAd } from '@models/facebook-ad.entity'
import moment from 'moment-timezone'
import { Repository, Raw, LessThanOrEqual, MoreThanOrEqual } from 'typeorm'
import { User } from '@models/user.entity'
import { CreditTransaction } from '@models/credit-ransaction .entity'
import { AdInsight } from '@models/ad-insight.entity'
import crypto from 'node:crypto'

const formatCurrency = (v: any) => Number(v).toLocaleString('en-US') // 1,234,567
const format2 = (v: any) => Number(v).toFixed(2) // 2 chữ số thập phân

type AIReturn = {
  danh_gia: { chi_so: string; muc: 'Tốt' | 'Trung bình' | 'Kém'; nhan_xet: string }[]
  tong_quan: string
  goi_y: string[]
  targeting_goi_y?: string[] // NEW: gợi ý riêng cho targeting
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name)
  constructor(
    @InjectRepository(AdInsight) private readonly adInsightRepo: Repository<AdInsight>,
    @InjectRepository(CreditTransaction) private readonly creditRepo: Repository<CreditTransaction>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(FacebookAd)
    private readonly facebookAdRepo: Repository<FacebookAd>,
  ) {}

  // NOTE: vẫn giữ nguyên transporter như cũ (khuyến nghị: dùng app password qua env)
  private transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: '2203viettt@gmail.com',
      pass: 'tpzhvdoemquprhlo',
    },
  })

  async sendMailPassword({ to, subject, html }: { to: string; subject: string; html: string }) {
    console.log(`Sending email to: ${to}, subject: ${subject}`)
    return this.transporter.sendMail({
      from: '2203viettt@gmail.com',
      to,
      subject,
      html,
    })
  }

  async sendCredits(data: any, user: User) {
    const userData = await this.userRepo.findOne({ where: { email: user.email } })
    console.log(`data`, data)

    const mailOptions = {
      from: '2203viettt@gmail.com',
      to: 'nextadsai@gmail.com',
      subject: `Đã yêu cầu thanh toán 179k mua 500 credits`,
      html: `
        <h3>Thông tin người liên hệ:</h3>
        <p><strong>Họ tên:</strong> ${userData.fullName}</p>
        <p><strong>Email:</strong> ${userData.email}</p>
        <p><strong>Phone:</strong> ${userData.phone}</p>
        <p><strong>Zalo:</strong> ${userData.zalo || 'Không cung cấp'}</p>
      `,
    }

    try {
      const info = await this.transporter.sendMail(mailOptions)
      const transaction = new CreditTransaction()
      transaction.paymentDate = new Date()
      transaction.amountPaidVnd = data.vnd || 179000
      transaction.creditsPurchased = data.credits || 500
      transaction.code = `${data.vnd}vnd-${data.credits}-credits`
      transaction.updatedById = userData.id.toString()

      await this.creditRepo.save(transaction)
      return { success: true, messageId: info.messageId }
    } catch (error) {
      console.error('Lỗi gửi mail:', error)
      throw new Error('Không thể gửi email')
    }
  }

  async sendPlan(data: any, user: User) {
    const userData = await this.userRepo.findOne({
      where: { email: user.email },
    })
    if (!userData) throw new Error('Không tìm thấy thông tin người dùng')

    console.log(`data`, data)

    const mailOptions = {
      from: '2203viettt@gmail.com',
      to: 'nextadsai@gmail.com',
      subject: `Yêu cầu mua gói ${data.name}`,
      html: `
      <h3>Thông tin người dùng yêu cầu mua gói:</h3>
      <p><strong>Họ tên:</strong> ${userData.fullName}</p>
      <p><strong>Email:</strong> ${userData.email}</p>
      <p><strong>Phone:</strong> ${userData.phone}</p>
      <p><strong>Zalo:</strong> ${userData.zalo || 'Không cung cấp'}</p>
      <hr/>
      <h4>Thông tin gói đăng ký:</h4>
      <p><strong>Tên gói:</strong> ${data.name}</p>
      <p><strong>Số tháng:</strong> ${data.months || 1}</p>
      <p><strong>Ngày bắt đầu:</strong> ${data.startDate ? new Date(data.startDate).toLocaleDateString('vi-VN') : new Date().toLocaleDateString('vi-VN')}</p>
      <p><strong>Ngày kết thúc:</strong> ${data.endDate ? new Date(data.endDate).toLocaleDateString('vi-VN') : new Date().toLocaleDateString('vi-VN')}</p>
    `,
    }

    try {
      const info = await this.transporter.sendMail(mailOptions)
      return { success: true, messageId: info.messageId }
    } catch (error) {
      console.error('Lỗi gửi mail:', error)
      throw new Error('Không thể gửi email xác nhận mua gói')
    }
  }

  async sendFormEmail(data: CreateEmailDto) {
    const { fullName, email, phone, zalo } = data
    const mailOptions = {
      from: '2203viettt@gmail.com',
      to: 'nextadsai@gmail.com',
      subject: `Yêu cầu hỗ trợ từ ${fullName}`,
      html: `
        <h3>Thông tin người liên hệ:</h3>
        <p><strong>Họ tên:</strong> ${fullName}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Phone:</strong> ${phone}</p>
        <p><strong>Zalo:</strong> ${zalo || 'Không cung cấp'}</p>
      `,
    }

    try {
      const info = await this.transporter.sendMail(mailOptions)
      return { success: true, messageId: info.messageId }
    } catch (error) {
      console.error('Lỗi gửi mail:', error)
      throw new Error('Không thể gửi email')
    }
  }

  /** Helper: tóm tắt targeting gọn cho email & prompt */
  private summarizeTargeting(t: any) {
    if (!t) return { summary: 'Không có dữ liệu targeting.', lines: [], raw: null }

    // Facebook: 1=Nam, 2=Nữ
    const genderMap: Record<number, string> = { 1: 'Nam', 2: 'Nữ' }
    const genders =
      Array.isArray(t.genders) && t.genders.length
        ? t.genders.map((g: number) => genderMap[g] ?? String(g)).join(', ')
        : 'Không giới hạn'

    const age = t.age_min || t.age_max ? `${t.age_min || 13}–${t.age_max || 65}+` : 'Không giới hạn'

    const loc = t.geo_locations || {}

    // ƯU TIÊN: đọc custom_locations (lat/lng + radius mi) để tránh báo "Không giới hạn"
    const customLocs: string[] = Array.isArray(loc.custom_locations)
      ? loc.custom_locations.slice(0, 3).map((c: any) => {
          const lat = Number(c.latitude)
          const lng = Number(c.longitude)
          const r = Number(c.radius)
          const unit = String(c.distance_unit || 'mile') // Graph trả 'mile'
          const latStr = Number.isFinite(lat) ? lat.toFixed(4) : '?'
          const lngStr = Number.isFinite(lng) ? lng.toFixed(4) : '?'

          // Hiển thị thêm km cho dễ đọc
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

    // Thứ tự ưu tiên hiển thị: custom_locations → cities → countries/regions
    const locationStr =
      (customLocs.length && customLocs.join(' • ')) ||
      cities ||
      [countries, regions].filter(Boolean).join(' | ') ||
      'Không giới hạn'

    // Interests / Behaviors (đọc từ flexible_spec; có thể đọc thêm root.interests nếu có)
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

  /** Helper: render bảng đánh giá */
  private renderEvalTable(r: AIReturn | null) {
    if (!r?.danh_gia?.length) return '<p>Không có đánh giá từ AI.</p>'
    const badge = (muc: string) => {
      switch (muc) {
        case 'Kém':
          return `<span style="background:#fee2e2;color:#b91c1c;padding:2px 8px;border-radius:999px;font-weight:600;">Kém</span>`
        case 'Trung bình':
          return `<span style="background:#fef9c3;color:#a16207;padding:2px 8px;border-radius:999px;font-weight:600;">Trung bình</span>`
        default:
          return `<span style="background:#dcfce7;color:#166534;padding:2px 8px;border-radius:999px;font-weight:600;">Tốt</span>`
      }
    }
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

  /** Helper: render bullets */
  private renderTips(items?: string[]) {
    if (!items || !items.length) return '<p>Không có gợi ý.</p>'
    const li = items.map((g) => `<li>${g}</li>`).join('')
    return `<ul style="padding-left:18px;margin:6px 0 0 0;">${li}</ul>`
  }

  @Cron('0 9 * * *', {
    timeZone: 'Asia/Ho_Chi_Minh',
  })
  // @Cron('*/30 * * * * *')
  async reportAdInsights() {
    const today = moment().tz('Asia/Ho_Chi_Minh').startOf('day')
    const tomorrow = moment(today).add(1, 'day')
    const yesterday = moment(today).subtract(1, 'day')

    this.logger.log(`🔎 Bắt đầu quét dữ liệu quảng cáo lúc ${moment().format('YYYY-MM-DD HH:mm:ss')}`)

    const ads = await this.facebookAdRepo.find({
      where: [
        { startTime: Raw((date) => `DATE(${date}) = '${today.format('YYYY-MM-DD')}'`) },
        {
          startTime: LessThanOrEqual(tomorrow.toDate()),
          endTime: MoreThanOrEqual(today.toDate()),
        },
        { endTime: Raw((date) => `DATE(${date}) = '${yesterday.format('YYYY-MM-DD')}'`) },
      ],
      relations: ['createdBy'],
    })

    this.logger.log(`📦 Tìm thấy ${ads.length} quảng cáo cần quét.`)

    for (const ad of ads) {
      try {
        // ====== Auth headers (Cookie + Bearer) + appsecret_proof ======
        const token = ad.createdBy?.accessTokenUser as string | undefined
        const rawCookie = ad.createdBy?.cookie as string | undefined

        const headers: Record<string, string> = { Accept: 'application/json' }
        if (rawCookie) headers.Cookie = rawCookie
        if (token) headers.Authorization = `Bearer ${token}`

        const appsecret = process.env.FB_APP_SECRET
        const appsecret_proof =
          token && appsecret ? crypto.createHmac('sha256', appsecret).update(token).digest('hex') : undefined

        // 1) Insights
        const fbRes = await axios.get(`https://graph.facebook.com/v19.0/${ad.adId}/insights`, {
          params: {
            fields: [
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
              // BỔ SUNG: cost per action types (nếu có) để tận dụng cost per message trả về từ API
              'cost_per_action_type',
            ].join(','),
            date_preset: 'maximum',
            ...(appsecret_proof ? { appsecret_proof } : {}),
          },
          headers,
          timeout: 20000,
        })

        const data = fbRes.data?.data?.[0]
        if (!data) {
          this.logger.warn(`⚠️ Không có dữ liệu insights cho quảng cáo ${ad.adId}`)
          continue
        }

        // 1b) Targeting
        let targeting: any = null
        try {
          const fbTargetingRes = await axios.get(`https://graph.facebook.com/v19.0/${ad.adId}`, {
            params: {
              fields: 'targeting,name',
              ...(appsecret_proof ? { appsecret_proof } : {}),
            },
            headers,
            timeout: 20000,
          })
          targeting = fbTargetingRes.data?.targeting || null
        } catch (tErr: any) {
          this.logger.warn(`⚠️ Không lấy được targeting cho ad ${ad.adId}: ${tErr.message}`)
        }

        // 2) Helper format
        const toNum = (v: any, def = 0) => {
          const n = Number(v)
          return Number.isFinite(n) ? n : def
        }
        const vnd = (v: any) => toNum(v).toLocaleString('vi-VN', { maximumFractionDigits: 0 })
        const pct = (v: any, digits = 2) => toNum(v).toFixed(digits)
        const int = (v: any) => Math.round(toNum(v)).toLocaleString('vi-VN')

        // Chuẩn dữ liệu
        const impressions = toNum(data.impressions)
        const reach = toNum(data.reach)
        const frequency = toNum(data.frequency)
        const clicks = toNum(data.clicks)
        const inlineLinkClicks = toNum(data.inline_link_clicks)
        const spend = toNum(data.spend)
        const ctr = toNum(data.ctr) // CTR % theo API trả
        const cpm = toNum(data.cpm)
        const cpc = toNum(data.cpc)

        this.logger.log(`📊 [AdID: ${ad.adId}] - Impr: ${impressions}, Click: ${clicks}, Spend: ${vnd(spend)}đ`)

        // 3) AI đánh giá + gợi ý (kèm targeting)
        const targetingSummary = this.summarizeTargeting(targeting)

        const systemPrompt = `Bạn là chuyên gia quảng cáo Facebook.
NHIỆM VỤ:
1) ĐÁNH GIÁ TỪNG CHỈ SỐ bằng mô tả ngắn gọn, tập trung vào xu hướng và mức độ hiệu quả (không dùng nhãn Tốt/Trung bình/Kém): Hiển thị (Impressions), Clicks, Chi phí, CTR, CPM.
2) ĐƯA 2–3 GỢI Ý tối ưu có tác động lớn nhất đến hiệu suất quảng cáo.
3) PHÂN TÍCH TARGETING theo các phần: độ tuổi, giới tính, vị trí địa lý, sở thích/hành vi, vị trí hiển thị; nêu điểm hợp lý & điểm cần cải thiện; ĐỀ XUẤT 2–3 gợi ý chỉnh targeting.

YÊU CẦU: Trả về DUY NHẤT JSON theo schema:
{
  "danh_gia": [
    { "chi_so": "Hiển thị",  "nhan_xet": "..." },
    { "chi_so": "Clicks", "nhan_xet": "..." },
    { "chi_so": "Chi phí",  "nhan_xet": "..." },
    { "chi_so": "CTR",  "nhan_xet": "..." },
    { "chi_so": "CPM",  "nhan_xet": "..." }
  ],
  "tong_quan": "1–2 câu tổng hợp",
  "goi_y": ["...", "..."],            // 2–3 mục tối ưu hiệu suất
  "targeting_goi_y": ["...", "..."]   // 2–3 mục 
}
  tối ưu targeting_goi_y dựa trên số liệu TÓM TẮT TARGETING để đưa ra gợi ý phù hợp chi tiết số tuôi phải có có nằm trong khoảng bao nhiêu ví dụ 22 - 40, sở thích/hành vi gì nên thêm/bớt, vị trí địa lý có cần thu hẹp/điều chỉnh không, vị trí hiển thị có nên chọn cụ thể hay để tự động...
KHÔNG thêm chữ thừa, KHÔNG markdown.`

        const userPrompt = `
Dưới đây là dữ liệu quảng cáo:

- Ad ID: ${ad.adId}
- Chiến dịch: ${ad.campaignName || ''}
- Hiển thị (Impressions): ${impressions}
- Clicks: ${clicks}
- Chi phí (Spend): ${vnd(spend)} VNĐ
- CTR (%): ${pct(ctr)}
- CPM (VNĐ): ${vnd(cpm)}
- CPC (VNĐ): ${vnd(cpc)}

TÓM TẮT TARGETING:
${targetingSummary.lines.join('\n')}

TARGETING RAW (JSON, có thể thiếu phần):
${JSON.stringify(targetingSummary.raw || {}, null, 2)}

Lưu ý:
- Nếu thiếu benchmark, hãy đánh giá tương đối dựa trên mối quan hệ giữa các chỉ số (VD: CTR thấp + CPM cao → cần cải thiện nội dung hoặc đối tượng).
- Mỗi mảng gợi ý chỉ tối đa 3 mục.
- Viết nhận xét khách quan, không quá khắt khe.

Trả về đúng JSON như schema đã nêu.
`

        const callOpenAI = async () => {
          const body: any = {
            model: 'gpt-4',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0.2,
            max_tokens: 700,
            // @ts-ignore
            response_format: { type: 'json_object' },
          }
          return axios.post('https://api.openai.com/v1/chat/completions', body, {
            headers: {
              Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
              'Content-Type': 'application/json',
            },
            timeout: 30000,
          })
        }

        let aiJson: AIReturn | null = null
        try {
          let openaiRes
          try {
            openaiRes = await callOpenAI()
          } catch (e1: any) {
            const fallbackBody = {
              model: 'gpt-4',
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
              ],
              temperature: 0.2,
              max_tokens: 700,
            }
            openaiRes = await axios.post('https://api.openai.com/v1/chat/completions', fallbackBody, {
              headers: {
                Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json',
              },
              timeout: 30000,
            })
          }

          const raw = openaiRes.data?.choices?.[0]?.message?.content ?? '{}'
          const safeSlice = (t: string) => {
            const start = t.indexOf('{')
            const end = t.lastIndexOf('}')
            return start >= 0 && end >= 0 ? t.slice(start, end + 1) : '{}'
          }
          aiJson = JSON.parse(safeSlice(raw))

          const priority = { Kém: 0, 'Trung bình': 1, Tốt: 2 } as const
          if (Array.isArray(aiJson?.danh_gia)) {
            aiJson!.danh_gia = aiJson!.danh_gia.sort(
              (a, b) => priority[a.muc as keyof typeof priority] - priority[b.muc as keyof typeof priority],
            )
          }
        } catch (aiErr: any) {
          this.logger.error('⚠️ Lỗi khi gọi/parse OpenAI:', aiErr?.response?.data || aiErr.message)
          aiJson = null
        }

        // 4) Tính tương tác
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
        const engagementTypes = Object.keys(actionTypeMap)
        const actions = Array.isArray(data?.actions) ? data.actions : []
        let totalEngagement = 0
        const engagementItems = actions
          .filter((a) => engagementTypes.includes(a.action_type))
          .map((a) => {
            const label = actionTypeMap[a.action_type] || a.action_type
            const value = toNum(a.value)
            totalEngagement += value
            return { label, value }
          })

        // ====== MỚI: TÍNH SỐ TIN NHẮN & CHI PHÍ / TIN NHẮN ======
        // 1) Tìm tất cả action có liên quan đến 'message' / 'messaging' / 'conversation' trong actions
        const messageActions = (Array.isArray(data?.actions) ? data.actions : []).filter((a: any) => {
          const at = String(a.action_type || '').toLowerCase()
          return /message|messaging|conversation|messaging_conversation|messaging_conversations|messenger/.test(at)
        })

        // Tổng số "tin nhắn" (nếu API trả action types dạng này)
        const messageCount = messageActions.reduce((s: number, a: any) => s + toNum(a.value), 0)

        // 2) Nếu API trả cost_per_action_type (mảng), tìm phần cost cho action liên quan tới message
        let costPerMessageFromApi: number | null = null
        if (Array.isArray(data?.cost_per_action_type)) {
          const found = data.cost_per_action_type.find(
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
          if (found) {
            // Giá trị API trả có thể ở dạng string hoặc number
            costPerMessageFromApi = toNum(found.value)
          }
        }

        // 3) Nếu không có giá từ API, tính tạm: spend / messageCount
        const costPerMessageComputed = messageCount > 0 ? spend / messageCount : null
        // Quyết định sử dụng: ưu tiên giá từ API nếu có, ngược lại dùng computed
        const costPerMessage = costPerMessageFromApi ?? costPerMessageComputed

        if (messageCount > 0) {
          this.logger.log(
            `✉️ [AdID: ${ad.adId}] Số tin nhắn: ${messageCount}, Chi phí/tin: ${costPerMessage ? Math.round(costPerMessage) : 'N/A'} VND`,
          )
        } else {
          this.logger.log(`✉️ [AdID: ${ad.adId}] Không tìm thấy action liên quan đến tin nhắn trong data.actions`)
        }

        const recommendationStr = aiJson ? JSON.stringify(aiJson) : 'Không có khuyến nghị.'

        // 5) Render email HTML (bổ sung phần tin nhắn)
        const htmlReport = `
  <h3>📢 Thống kê quảng cáo</h3>
   <h3>📅 Báo cáo ngày ${today.format('DD/MM/YYYY')}</h3>
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
          <div style="margin-top:8px;">${targetingSummary.lines.length ? `<ul>${targetingSummary.lines.map((l) => `<li>${l.replace(/^•\\s*/, '')}</li>`).join('')}</ul>` : ''}</div>

          <hr style="margin:16px 0;"/>
          <h4>📈 Đánh giá & Gợi ý tối ưu từ AI</h4>
          ${aiJson?.tong_quan ? `<p><em>${aiJson.tong_quan}</em></p>` : ''}
          ${this.renderEvalTable(aiJson)}
          <div style="margin-top:8px;"><strong>Gợi ý hành động:</strong>${this.renderTips(aiJson?.goi_y)}</div>

          <div style="margin-top:12px;">
            <strong>🎯 Gợi ý tối ưu Targeting:</strong>
            ${this.renderTips(aiJson?.targeting_goi_y || [])}
          </div>
 
`

        // 6) Gửi mail cho owner
        if (ad.createdBy?.email) {
          await this.transporter.sendMail({
            from: '2203viettt@gmail.com',
            to: ad.createdBy.email,
            subject: `📊 Báo cáo quảng cáo #${ad.adId} - ${moment().format('YYYY-MM-DD')}`,
            html: htmlReport,
          })
          this.logger.log(`📤 Đã gửi báo cáo quảng cáo tới: ${ad.createdBy.email}`)
        } else {
          this.logger.warn(`⚠️ Không gửi email vì người tạo quảng cáo không có email.`)
        }

        // 7) Lưu DB (giữ nguyên schema cũ — không thêm cột mới)
        try {
          await this.adInsightRepo.save({
            adId: String(ad.adId),
            campaignName: ad.campaignName ? String(ad.campaignName) : null,
            createdByEmail: ad.createdBy?.email ? String(ad.createdBy.email) : null,

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

            // Lưu cả phần AI (đã bao gồm targeting_goi_y nếu có)
            recommendation: recommendationStr,

            // Lưu nguyên HTML (đã chứa phần targeting + gợi ý + tin nhắn)
            htmlReport: String(htmlReport || ''),

            userId: ad.createdBy?.id ? String(ad.createdBy.id) : null,
          })
          this.logger.log(`💾 Đã lưu insight vào DB cho ad ${ad.adId}`)
        } catch (saveErr: any) {
          this.logger.error(`❗️ Lỗi lưu DB ad ${ad.adId}: ${saveErr.message}`, saveErr?.stack)
        }
      } catch (error: any) {
        const e = error?.response?.data?.error
        this.logger.error(
          `❌ Lỗi khi lấy dữ liệu cho ad ${ad.adId}: ${e?.message || error.message} (code=${e?.code}, sub=${e?.error_subcode})`,
        )
      }
    }

    this.logger.log(`✅ Đã hoàn tất quét dữ liệu quảng cáo.`)
  }
}
