import { Injectable, Logger } from '@nestjs/common'
import * as nodemailer from 'nodemailer'
import { CreateEmailDto } from './dto/create-email.dto'
import { Cron } from '@nestjs/schedule'
import axios, { AxiosInstance } from 'axios'
import { InjectRepository } from '@nestjs/typeorm'
import { FacebookAd } from '@models/facebook-ad.entity'
import moment from 'moment-timezone'
import { Repository, Raw, LessThanOrEqual, MoreThanOrEqual } from 'typeorm'
import { User } from '@models/user.entity'
import { CreditTransaction } from '@models/credit-ransaction .entity'
import { AdInsight } from '@models/ad-insight.entity'
import crypto from 'node:crypto'
import { FacebookAdsUpdateService } from 'src/facebook-ads/facebook-ads-update.service'

/** ========= Helpers & constants ========= */
const isServer = typeof window === 'undefined'
const toNum = (v: any, def = 0) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : def
}
const vnd = (v: any) => toNum(v).toLocaleString('vi-VN', { maximumFractionDigits: 0 })
const pct = (v: any, d = 2) => toNum(v).toFixed(d)
const int = (v: any) => Math.round(toNum(v)).toLocaleString('vi-VN')

type AIReturn = {
  danh_gia: { chi_so: string; muc: 'Tốt' | 'Trung bình' | 'Kém'; nhan_xet: string }[]
  tong_quan: string
  goi_y: string[]
  targeting_goi_y?: string[]
}

type TimeIncrement = 'all_days' | 'monthly' | number
const normalizeTimeIncrement = (i: any, fb: TimeIncrement = 'all_days'): TimeIncrement => {
  if (i === 'all_days' || i === 'monthly') return i
  const n = Number(i)
  return Number.isInteger(n) && n > 0 ? n : fb
}
const normalizeActId = (id?: string) => (id ? `act_${String(id).replace(/^act_/, '')}` : undefined)
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms))
const buildAppSecretProof = (token?: string) => {
  const secret = process.env.FB_APP_SECRET
  if (!token || !secret) return undefined
  return crypto.createHmac('sha256', secret).update(token).digest('hex')
}

const INSIGHTS_FIELDS = [
  'ad_id',
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
  'cost_per_action_type',
].join(',')

/** ===== Interest helpers (NEW) ===== */
const DEFAULT_INTERESTS_BASE = [
  'Kinh doanh và tài chính', 'Khởi nghiệp', 'Doanh nhân', 'Quản trị kinh doanh',
  'Doanh nghiệp nhỏ và vừa (SMEs)', 'Marketing', 'Digital marketing', 'Bán hàng',
  'Thương mại điện tử', 'Đầu tư', 'Chứng khoán', 'Forex', 'Crypto', 'Tài chính cá nhân',
  'Ngân hàng', 'Dịch vụ tài chính', 'Bảo hiểm', 'Quản lý tài sản', 'Fintech', 'Công nghệ',
  'Facebook for Business', 'Zalo Business', 'Shopee', 'Lazada', 'Kỹ năng lãnh đạo',
  'Phát triển bản thân', 'Khóa học online', 'Tư duy tài chính', 'Sách kinh doanh'
]
function uniqClean(arr: any[]): string[] {
  return Array.from(new Set(arr.map(x => String(x || '').trim()).filter(Boolean)))
}
function parseJsonObjectSafe(raw: string): any {
  if (!raw) return {}
  const s = raw.indexOf('{'), e = raw.lastIndexOf('}')
  if (s >= 0 && e >= 0) {
    try { return JSON.parse(raw.slice(s, e + 1)) } catch { /* ignore */ }
  }
  const m = raw.match(/\[\s*"(?:[^"\\]|\\.)*"\s*(?:,\s*"(?:[^"\\]|\\.)*"\s*)*\]/)
  if (m) { try { return { interests: JSON.parse(m[0]) } } catch { /* ignore */ } }
  return {}
}
function extractSeedFromTargeting(t: any): string[] {
  if (!t) return []
  const fromFlex = Array.isArray(t.flexible_spec)
    ? t.flexible_spec.flatMap((s: any) =>
      Array.isArray(s.interests) ? s.interests.map((i: any) => i?.name || i) : []
    )
    : []
  const fromRoot = Array.isArray(t.interests) ? t.interests.map((i: any) => i?.name || i) : []
  return uniqClean([...fromFlex, ...fromRoot]).slice(0, 20)
}

/** ===== Internal (batch) helpers ===== */
async function createInsightsJob(params: {
  client: AxiosInstance
  adAccountId: string
  token: string
  appsecret_proof?: string
  timeRange?: { since: string; until: string }
  datePreset?: string
  fields: string[]
  timeIncrement?: TimeIncrement
  actionReportTime?: 'impression' | 'conversion'
  useAccountAttribution?: boolean
}) {
  const {
    client,
    adAccountId,
    token,
    appsecret_proof,
    timeRange,
    datePreset,
    fields,
    timeIncrement = 'all_days',
    actionReportTime = 'conversion',
    useAccountAttribution = true,
  } = params
  const q: any = {
    access_token: token,
    level: 'ad',
    fields: fields.join(','),
    async: true,
    limit: 5000,
    time_increment: timeIncrement,
    action_report_time: actionReportTime,
    use_account_attribution_setting: useAccountAttribution,
  }
  if (appsecret_proof) q.appsecret_proof = appsecret_proof
  if (timeRange) q.time_range = JSON.stringify(timeRange)
  if (datePreset) q.date_preset = datePreset
  const { data } = await client.post(`/${adAccountId}/insights`, null, { params: q })
  return data?.report_run_id as string | undefined
}
async function waitForJob(
  client: AxiosInstance,
  runId: string,
  token: string,
  appsecret_proof?: string,
  logger?: Logger,
) {
  const start = Date.now()
  let attempt = 0
  while (true) {
    const res = await client.get(`/${runId}`, {
      params: {
        access_token: token,
        fields: 'async_status,async_percent_completion',
        ...(appsecret_proof ? { appsecret_proof } : {}),
      },
      timeout: 20000,
    })
    const st = res?.data?.async_status
    if (st === 'Job Completed') return
    if (st === 'Job Failed' || st === 'Job Skipped') throw new Error(`Insights job failed: ${st}`)
    if (Date.now() - start > 10 * 60 * 1000) throw new Error('Insights job timeout')
    const ra = Number(res?.headers?.['retry-after'])
    const delay = Number.isFinite(ra) && ra > 0 ? ra * 1000 : Math.max(900 * Math.pow(1.3, attempt), 800)
    logger?.log?.(`Waiting insights job... status=${st} delay=${delay}ms`)
    await sleep(delay)
    attempt++
  }
}
async function fetchInsightsResultPaged(client: AxiosInstance, runId: string, token: string, appsecret_proof?: string) {
  let url = `/${runId}/insights`
  const all: any[] = []
  while (url) {
    const res = await client.get(url, {
      params: { access_token: token, limit: 5000, ...(appsecret_proof ? { appsecret_proof } : {}) },
      timeout: 20000,
    })
    all.push(...(res?.data?.data ?? []))
    const next = res?.data?.paging?.next
    url = next ? next.replace('https://graph.facebook.com/v23.0', '') : ''
  }
  return all
}
async function fetchInsightsSyncViaAccount(params: {
  client: AxiosInstance
  adAccountId: string
  token: string
  appsecret_proof?: string
  datePreset?: string
  timeRange?: { since: string; until: string }
  timeIncrement?: TimeIncrement
  actionReportTime?: 'impression' | 'conversion'
  useAccountAttribution?: boolean
}) {
  const {
    client,
    adAccountId,
    token,
    appsecret_proof,
    datePreset,
    timeRange,
    timeIncrement = 'all_days',
    actionReportTime = 'conversion',
    useAccountAttribution = true,
  } = params
  const out: any[] = []
  let url = `/${adAccountId}/insights`
  const base: any = {
    access_token: token,
    level: 'ad',
    fields: INSIGHTS_FIELDS,
    limit: 5000,
    time_increment: timeIncrement,
    action_report_time: actionReportTime,
    use_account_attribution_setting: useAccountAttribution,
    ...(appsecret_proof ? { appsecret_proof } : {}),
  }
  if (datePreset) base.date_preset = datePreset
  if (timeRange) base.time_range = JSON.stringify(timeRange)
  while (url) {
    const res = await client.get(url, { params: base, timeout: 20000 })
    out.push(...(res?.data?.data ?? []))
    const next = res?.data?.paging?.next
    url = next ? next.replace('https://graph.facebook.com/v23.0', '') : ''
  }
  return out
}

/** ========= Service ========= */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name)
  constructor(
    @InjectRepository(AdInsight) private readonly adInsightRepo: Repository<AdInsight>,
    @InjectRepository(CreditTransaction) private readonly creditRepo: Repository<CreditTransaction>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(FacebookAd) private readonly facebookAdRepo: Repository<FacebookAd>,
    private readonly fbAdsUpdate: FacebookAdsUpdateService,
  ) { }

  private transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: 'mrgroupads@gmail.com', pass: 'oocd rofb gykj mjwx' },
  })

  async sendMailPassword({ to, subject, html }: { to: string; subject: string; html: string }) {
    return this.transporter.sendMail({ from: 'mrgroupads@gmail.com', to, subject, html })
  }

  async sendCredits(data: any, user: User) {
    const userData = await this.userRepo.findOne({ where: { email: user.email } })
    const mailOptions = {
      from: 'mrgroupads@gmail.com',
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
    const info = await this.transporter.sendMail(mailOptions)
    const transaction = new CreditTransaction()
    transaction.paymentDate = new Date()
    transaction.amountPaidVnd = data.vnd || 179000
    transaction.creditsPurchased = data.credits || 500
    transaction.code = `${data.vnd}vnd-${data.credits}-credits`
    transaction.updatedById = userData.id.toString()
    await this.creditRepo.save(transaction)
    return { success: true, messageId: info.messageId }
  }

  async sendPlan(data: any, user: User) {
    const userData = await this.userRepo.findOne({ where: { email: user.email } })
    if (!userData) throw new Error('Không tìm thấy thông tin người dùng')
    const mailOptions = {
      from: 'mrgroupads@gmail.com',
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
    const info = await this.transporter.sendMail(mailOptions)
    return { success: true, messageId: info.messageId }
  }

  async sendFormEmail(data: CreateEmailDto) {
    const { fullName, email, phone, zalo } = data
    const mailOptions = {
      from: 'mrgroupads@gmail.com',
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
    const info = await this.transporter.sendMail(mailOptions)
    return { success: true, messageId: info.messageId }
  }

  /** ===== Targeting summarizer (giữ logic) ===== */
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
        const lat = Number(c.latitude),
          lng = Number(c.longitude),
          r = Number(c.radius)
        const unit = String(c.distance_unit || 'mile')
        const radiusKm = Number.isFinite(r) ? (unit === 'mile' ? r * 1.609 : r) : NaN
        return `${Number.isFinite(lat) ? lat.toFixed(4) : '?'},${Number.isFinite(lng) ? lng.toFixed(4) : '?'}${Number.isFinite(radiusKm) ? ` (~${radiusKm.toFixed(1)} km)` : ''}`
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
    const interestsFromFlex: string[] = (Array.isArray(t.flexible_spec) ? t.flexible_spec : []).flatMap((s: any) =>
      Array.isArray(s.interests) ? s.interests.map((i: any) => i.name) : [],
    )
    const interestsRoot: string[] = Array.isArray(t.interests) ? t.interests.map((i: any) => i?.name || i) : []
    const interests = [...interestsFromFlex, ...interestsRoot]
    const behaviors: string[] = (Array.isArray(t.flexible_spec) ? t.flexible_spec : []).flatMap((s: any) =>
      Array.isArray(s.behaviors) ? s.behaviors.map((b: any) => b.name) : [],
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
    console.log(`AI đánh giá:==================================================`, r)
    if (!r?.danh_gia?.length) return '<p>Không có đánh giá từ AI.</p>'
    const rows = r.danh_gia
      .map(
        (d) =>
          `<tr><td style="padding:8px;border:1px solid #eee;">${d.chi_so}</td><td style="padding:8px;border:1px solid #eee;">${d.nhan_xet}</td></tr>`,
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

  // ====== NEW: Gợi ý keyword/interest từ OpenAI dựa trên targeting ======
  private async getKeywordSuggestionsFromAI(params: {
    adId: string
    targeting: any
  }): Promise<string[]> {
    const { adId, targeting } = params
    const tSum = this.summarizeTargeting(targeting)
    const seed = extractSeedFromTargeting(targeting)

    const systemPrompt = `Bạn là chuyên gia quảng cáo Facebook.
YÊU CẦU: Trả về JSON thuần {"interests": ["..."]} với 10–30 mục.
- Chỉ trả JSON, không giải thích.
- Ưu tiên tiếng Việt; liên quan Kinh doanh/Tài chính/Khởi nghiệp/Marketing/Đầu tư/Công nghệ.
- Không trùng lặp, không để trống.`
    const userPrompt = `
Ad ID: ${adId}
TARGETING SUMMARY:
${tSum.lines.join('\n')}

SEED INTERESTS:
${seed.join(', ') || '(none)'}

RAW TARGETING:
${JSON.stringify(tSum.raw || {}, null, 2)}
`

    const models = ['gpt-4o-mini', 'gpt-4o', 'gpt-4']
    const tryOnce = async (model: string, strictJson = true) => {
      const body: any = {
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 700,
      }
      if (strictJson) body.response_format = { type: 'json_object' }

      const res = await axios.post('https://api.openai.com/v1/chat/completions', body, {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      })
      const raw = res?.data?.choices?.[0]?.message?.content ?? ''
      const json = parseJsonObjectSafe(raw)
      const list = Array.isArray(json?.interests) ? json.interests : []
      return uniqClean(list)
    }

    let out: string[] = []
    for (let round = 0; round < 2 && out.length === 0; round++) {
      for (const m of models) {
        try {
          out = await tryOnce(m, round === 0)
          if (out.length) break
        } catch (err: any) {
          this.logger.warn(`⚠️ OpenAI(${m}) round${round} error: ${err?.response?.status || ''} ${err?.message}`)
          await new Promise((r) => setTimeout(r, 500))
        }
      }
    }

    // Hợp nhất: AI + seed (always include) + default; đảm bảo không rỗng
    out = uniqClean([...out, ...seed, ...DEFAULT_INTERESTS_BASE])
    if (out.length < 10) {
      const pad = DEFAULT_INTERESTS_BASE.filter(x => !out.includes(x)).slice(0, 10 - out.length)
      out = uniqClean([...out, ...pad])
    }
    return out.slice(0, 30)
  }

  /** =============== CRON =============== */
  @Cron('0 9 * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
  // @Cron('*/30 * * * * *')
  async reportAdInsights() {
    const today = moment().tz('Asia/Ho_Chi_Minh').startOf('day')
    const tomorrow = moment(today).add(1, 'day')
    const yesterday = moment(today).subtract(1, 'day')

    this.logger.log(`🔎 Bắt đầu quét dữ liệu quảng cáo lúc ${moment().format('YYYY-MM-DD HH:mm:ss')}`)

    // Lấy danh sách ads như cũ
    const ads = await this.facebookAdRepo.find({
      where: [
        { startTime: Raw((date) => `DATE(${date}) = '${today.format('YYYY-MM-DD')}'`) },
        { startTime: LessThanOrEqual(tomorrow.toDate()), endTime: MoreThanOrEqual(today.toDate()) },
        { endTime: Raw((date) => `DATE(${date}) = '${yesterday.format('YYYY-MM-DD')}'`) },
      ],
      relations: ['createdBy'],
    })
    this.logger.log(`📦 Tìm thấy ${ads.length} quảng cáo cần quét.`)
    if (!ads.length) return

    // Gom theo owner để bật đúng luồng
    const adsByOwner = new Map<string, FacebookAd[]>()
    for (const ad of ads) {
      const uid = String(ad.createdBy?.id ?? 'unknown')
      if (!adsByOwner.has(uid)) adsByOwner.set(uid, [])
      adsByOwner.get(uid)!.push(ad)
    }

    // Với mỗi owner
    for (const [, ownerAds] of adsByOwner) {
      const owner = ownerAds[0]?.createdBy as User
      const isInternal = !!owner?.isInternal

      // FB client
      const headers: Record<string, string> = { Accept: 'application/json' }
      if (!isInternal && owner?.cookie && isServer) headers['Cookie'] = owner.cookie
      const token = isInternal ? (owner as any)?.internalUserAccessToken : (owner as any)?.accessTokenUser
      if (token) headers['Authorization'] = `Bearer ${token}`
      const appsecret_proof = buildAppSecretProof(token)
      const client = axios.create({ baseURL: 'https://graph.facebook.com/v23.0', timeout: 20000, headers })

      // Tham số Insights
      const datePreset: string | undefined = 'maximum'
      const timeRange: { since: string; until: string } | undefined = undefined
      const timeIncrement: TimeIncrement = normalizeTimeIncrement('all_days')
      const actionReportTime: 'impression' | 'conversion' = 'conversion'
      const useAccountAttribution = true

      // INTERNAL: batch theo account
      let insightsByAdId = new Map<string, any>()
      if (isInternal) {
        const adAccountId = normalizeActId(
          (owner as any)?.accountAdsId || (owner as any)?.adAccountId || (owner as any)?.ad_account_id,
        )
        if (token && adAccountId) {
          try {
            const runId = await createInsightsJob({
              client,
              adAccountId,
              token,
              appsecret_proof,
              timeRange,
              datePreset,
              fields: INSIGHTS_FIELDS.split(','),
              timeIncrement,
              actionReportTime,
              useAccountAttribution,
            })
            let rows: any[] = []
            if (!runId) {
              rows = await fetchInsightsSyncViaAccount({
                client,
                adAccountId,
                token,
                appsecret_proof,
                datePreset,
                timeRange,
                timeIncrement,
                actionReportTime,
                useAccountAttribution,
              })
            } else {
              await waitForJob(client, runId, token, appsecret_proof, this.logger)
              rows = await fetchInsightsResultPaged(client, runId, token, appsecret_proof)
            }
            for (const r of rows) {
              const aid = String(r?.ad_id ?? '')
              if (aid) insightsByAdId.set(aid, r)
            }
          } catch (err: any) {
            this.logger.error(
              `❌ Internal batch insights lỗi: ${err?.response?.status} ${JSON.stringify(err?.response?.data)}`,
            )
          }
        } else {
          this.logger.warn(`⚠️ Owner thiếu token hoặc adAccountId → bỏ qua batch.`)
        }
      }

      // Xử lý từng ad
      for (const ad of ownerAds) {
        try {
          const adId = String(ad.adId)

          // Insights
          let fb: any = null
          if (isInternal && insightsByAdId.has(adId)) {
            fb = insightsByAdId.get(adId)
          } else {
            const insightsRes = await client.get(`/${adId}/insights`, {
              params: {
                fields: INSIGHTS_FIELDS,
                date_preset: datePreset,
                ...(timeRange ? { time_range: JSON.stringify(timeRange) } : {}),
                time_increment: timeIncrement,
                action_report_time: actionReportTime,
                use_account_attribution_setting: useAccountAttribution,
                ...(appsecret_proof ? { appsecret_proof } : {}),
              },
              timeout: 20000,
            })
            fb = insightsRes?.data?.data?.[0] ?? null
          }

          // Targeting
          let targeting: any = null
          try {
            const fbTarget = await client.get(`/${adId}`, {
              params: { fields: 'targeting,name', ...(appsecret_proof ? { appsecret_proof } : {}) },
              timeout: 20000,
            })
            targeting = fbTarget?.data?.targeting || null
          } catch (tErr: any) {
            this.logger.warn(`⚠️ Không lấy được targeting cho ad ${adId}: ${tErr.message}`)
          }

          // Gợi ý interest (có đảm bảo bao gồm seed & không rỗng)
          let keywordSuggestions: string[] = []
          if (targeting) {
            keywordSuggestions = await this.getKeywordSuggestionsFromAI({ adId, targeting })
            if (keywordSuggestions.length) {
              this.logger.log(`✨ Keyword suggestions (${keywordSuggestions.length}) cho ad ${adId}: ${keywordSuggestions.slice(0, 5).join(', ')}...`)
            }
          }

          if (!fb) {
            this.logger.warn(`⚠️ Không có insights cho ad ${adId}`)
            continue
          }

          // Chuẩn dữ liệu
          const impressions = toNum(fb.impressions)
          const reach = toNum(fb.reach)
          const frequency = toNum(fb.frequency)
          const clicks = toNum(fb.clicks)
          const inlineLinkClicks = toNum(fb.inline_link_clicks)
          const spend = toNum(fb.spend)
          const ctrVal = toNum(fb.ctr)
          const cpmVal = toNum(fb.cpm)
          const cpcVal = toNum(fb.cpc)

          // Engagement
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
          const actions = Array.isArray(fb?.actions) ? fb.actions : []
          let totalEngagement = 0
          const engagementItems = actions
            .filter((a) => engagementTypes.includes(a.action_type))
            .map((a) => {
              const label = actionTypeMap[a.action_type] || a.action_type
              const value = toNum(a.value)
              totalEngagement += value
              return { label, value }
            })

          // Messaging
          const messageActions = (Array.isArray(fb?.actions) ? fb.actions : []).filter((a: any) =>
            /message|messaging|conversation|messenger/i.test(String(a?.action_type || '')),
          )
          const messageCount = messageActions.reduce((s: number, a: any) => s + toNum(a.value), 0)
          let costPerMessageFromApi: number | null = null
          if (Array.isArray(fb?.cost_per_action_type)) {
            const found = fb.cost_per_action_type.find((c: any) =>
              /message|messaging|conversation|messenger/i.test(String(c?.action_type || '')),
            )
            if (found) costPerMessageFromApi = toNum(found.value)
          }
          const costPerMessageComputed = messageCount > 0 ? spend / messageCount : null
          const costPerMessage = costPerMessageFromApi ?? costPerMessageComputed

          /** ==== AI đánh giá (giữ logic) ==== */
          const targetingSummary = this.summarizeTargeting(targeting)
          const systemPrompt = `Bạn là chuyên gia quảng cáo Facebook.
YÊU CẦU: Trả về JSON {"danh_gia": [
    { "chi_so": "Hiển thị",  "nhan_xet": "..." },
    { "chi_so": "Clicks", "nhan_xet": "..." },
    { "chi_so": "Chi phí",  "nhan_xet": "..." },
    { "chi_so": "CTR",  "nhan_xet": "..." },
    { "chi_so": "CPM",  "nhan_xet": "..." }
  ],"tong_quan":"...","goi_y":["..."],"targeting_goi_y":["..."]}.`
          const userPrompt = `
Ad ID: ${adId}
Impr: ${impressions} | Clicks: ${clicks} | Spend: ${vnd(spend)}đ
CTR: ${pct(ctrVal)}% | CPM: ${vnd(cpmVal)}đ | CPC: ${vnd(cpcVal)}đ
TARGETING:
${targetingSummary.lines.join('\n')}
RAW:
${JSON.stringify(targetingSummary.raw || {}, null, 2)}
`
          const callOpenAI = async () =>
            axios.post(
              'https://api.openai.com/v1/chat/completions',
              {
                model: 'gpt-4',
                messages: [
                  { role: 'system', content: systemPrompt },
                  { role: 'user', content: userPrompt },
                ],
                temperature: 0.2,
                max_tokens: 700,
                // @ts-ignore
                response_format: { type: 'json_object' },
              },
              {
                headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
                timeout: 30000,
              },
            )

          let aiJson: AIReturn | null = null
          try {
            let openaiRes
            try {
              openaiRes = await callOpenAI()
            } catch {
              openaiRes = await axios.post(
                'https://api.openai.com/v1/chat/completions',
                {
                  model: 'gpt-4',
                  messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                  ],
                  temperature: 0.2,
                  max_tokens: 700,
                },
                {
                  headers: {
                    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                    'Content-Type': 'application/json',
                  },
                  timeout: 30000,
                },
              )
            }
            const raw = openaiRes?.data?.choices?.[0]?.message?.content ?? '{}'
            const s = raw.indexOf('{'), e = raw.lastIndexOf('}')
            aiJson = JSON.parse(s >= 0 && e >= 0 ? raw.slice(s, e + 1) : '{}')
          } catch (aiErr: any) {
            this.logger.error('⚠️ Lỗi OpenAI:', aiErr?.response?.data || aiErr.message)
            aiJson = null
          }

          /** ==== Render email ==== */
          const htmlReport = `
  <h3>📢 Thống kê quảng cáo</h3>
  <h3>📅 Báo cáo ngày ${today.format('DD/MM/YYYY')}</h3>
  <p><strong>Ad ID:</strong> ${adId}</p>
  <p><strong>Chiến dịch:</strong> ${ad.campaignName || ''}</p>
  <p><strong>Người tạo:</strong> ${ad.createdBy?.email || ''}</p>

  <p><strong>👁 Hiển thị:</strong> ${int(impressions)}</p>
  <p><strong>🙋‍♂️ Reach:</strong> ${int(reach)}</p>
  <p><strong>🔁 Tần suất:</strong> ${pct(frequency)}</p>
  <p><strong>🖱 Click:</strong> ${int(clicks)}</p>
  <p><strong>🔗 Link Click:</strong> ${int(inlineLinkClicks)}</p>
  <p><strong>💸 Chi phí:</strong> ${vnd(spend)} VNĐ</p>
  <p><strong>📊 CTR:</strong> ${pct(ctrVal)}% &nbsp;•&nbsp; CPM: ${vnd(cpmVal)} VNĐ &nbsp;•&nbsp; CPC: ${vnd(cpcVal)} VNĐ</p>

  <p><strong>📌 Tổng tương tác:</strong> ${int(
            (Array.isArray(fb?.actions) ? fb.actions : []).reduce((s: number, a: any) => s + toNum(a?.value), 0),
          )}</p>

  <hr style="margin:16px 0;"/>
  <h4>✉️ Tin nhắn (Messaging)</h4>
  <p><strong>Số lượng hành động liên quan tin nhắn:</strong> ${messageCount ? int(messageCount) : '0'}</p>
  <p><strong>Chi phí / 1 tin nhắn:</strong> ${costPerMessage ? vnd(costPerMessage) + ' VNĐ' : 'Không xác định'}</p>

  <hr style="margin:16px 0;"/>
  <h4>🎯 Tóm tắt Targeting</h4>
  <p>${this.summarizeTargeting(targeting).summary}</p>
  <div style="margin-top:8px;">${this.summarizeTargeting(targeting).lines.length
              ? `<ul>${this.summarizeTargeting(targeting)
                .lines.map((l) => `<li>${l.replace(/^•\\s*/, '')}</li>`).join('')}</ul>`
              : ''
            }</div>

  <hr style="margin:16px 0;"/>
  <h4>📈 Đánh giá & Gợi ý tối ưu từ AI</h4>
  ${aiJson?.tong_quan ? `<p><em>${aiJson.tong_quan}</em></p>` : ''}
  ${this.renderEvalTable(aiJson)}
  <div style="margin-top:8px;"><strong>Gợi ý hành động:</strong>${this.renderTips(aiJson?.goi_y)}</div>
  <div style="margin-top:12px;"><strong>🎯 Gợi ý tối ưu Targeting:</strong>${this.renderTips(aiJson?.targeting_goi_y || [])}</div>
`

          // Gửi mail
          if (ad.createdBy?.email) {
            await this.transporter.sendMail({
              from: 'mrgroupads@gmail.com',
              to: ad.createdBy.email,
              subject: `📊 Báo cáo quảng cáo #${adId} - ${moment().format('YYYY-MM-DD')}`,
              html: htmlReport,
            })
            this.logger.log(`📤 Đã gửi báo cáo tới: ${ad.createdBy.email}`)
          }

          // Lưu DB
          try {
            const recommendationStr = aiJson ? JSON.stringify(aiJson) : 'Không có khuyến nghị.'
           const adInsight = await this.adInsightRepo.save({
              adId: adId,
              campaignName: ad.campaignName ? String(ad.campaignName) : null,
              createdByEmail: ad.createdBy?.email ? String(ad.createdBy.email) : null,
              impressions: String(impressions),
              reach: String(reach),
              frequency: String(frequency),
              clicks: String(clicks),
              inlineLinkClicks: String(inlineLinkClicks),
              spendVnd: String(spend),
              ctrPercent: pct(ctrVal),
              cpmVnd: vnd(cpmVal),
              cpcVnd: vnd(cpcVal),
              totalEngagement: String(
                (Array.isArray(fb?.actions) ? fb.actions : []).reduce((s: number, a: any) => s + toNum(a?.value), 0),
              ),
              engagementDetails: JSON.stringify(engagementItems),
              recommendation: recommendationStr,
              htmlReport: String(htmlReport || ''),
              userId: ad.createdBy?.id ? String(ad.createdBy.id) : null,
              // NEW
              keywordSuggestions: JSON.stringify(keywordSuggestions || []),
            })
            this.logger.log(`💾 Đã lưu insight vào DB cho ad ${adId}`)
            if(ad.createdBy?.isOptimization){
              this.fbAdsUpdate.updateAdInsight(adInsight.id.toString(), {isActive: true,targeting: { interests : keywordSuggestions,ageRange: [21,40],}})
            }
            

          } catch (saveErr: any) {
            this.logger.error(`❗️ Lỗi lưu DB ad ${adId}: ${saveErr.message}`, saveErr?.stack)
          }
        } catch (error: any) {
          const e = error?.response?.data?.error
          this.logger.error(
            `❌ Lỗi lấy dữ liệu cho ad ${ad.adId}: ${e?.message || error?.message} (code=${e?.code}, sub=${e?.error_subcode})`,
          )
        }
      } // for ad
    } // for owner

    this.logger.log(`✅ Đã hoàn tất quét dữ liệu quảng cáo.`)
  }
}
