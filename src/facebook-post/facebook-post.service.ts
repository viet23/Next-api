// src/modules/facebook-post/facebook-post.service.ts
import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import axios, { AxiosInstance } from 'axios';
import https from 'https';
import dns from 'dns';
import crypto from 'node:crypto';

import { CreateFacebookPostDto } from './dto/create-facebook-post.dto';
import { UpdateFacebookPostDto } from './dto/update-facebook-post.dto';
import { FacebookPost } from '@models/facebook_post.entity';
import { QueryFacebookPostDto } from './dto/query-facebook-post.dto';
import { User } from '@models/user.entity';

@Injectable()
export class FacebookPostService {
  private readonly logger = new Logger(FacebookPostService.name);

  constructor(
    @InjectRepository(FacebookPost)
    private readonly repo: Repository<FacebookPost>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  // ================== CRUD ==================
  async create(dto: CreateFacebookPostDto) {
    const entity = this.repo.create(dto);
    return this.repo.save(entity);
  }

  async findAll(query: QueryFacebookPostDto) {
    const { page = 1, limit = 20, search } = query;
    const where = search
      ? [{ postId: ILike(`%${search}%`) }, { urlPost: ILike(`%${search}%`) }]
      : undefined;

    const [data, total] = await this.repo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const found = await this.repo.findOne({ where: { postId: id } });
    if (!found) throw new NotFoundException('FacebookPost không tồn tại');
    return found;
  }

  async update(id: string, dto: UpdateFacebookPostDto) {
    const found = await this.findOne(id);
    Object.assign(found, dto);
    return this.repo.save(found);
  }

  async remove(id: string) {
    const found = await this.findOne(id);
    if ('deletedAt' in found) {
      await this.repo.softRemove(found as any);
      return { success: true, softDeleted: true };
    }
    await this.repo.remove(found);
    return { success: true };
  }

  async restore(id: string) {
    await this.repo.restore(id);
    return this.findOne(id);
  }

  // ================== HTTP CLIENT cho Graph ==================

  /** Ép IPv4 để tránh tuyến IPv6 chập chờn (có thể bỏ nếu hạ tầng IPv6 ổn) */
  private readonly lookupIPv4 = (
    hostname: string,
    options: any,
    callback: any,
  ) => {
    if (typeof options === 'function') {
      callback = options as any;
      options = {};
    }
    return dns.lookup(
      hostname,
      { ...(options as dns.LookupOneOptions), family: 4 },
      callback as any,
    );
  };

  private readonly httpsAgent = new https.Agent({
    keepAlive: true,
    maxSockets: 50,
    timeout: 65_000, // socket timeout
    // comment dòng dưới nếu muốn để OS tự chọn IPv4/IPv6
    lookup: this.lookupIPv4,
  });

  private readonly fbHttp: AxiosInstance = axios.create({
    timeout: 60_000, // request timeout
    httpsAgent: this.httpsAgent,
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      Connection: 'keep-alive',
      'User-Agent': 'AllOneAds/1.0 (+axios)',
    },
    proxy: false,
  });

  /** Retry đơn giản cho timeout/ECONNABORTED */
  private async withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
    let lastErr: any;
    for (let i = 0; i < tries; i++) {
      try {
        return await fn();
      } catch (e: any) {
        const isTimeout =
          e?.code === 'ECONNABORTED' ||
          `${e?.message || ''}`.toLowerCase().includes('timeout');
        if (!isTimeout && e?.response) throw e; // lỗi HTTP có response (token/permission) thì không retry
        lastErr = e;
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, i))); // 1s, 2s, 4s
      }
    }
    throw lastErr;
  }

  // ================== HỖ TRỢ GỌI GRAPH ==================

  /** header dùng cho mọi call Graph (giữ Cookie nếu cần) */
  private fbHeaders(token?: string, rawCookie?: string) {
    const h: Record<string, string> = { Accept: 'application/json' };
    if (token) h.Authorization = `Bearer ${token}`;
    if (rawCookie) h.Cookie = rawCookie; // "c_user=...; xs=...; fr=..."
    h['Accept-Encoding'] = 'gzip, deflate';
    h['Connection'] = 'keep-alive';
    return h;
  }

  /** appsecret_proof nếu app bật */
  private buildAppSecretProof(token?: string) {
    const secret = process.env.FB_APP_SECRET;
    if (!token || !secret) return undefined;
    return crypto.createHmac('sha256', secret).update(token).digest('hex');
  }

  /** Fields gọn & đủ số liệu tổng hợp */
  private buildPostFields() {
    // Dùng reactions & tổng count của comments để nhẹ hơn
    return [
      'id',
      'message',
      'created_time',
      'permalink_url',
      'full_picture',
      'comments.limit(0).summary(total_count)',
      'reactions.limit(0).summary(total_count)',
      'shares',
    ].join(',');
  }

  /** Lấy tất cả posts của 1 page (phân trang) — tối ưu chống timeout */
  private async fetchAllPostsFromGraph(
    pageId: string,
    accessToken: string,
    rawCookie: string,
    useFeed = false, // cho phép thử /feed nếu muốn
  ) {
    const MAX_POSTS = 150; // giới hạn
    const PAGE_SIZE = 25; // 25–50 là hợp lý; 100 dễ timeout nếu fields nặng

    const fields = this.buildPostFields();
    const endpoint = useFeed ? 'feed' : 'posts';
    const base = `https://graph.facebook.com/v19.0/${pageId}/${endpoint}`;
    const appsecret_proof = this.buildAppSecretProof(accessToken);

    const params = new URLSearchParams({
      fields,
      limit: String(PAGE_SIZE),
      access_token: accessToken,
    });
    if (appsecret_proof) params.append('appsecret_proof', appsecret_proof);

    let url: string | null = `${base}?${params.toString()}`;
    const all: any[] = [];

    try {
      while (url && all.length < MAX_POSTS) {
        const { data } = await this.withRetry(() =>
          this.fbHttp.get(url!, { headers: this.fbHeaders(accessToken, rawCookie) }),
        );

        if (Array.isArray(data?.data) && data.data.length) {
          all.push(...data.data);
          if (all.length >= MAX_POSTS) break;
        }

        // Facebook tự gắn access_token & appsecret_proof trong paging.next
        url = data?.paging?.next ?? null;
      }
    } catch (err: any) {
      // log gọn, không in access_token
      this.logger.error('[fetchAllPostsFromGraph] Error', {
        pageId,
        message: err?.message,
        code: err?.code,
        status: err?.response?.status,
        fb: err?.response?.data,
      } as any);
    }

    return all.slice(0, MAX_POSTS);
  }

  /** Lấy reach (post_impressions_unique) cho từng post id */
  private async fetchReachForPosts(
    postIds: string[],
    accessToken: string,
    rawCookie?: string,
  ) {
    const appsecret_proof = this.buildAppSecretProof(accessToken);
    const out = new Map<string, number>();

    const queue = [...postIds];
    const CONCURRENCY = 5;

    const worker = async () => {
      while (queue.length) {
        const id = queue.shift()!;
        try {
          const params: Record<string, string> = {
            metric: 'post_impressions_unique',
            access_token: accessToken,
          };
          if (appsecret_proof) params['appsecret_proof'] = appsecret_proof;

          const { data } = await this.withRetry(() =>
            this.fbHttp.get(`https://graph.facebook.com/v19.0/${id}/insights`, {
              params,
              headers: this.fbHeaders(accessToken, rawCookie),
            }),
          );
          const reach = data?.data?.[0]?.values?.[0]?.value ?? 0;
          out.set(id, Number(reach) || 0);
        } catch (e: any) {
          this.logger.warn(
            `Reach fail for ${id}: ${e?.message || (e instanceof Error ? e.message : String(e))}`,
          );
          out.set(id, 0);
        }
      }
    };

    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    return out;
  }

  /**
   * API nội bộ: lấy posts + reach từ Graph rồi format trả về FE
   * - Nếu không truyền pageId: dùng user.idPage
   * - Lấy token/cookie từ DB theo user.email
   */
  async fetchPagePostsForUser(userdto: User) {
    const userEmail = userdto.email;
    const pageIdOptional = userdto.idPage;

    const user = await this.userRepo.findOne({ where: { email: userEmail } });
    this.logger.log('user found: ' + String(!!user), user ? { id: user.id, email: user.email, idPage: user.idPage } : null);

    if (!user) throw new BadRequestException('Không tìm thấy user');

    const pageId = pageIdOptional || user.idPage;
    if (!pageId) throw new BadRequestException('Thiếu pageId');
    if (!user.accessToken) throw new BadRequestException('User thiếu accessTokenUser');

    const accessToken = user.accessToken;
    const rawCookie = user.cookie; // "c_user=...; xs=...; fr=..."

    // 1) posts
    const posts = await this.fetchAllPostsFromGraph(pageId, accessToken, rawCookie);

    // 2) reach từng post
    const idList = posts.map((p: any) => p?.id).filter(Boolean);
    const reachMap = await this.fetchReachForPosts(idList, accessToken, rawCookie);

    // 3) format trả về FE
    const formatted = posts.map((post: any, idx: number) => {
      const reactionsTotal =
        post?.reactions?.summary?.total_count ??
        post?.likes?.summary?.total_count ??
        0; // fallback nếu có trường likes từ cache cũ

      return {
        key: String(idx + 1),
        id: post.id,
        media: post.full_picture || null, // FE render <Image/> từ URL này
        caption: post.message || '(No content)',
        react: reactionsTotal,
        comment: post?.comments?.summary?.total_count || 0,
        share: post?.shares?.count || 0,
        createdTime: post.created_time,
        reach: reachMap.get(post.id) || 0,
        url: post.full_picture || null,
        permalink_url: post.permalink_url || null,
      };
    });

    // 4) thống kê theo tháng (12 ô)
    const monthlyCount = Array.from({ length: 12 }, (_, i) => ({
      date: String(i + 1).padStart(2, '0'),
      quantity: 0,
    }));
    for (const p of posts) {
      const m = new Date(p.created_time).getMonth(); // 0-11
      if (monthlyCount[m]) monthlyCount[m].quantity += 1;
    }

    return {
      data: formatted,
      meta: {
        total: posts.length,
        monthlyCount,
      },
    };
  }

  // ================== INSIGHTS PAGE VIEWS (14 ngày) ==================

  /** core call insights page_views_total theo ngày */
  private async fetchPageViewsDaily(
    pageId: string,
    accessToken: string,
    rawCookie?: string,
    days = 14,
  ): Promise<Array<{ name: string; views: number }>> {
    if (!pageId || !accessToken)
      throw new BadRequestException('Missing pageId/accessToken');

    const metric = 'page_views_total';
    const appsecret_proof = this.buildAppSecretProof(accessToken);
    const headers = this.fbHeaders(accessToken, rawCookie);
    const baseUrl = `https://graph.facebook.com/v19.0/${pageId}/insights`;

    // helper: format [{ name:'dd/MM', views }]
    const formatValues = (values: any[]) =>
      (values || []).map((item: any) => {
        const d = new Date(item?.end_time);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        return { name: `${day}/${month}`, views: item?.value ?? 0 };
      });

    // 1) date_preset nếu days ∈ {7,14,28}
    const presetMap: Record<number, 'last_7d' | 'last_14d' | 'last_28d'> = {
      7: 'last_7d',
      14: 'last_14d',
      28: 'last_28d',
    };
    const tryPresetFirst = presetMap[days] !== undefined;

    try {
      if (tryPresetFirst) {
        const paramsPreset: Record<string, string> = {
          metric,
          period: 'day',
          date_preset: presetMap[days],
          access_token: accessToken,
        };
        if (appsecret_proof) paramsPreset.appsecret_proof = appsecret_proof;

        const { data } = await this.withRetry(() =>
          this.fbHttp.get(baseUrl, { params: paramsPreset, headers }),
        );
        this.logger.log('[fetchPageViewsDaily] preset data:', data);

        const rawValues =
          data?.data?.find((it: any) => it?.name === metric)?.values ?? [];
        if (Array.isArray(rawValues) && rawValues.length) {
          return formatValues(rawValues);
        }
        this.logger.warn(
          '[fetchPageViewsDaily] preset empty, fallback to since/until',
          { days },
        );
      }

      // 2) Fallback: since/until (end-of-yesterday UTC)
      const nowSec = Math.floor(Date.now() / 1000);
      const todayUtc = new Date();
      todayUtc.setUTCHours(0, 0, 0, 0);
      const endOfYesterdayUtc = new Date(todayUtc.getTime() - 1);
      const endOfYesterdaySec = Math.min(
        Math.floor(endOfYesterdayUtc.getTime() / 1000),
        nowSec,
      );

      const sinceDateUtc = new Date(
        (endOfYesterdaySec - (days - 1) * 86400) * 1000,
      );
      sinceDateUtc.setUTCHours(0, 0, 0, 0);
      const sinceSec = Math.floor(sinceDateUtc.getTime() / 1000);
      const untilSec = endOfYesterdaySec;

      this.logger.log('[fetchPageViewsDaily] time window', {
        sinceSec,
        untilSec,
        sinceISO: new Date(sinceSec * 1000).toISOString(),
        untilISO: new Date(untilSec * 1000).toISOString(),
        days,
      });

      const paramsRange: Record<string, string> = {
        metric,
        period: 'day',
        since: String(sinceSec),
        until: String(untilSec),
        access_token: accessToken,
      };
      if (appsecret_proof) paramsRange.appsecret_proof = appsecret_proof;

      const { data: dataRange } = await this.withRetry(() =>
        this.fbHttp.get(baseUrl, { params: paramsRange, headers }),
      );
      const rawValues2 =
        dataRange?.data?.find((it: any) => it?.name === metric)?.values ?? [];
      return formatValues(rawValues2);
    } catch (err: any) {
      this.logger.error('[fetchPageViewsDaily] Error', {
        pageId,
        message: err?.message,
        response: err?.response?.data,
      } as any);
      throw new BadRequestException(
        err?.response?.data?.error?.message || 'Facebook Insights error',
      );
    }
  }

  /**
   * Wrapper theo user – trả mảng { name: 'dd/MM', views: number } cho FE vẽ chart
   * - Nếu không truyền pageId: lấy từ user.idPage
   * - Lấy token/cookie từ DB theo user.email
   */
  async fetchPageViewsForUser(userdto: User, days = 14) {
    const userEmail = userdto.email;
    const pageIdOptional = userdto.idPage;
    const user = await this.userRepo.findOne({ where: { email: userEmail } });
    if (!user) throw new BadRequestException('Không tìm thấy user');

    const pageId = pageIdOptional || user.idPage;
    if (!pageId) throw new BadRequestException('Thiếu pageId');
    if (!user.accessToken)
      throw new BadRequestException('User thiếu accessTokenUser');

    const accessToken = user.accessToken;
    const rawCookie = user.cookie;

    const data = await this.fetchPageViewsDaily(
      pageId,
      accessToken,
      rawCookie,
      days,
    );
    return { ok: true, data }; // FE setDataChart(json.data)
  }
}
