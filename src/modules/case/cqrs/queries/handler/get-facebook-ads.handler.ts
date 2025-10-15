import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { User } from '@models/user.entity'
import { GetFacebookAdsQuery } from '../impl/get-facebook-ads.query'
import { FacebookAd } from '@models/facebook-ad.entity'
import { Logger } from '@nestjs/common'
import axios, { AxiosInstance } from 'axios'
import crypto from 'node:crypto'
import { FacebookCampaign } from '@models/facebook_campaign.entity'

/** ================== Constants & helpers ================== */
const INSIGHTS_FIELDS = [
  'ad_id',                // để map insights -> adId
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

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms))

type TimeIncrement = 'all_days' | 'monthly' | number
function normalizeTimeIncrement(input: any, fallback: TimeIncrement = 'all_days'): TimeIncrement {
  if (input === 'all_days' || input === 'monthly') return input
  const n = Number(input)
  if (Number.isInteger(n) && n > 0) return n
  return fallback
}

function normalizeActId(id?: string): string | undefined {
  if (!id) return undefined
  return `act_${String(id).replace(/^act_/, '')}`
}

function buildZeroRowForAd(adId: string, range?: { since?: string; until?: string }) {
  return {
    ad_id: adId,
    date_start: range?.since ?? '',
    date_stop:  range?.until ?? '',
    impressions: '0',
    reach: '0',
    frequency: '0',
    spend: '0',
    cpm: '0',
    cpc: '0',
    ctr: '0',
    clicks: '0',
    inline_link_clicks: '0',
    actions: [],
  }
}

/** ================== Internal helpers: gom call (no cookie) ================== */
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

  const query: any = {
    access_token: token,
    level: 'ad',
    fields: fields.join(','),
    async: true,
    limit: 5000,
    time_increment: timeIncrement,
    action_report_time: actionReportTime,
    use_account_attribution_setting: useAccountAttribution,
  }
  if (appsecret_proof) query.appsecret_proof = appsecret_proof
  if (timeRange) query.time_range = JSON.stringify(timeRange)
  if (datePreset) query.date_preset = datePreset

  const { data } = await client.post(`/${adAccountId}/insights`, null, { params: query })
  return data?.report_run_id as string | undefined
}

async function waitForJob(
  client: AxiosInstance,
  reportRunId: string,
  token: string,
  appsecret_proof?: string,
  logger?: Logger,
) {
  const start = Date.now()
  let attempt = 0

  while (true) {
    const res = await client.get(`/${reportRunId}`, {
      params: {
        access_token: token,
        fields: 'async_status,async_percent_completion', // đúng tên field
        ...(appsecret_proof ? { appsecret_proof } : {}),
      },
      timeout: 20000,
    })

    const st: string | undefined = res?.data?.async_status
    const pct: number | undefined = Number(
      res?.data?.async_percent_completion ?? res?.data?.percent_completion,
    )

    if (st === 'Job Completed') {
      logger?.log?.(`Insights job completed (percent=${Number.isFinite(pct) ? pct : 100}%).`)
      return
    }
    if (st === 'Job Failed' || st === 'Job Skipped') {
      throw new Error(`Insights job failed: ${st}`)
    }
    if (Date.now() - start > 10 * 60 * 1000) {
      throw new Error('Insights job timeout')
    }

    const ra = Number(res?.headers?.['retry-after'])
    const backoff = Math.max(900 * Math.pow(1.3, attempt), 800)
    const delay = Number.isFinite(ra) && ra > 0 ? ra * 1000 : backoff

    logger?.log?.(
      `Waiting insights job... status=${st ?? 'unknown'}, percent=${Number.isFinite(pct) ? pct : 'n/a'}%, delay=${delay}ms`,
    )
    await sleep(delay)
    attempt++
  }
}

async function fetchInsightsResultPaged(
  client: AxiosInstance,
  reportRunId: string,
  token: string,
  appsecret_proof?: string,
) {
  let url = `/${reportRunId}/insights`
  const all: any[] = []
  while (url) {
    const res = await client.get(url, {
      params: {
        access_token: token,
        limit: 5000,
        ...(appsecret_proof ? { appsecret_proof } : {}),
      },
      timeout: 20000,
    })
    all.push(...(res?.data?.data ?? []))
    const next = res?.data?.paging?.next
    url = next ? next.replace('https://graph.facebook.com/v23.0', '') : ''
  }
  return all
}

/** Fallback sync GET nếu async job fail */
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
  const baseParams: any = {
    access_token: token,
    level: 'ad',
    fields: INSIGHTS_FIELDS,
    limit: 5000,
    time_increment: timeIncrement,
    action_report_time: actionReportTime,
    use_account_attribution_setting: useAccountAttribution,
    ...(appsecret_proof ? { appsecret_proof } : {}),
  }
  if (datePreset) baseParams.date_preset = datePreset
  if (timeRange) baseParams.time_range = JSON.stringify(timeRange)

  while (url) {
    const res = await client.get(url, {
      params: baseParams,
      timeout: 20000,
    })
    out.push(...(res?.data?.data ?? []))
    const next = res?.data?.paging?.next
    url = next ? next.replace('https://graph.facebook.com/v23.0', '') : ''
  }
  return out
}

/** Lấy full danh sách ad trong account (để không bỏ sót) */
async function fetchAllAdsViaAccount(
  client: AxiosInstance,
  adAccountId: string,
  token: string,
  appsecret_proof?: string,
  opts?: { includeArchived?: boolean }
) {
  const act = normalizeActId(adAccountId)!
  const list: Array<{ id: string; name?: string; effective_status?: string; status?: string }> = []
  let url = `/${act}/ads`

  const statuses = opts?.includeArchived
    ? ['ACTIVE','PAUSED','ARCHIVED','IN_PROCESS','WITH_ISSUES','PENDING_REVIEW','DISAPPROVED']
    : ['ACTIVE','PAUSED','IN_PROCESS','WITH_ISSUES','PENDING_REVIEW']

  while (url) {
    const res = await client.get(url, {
      params: {
        access_token: token,
        fields: 'id,name,status,effective_status',
        limit: 5000,
        filtering: JSON.stringify([{ field: 'ad.effective_status', operator: 'IN', value: statuses }]),
        ...(appsecret_proof ? { appsecret_proof } : {}),
      },
      timeout: 20000,
    })
    list.push(...(res?.data?.data ?? []))
    const next = res?.data?.paging?.next
    url = next ? next.replace('https://graph.facebook.com/v23.0', '') : ''
  }
  return list
}

/** Lấy status toàn bộ ads theo account (phân trang 1 luồng) */
async function fetchAllAdStatusesViaAccount(
  client: AxiosInstance,
  adAccountId: string,
  token: string,
  appsecret_proof?: string,
) {
  const statusMap = new Map<string, string>()
  const actId = normalizeActId(adAccountId)!
  let url = `/${actId}/ads`
  while (url) {
    const res = await client.get(url, {
      params: {
        access_token: token,
        fields: 'status,effective_status',
        limit: 5000,
        ...(appsecret_proof ? { appsecret_proof } : {}),
      },
      timeout: 20000,
    })
    for (const r of res?.data?.data ?? []) {
      const id = String(r?.id ?? '')
      if (!id) continue
      const st =
        typeof r?.status === 'string'
          ? r.status
          : typeof r?.effective_status === 'string'
          ? r.effective_status
          : 'PAUSED'
      statusMap.set(id, st)
    }
    const next = res?.data?.paging?.next
    url = next ? next.replace('https://graph.facebook.com/v23.0', '') : ''
  }
  return statusMap
}

/** ================== Handler ================== */
@QueryHandler(GetFacebookAdsQuery)
export class GetFacebookAdsQueryHandler implements IQueryHandler<GetFacebookAdsQuery> {
  private readonly logger = new Logger(`${GetFacebookAdsQueryHandler.name}`)

  constructor(
    @InjectRepository(FacebookCampaign)
    private readonly facebookCampaignRepo: Repository<FacebookCampaign>,
    @InjectRepository(FacebookAd)
    private readonly facebookAdRepo: Repository<FacebookAd>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  async execute(q: GetFacebookAdsQuery): Promise<any> {
    const { filter, user } = q
    const userData = await this.userRepo.findOne({ where: { email: user.email } })

    /** 1) Lấy campaign (kèm ads) */
    const qb = this.facebookCampaignRepo
      .createQueryBuilder('campaign')
      .leftJoinAndSelect('campaign.createdBy', 'createdBy')
      .leftJoinAndSelect('campaign.ads', 'ads')
      .where('createdBy.id = :uid', { uid: userData?.id })
      .orderBy('campaign.createdAt', 'DESC')

    let page = 1
    let pageSize = 10
    if (filter?.filter?.page && filter?.filter?.pageSize) {
      page = Math.max(1, Number(filter.filter.page))
      pageSize = Math.max(1, Number(filter.filter.pageSize))
      qb.take(pageSize).skip((page - 1) * pageSize)
    }
    const [campaigns, campaignTotal] = await qb.getManyAndCount()

    /** 2) Client theo isInternal */
    const isInternal = !!userData?.isInternal
    const token = (isInternal ? (userData as any)?.internalUserAccessToken : (userData as any)?.accessTokenUser) as
      | string
      | undefined

    const headers: Record<string, string> = { Accept: 'application/json' }
    if (!isInternal) {
      const rawCookie = (userData?.cookie as string) || undefined
      if (isServer && rawCookie) headers['Cookie'] = rawCookie
    }
    const appsecret_proof = buildAppSecretProof(token)
    const client = axios.create({
      baseURL: 'https://graph.facebook.com/v23.0',
      timeout: 20000,
      headers,
    })

    /** Tham số filter/attribution */
    const datePreset: string | undefined = (filter as any)?.datePreset || 'maximum'
    const timeRange: { since: string; until: string } | undefined = (filter as any)?.timeRange
    const timeIncrement: TimeIncrement = normalizeTimeIncrement((filter as any)?.timeIncrement, 'all_days')
    const actionReportTime: 'impression' | 'conversion' = (filter as any)?.actionReportTime ?? 'conversion'
    const useAccountAttribution: boolean = (filter as any)?.useAccountAttribution ?? true

    if (isInternal) {
      /** ======= INTERNAL: gom call + lấy TẤT CẢ ad, fill 0 nếu thiếu insights ======= */
      const adAccountIdRaw: string | undefined =
        (userData as any)?.accountAdsId || (userData as any)?.adAccountId || (userData as any)?.ad_account_id
      const adAccountId = normalizeActId(adAccountIdRaw)

      let insightsRows: any[] = []
      let statusByAdId = new Map<string, string>()
      let allAdsInAccount: Array<{ id: string; name?: string; effective_status?: string; status?: string }> = []

      if (token && adAccountId) {
        // 1) Insights (async → fallback sync)
        try {
          const reportRunId = await createInsightsJob({
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

          if (!reportRunId) {
            this.logger.error('createInsightsJob returned empty report_run_id; falling back to sync insights.')
            insightsRows = await fetchInsightsSyncViaAccount({
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
            await waitForJob(client, reportRunId, token, appsecret_proof, this.logger)
            insightsRows = await fetchInsightsResultPaged(client, reportRunId, token, appsecret_proof)
          }
        } catch (err: any) {
          const body = err?.response?.data
          this.logger.error(`Async Insights job failed → fallback to sync GET. Body=${JSON.stringify(body)}`)
          insightsRows = await fetchInsightsSyncViaAccount({
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
        }

        // 2) Full ad list để không bỏ sót
        try {
          allAdsInAccount = await fetchAllAdsViaAccount(client, adAccountId, token, appsecret_proof, {
            includeArchived: true,
          })
        } catch (e: any) {
          this.logger.error(`Fetch all ads failed: ${e?.response?.status} ${JSON.stringify(e?.response?.data)}`)
          allAdsInAccount = []
        }

        // 3) Status map
        try {
          statusByAdId = await fetchAllAdStatusesViaAccount(client, adAccountId, token, appsecret_proof)
        } catch (e: any) {
          this.logger.error(
            `Fetch statuses via /ads failed: ${e?.response?.status} ${JSON.stringify(e?.response?.data)}`
          )
          statusByAdId = new Map<string, string>()
        }
      } else {
        this.logger.warn('Missing internal token or ad account id; returning empty metrics.')
      }

      // Map insights theo ad_id
      const insightsByAdId = new Map<string, any>()
      for (const row of insightsRows) {
        const adId = String(row?.ad_id ?? '')
        if (adId) insightsByAdId.set(adId, row)
      }

      // Map full ads trong account
      const accountAdsMap = new Map<string, { id: string; name?: string; effective_status?: string; status?: string }>(
        allAdsInAccount.map(a => [String(a.id), a]),
      )

      // Gom tập adId đầy đủ: DB (campaign + orphan) ∪ account
      const orphanAds = await this.facebookAdRepo
        .createQueryBuilder('ad')
        .leftJoin('ad.campaign', 'campaign')
        .leftJoin('ad.createdBy', 'createdBy')
        .where('createdBy.id = :uid', { uid: userData?.id })
        .andWhere('campaign.id IS NULL')
        .orderBy('ad.createdAt', 'ASC')
        .getMany()

      const adIdSet = new Set<string>()
      for (const c of campaigns) for (const a of (c.ads || [])) if (a?.adId) adIdSet.add(String(a.adId))
      for (const a of orphanAds) if (a?.adId) adIdSet.add(String(a.adId))
      for (const a of allAdsInAccount) if (a?.id) adIdSet.add(String(a.id))
      const allAdIds = Array.from(adIdSet)

      const findDbAd = (adId: string) =>
        campaigns.flatMap(c => c.ads || []).find(a => String(a.adId) === adId) ||
        orphanAds.find(a => String(a.adId) === adId)

      const buildAdViewFromId = (adId: string) => {
        const dbAd = findDbAd(adId)
        const fromAccount = accountAdsMap.get(adId)
        const fb = insightsByAdId.get(adId) ?? buildZeroRowForAd(adId, timeRange)

        const impressions = toNumber(fb.impressions)
        const clicks = toNumber(fb.clicks)
        const spendNumber = toNumber(fb.spend)
        const ctr = toNumber(fb.ctr)
        const cpm = toNumber(fb.cpm)

        let messages = 0
        const actions = fb.actions
        if (Array.isArray(actions)) {
          for (const a of actions) {
            const t = a?.action_type ? String(a.action_type) : ''
            if (/(message|messag|conversation|onsite_conversion|omni_message)/i.test(t)) {
              messages += toNumber(a.value ?? a.count ?? 0)
            }
          }
        }

        const costPerMessageNumber = messages > 0 ? spendNumber / messages : 0
        const costPerClickNumber = clicks > 0 ? spendNumber / clicks : 0

        const status =
          statusByAdId.get(adId) ||
          fromAccount?.effective_status ||
          fromAccount?.status ||
          'PAUSED'

        return {
          adId,
          name: dbAd?.campaignName ?? fromAccount?.name ?? '(No title)',
          caption: dbAd?.caption ?? '(No content)',
          urlPost: dbAd?.urlPost ?? '',
          status,
          data: {
            impressions,
            clicks,
            spend: formatCurrency(spendNumber),
            spendNumber,
            ctr: format2(ctr),
            cpm: formatCurrency(format2(cpm)),
            messages,
            costPerMessage: formatCurrency(format2(costPerMessageNumber)),
            costPerMessageNumber,
            costPerClick: formatCurrency(format2(costPerClickNumber)),
            costPerClickNumber,
          },
          createdAt: dbAd?.createdAt ?? null,
        }
      }

      // 1) Render theo campaign trong DB (đảm bảo khớp UI cũ)
      const dataFromCampaigns = await Promise.all(
        campaigns.map(async (camp) => {
          const ads = (camp.ads || [])
            .map(a => String(a.adId))
            .filter(Boolean)
            .map(buildAdViewFromId)

          const summary = ads.reduce(
            (acc, a) => {
              acc.impressions += toNumber(a.data.impressions)
              acc.clicks += toNumber(a.data.clicks)
              acc.spend += toNumber(a.data.spendNumber ?? a.data.spend ?? 0)
              acc.messages += toNumber(a.data.messages ?? 0)
              return acc
            },
            { impressions: 0, clicks: 0, spend: 0, messages: 0 },
          )

          const avgCostPerMessageNumber = summary.messages > 0 ? summary.spend / summary.messages : 0
          const avgCostPerClickNumber = summary.clicks > 0 ? summary.spend / summary.clicks : 0

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
              spendNumber: summary.spend,
              messages: summary.messages,
              avgCostPerMessage: formatCurrency(format2(avgCostPerMessageNumber)),
              avgCostPerMessageNumber,
              avgCostPerClick: formatCurrency(format2(avgCostPerClickNumber)),
              avgCostPerClickNumber,
            },
            ads,
          }
        }),
      )

      // 2) Orphan (trong DB)
      let syntheticCampaign: any = null
      if (orphanAds && orphanAds.length) {
        const ads = orphanAds.map(a => buildAdViewFromId(String(a.adId)))
        const summary = ads.reduce(
          (acc, a) => {
            acc.impressions += toNumber(a.data.impressions)
            acc.clicks += toNumber(a.data.clicks)
            acc.spend += toNumber(a.data.spendNumber ?? a.data.spend ?? 0)
            acc.messages += toNumber(a.data.messages ?? 0)
            return acc
          },
          { impressions: 0, clicks: 0, spend: 0, messages: 0 },
        )
        const earliestCreatedAt = ads.reduce((earliest, a) => {
          if (!earliest) return a.createdAt as any
          return new Date(a.createdAt || 0) < new Date(earliest) ? a.createdAt : earliest
        }, null as any)
        const avgCostPerMessageNumber = summary.messages > 0 ? summary.spend / summary.messages : 0
        const avgCostPerClickNumber = summary.clicks > 0 ? summary.spend / summary.clicks : 0

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
            spendNumber: summary.spend,
            messages: summary.messages,
            avgCostPerMessage: formatCurrency(format2(avgCostPerMessageNumber)),
            avgCostPerMessageNumber,
            avgCostPerClick: formatCurrency(format2(avgCostPerClickNumber)),
            avgCostPerClickNumber,
          },
          ads,
        }
      }

      // 3) Thêm một campaign tổng “All Ads (Account)” để chắc chắn không bỏ sót ad nào chưa có trong DB
      const accountOnlyAds = allAdIds
        .map(id => ({ id, inDb:
          campaigns.flatMap(c=>c.ads||[]).some(a=>String(a.adId)===id) ||
          orphanAds.some(a=>String(a.adId)===id)
        }))
        .filter(x => !x.inDb)
        .map(x => buildAdViewFromId(x.id))

      let accountAllCampaign: any = null
      if (accountOnlyAds.length) {
        const sum = accountOnlyAds.reduce(
          (acc, a) => {
            acc.impressions += toNumber(a.data.impressions)
            acc.clicks += toNumber(a.data.clicks)
            acc.spend += toNumber(a.data.spendNumber ?? a.data.spend ?? 0)
            acc.messages += toNumber(a.data.messages ?? 0)
            return acc
          },
          { impressions: 0, clicks: 0, spend: 0, messages: 0 },
        )
        const avgCPM = sum.impressions > 0 ? (sum.spend / sum.impressions) * 1000 : 0
        accountAllCampaign = {
          campaignRefId: -1,
          campaignId: null,
          name: 'All Ads (Account)',
          objective: null,
          startTime: null,
          endTime: null,
          dailyBudget: 0,
          status: 'ACTIVE',
          createdAt: null,
          totals: {
            impressions: sum.impressions,
            clicks: sum.clicks,
            spend: formatCurrency(sum.spend),
            spendNumber: sum.spend,
            messages: sum.messages,
            avgCostPerMessage: formatCurrency(format2(sum.messages > 0 ? sum.spend / sum.messages : 0)),
            avgCostPerMessageNumber: sum.messages > 0 ? sum.spend / sum.messages : 0,
            avgCostPerClick: formatCurrency(format2(sum.clicks > 0 ? sum.spend / sum.clicks : 0)),
            avgCostPerClickNumber: sum.clicks > 0 ? sum.spend / sum.clicks : 0,
            // thêm tham khảo CPM bình quân
            // @ts-ignore
            cpmAvg: formatCurrency(format2(avgCPM)),
          },
          ads: accountOnlyAds,
        }
      }

      /** Return */
      const data = [...dataFromCampaigns]
      if (syntheticCampaign) data.push(syntheticCampaign)
      if (accountAllCampaign) data.push(accountAllCampaign)
      const total = campaignTotal + (syntheticCampaign ? 1 : 0) + (accountAllCampaign ? 1 : 0)
      return { data, total, page, pageSize }
    }

    /** ======= EXTERNAL: per-ad (có cookie nếu có) ======= */
    const tokenExternal = token
    const appsecret_proof_external = buildAppSecretProof(tokenExternal)

    const fetchAdRealtime = async (adId: string) => {
      if (!tokenExternal || !adId) {
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
            params: {
              fields: 'status',
              ...(appsecret_proof_external ? { appsecret_proof: appsecret_proof_external } : {}),
            },
            headers: { Authorization: `Bearer ${tokenExternal}` },
            timeout: 15000,
          }),
          client.get(`/${adId}/insights`, {
            params: {
              fields: INSIGHTS_FIELDS,
              date_preset: datePreset,
              ...(timeRange ? { time_range: JSON.stringify(timeRange) } : {}),
              time_increment: timeIncrement,                  // khớp lifetime
              action_report_time: actionReportTime,
              use_account_attribution_setting: useAccountAttribution,
              ...(appsecret_proof_external ? { appsecret_proof: appsecret_proof_external } : {}),
            },
            headers: { Authorization: `Bearer ${tokenExternal}` },
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

        let messages = 0
        if (Array.isArray(fb.actions)) {
          for (const a of fb.actions) {
            const atype = a && a.action_type ? String(a.action_type) : ''
            if (/(message|messag|conversation|onsite_conversion|omni_message)/i.test(atype)) {
              messages += toNumber(a.value ?? a['count'] ?? 0)
            }
          }
        }

        const costPerMessageNumber = messages > 0 ? spendNumber / messages : 0
        const costPerClickNumber = clicks > 0 ? spendNumber / clicks : 0

        return {
          status,
          insights: {
            impressions,
            clicks,
            spend: formatCurrency(spendNumber),
            spendNumber,
            ctr: format2(ctr),
            cpm: formatCurrency(format2(cpm)),
            messages,
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

        const avgCostPerMessageNumber = summary.messages > 0 ? summary.spend / summary.messages : 0
        const avgCostPerClickNumber = summary.clicks > 0 ? summary.spend / summary.clicks : 0

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
            spendNumber: summary.spend,
            messages: summary.messages,
            avgCostPerMessage: formatCurrency(format2(avgCostPerMessageNumber)),
            avgCostPerMessageNumber,
            avgCostPerClick: formatCurrency(format2(avgCostPerClickNumber)),
            avgCostPerClickNumber,
          },
          ads: adRealtime,
        }
      }),
    )

    /** orphan ads (external) */
    const orphanAds = await this.facebookAdRepo
      .createQueryBuilder('ad')
      .leftJoin('ad.campaign', 'campaign')
      .leftJoin('ad.createdBy', 'createdBy')
      .where('createdBy.id = :uid', { uid: userData?.id })
      .andWhere('campaign.id IS NULL')
      .orderBy('ad.createdAt', 'ASC')
      .getMany()

    let syntheticCampaign: any = null
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

      const earliestCreatedAt = adRealtime.reduce((earliest, a) => {
        if (!earliest) return a.createdAt as any
        return new Date(a.createdAt) < new Date(earliest) ? a.createdAt : earliest
      }, null as any)

      const avgCostPerMessageNumber = summary.messages > 0 ? summary.spend / summary.messages : 0
      const avgCostPerClickNumber = summary.clicks > 0 ? summary.spend / summary.clicks : 0

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

    const data = [...dataFromCampaigns]
    if (syntheticCampaign) data.push(syntheticCampaign)
    const total = campaignTotal + (syntheticCampaign ? 1 : 0)
    return { data, total, page, pageSize }
  }
}
