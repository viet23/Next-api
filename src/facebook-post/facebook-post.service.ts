// src/modules/facebook-post/facebook-post.service.ts
import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, ILike } from 'typeorm'
import axios from 'axios'
import crypto from 'node:crypto'

import { CreateFacebookPostDto } from './dto/create-facebook-post.dto'
import { UpdateFacebookPostDto } from './dto/update-facebook-post.dto'
import { FacebookPost } from '@models/facebook_post.entity'
import { QueryFacebookPostDto } from './dto/query-facebook-post.dto'
import { User } from '@models/user.entity'   // ⬅️ thêm
import { log } from 'node:console'

@Injectable()
export class FacebookPostService {
    private readonly logger = new Logger(FacebookPostService.name)

    constructor(
        @InjectRepository(FacebookPost)
        private readonly repo: Repository<FacebookPost>,

        @InjectRepository(User)                     // ⬅️ thêm
        private readonly userRepo: Repository<User> // ⬅️ thêm
    ) { }

    // ================== GIỮ NGUYÊN CÁC HÀM CRUD CŨ SẴN ==================
    async create(dto: CreateFacebookPostDto) {
        const entity = this.repo.create(dto)
        return this.repo.save(entity)
    }

    async findAll(query: QueryFacebookPostDto) {
        const { page = 1, limit = 20, search } = query
        const where = search
            ? [{ postId: ILike(`%${search}%`) }, { urlPost: ILike(`%${search}%`) }]
            : undefined

        const [data, total] = await this.repo.findAndCount({
            where,
            order: { createdAt: 'DESC' },
            skip: (page - 1) * limit,
            take: limit,
        })

        return {
            data,
            meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
        }
    }

    async findOne(id: string) {
        const found = await this.repo.findOne({ where: { postId: id } })
        if (!found) throw new NotFoundException('FacebookPost không tồn tại')
        return found
    }

    async update(id: string, dto: UpdateFacebookPostDto) {
        const found = await this.findOne(id)
        Object.assign(found, dto)
        return this.repo.save(found)
    }

    async remove(id: string) {
        const found = await this.findOne(id)
        if ('deletedAt' in found) {
            await this.repo.softRemove(found as any)
            return { success: true, softDeleted: true }
        }
        await this.repo.remove(found)
        return { success: true }
    }

    async restore(id: string) {
        await this.repo.restore(id)
        return this.findOne(id)
    }

    // ================== THÊM CÁC HỖ TRỢ GỌI GRAPH Ở BE ==================

    /** header dùng cho mọi call Graph */
    private fbHeaders(token?: string, rawCookie?: string) {
        const h: Record<string, string> = { Accept: 'application/json' }
        if (token) h.Authorization = `Bearer ${token}`
        if (rawCookie) h.Cookie = rawCookie               // "c_user=...; xs=...; fr=..."
        return h
    }

    /** appsecret_proof nếu app bật */
    private buildAppSecretProof(token?: string) {
        const secret = process.env.FB_APP_SECRET
        if (!token || !secret) return undefined
        return crypto.createHmac('sha256', secret).update(token).digest('hex')
    }

    /** Lấy tất cả posts của 1 page (phân trang) — chạy ở BE nên ép được Cookie */
    private async fetchAllPostsFromGraph(
        pageId: string,
        accessToken: string,
        rawCookie: string
    ) {
        const fields =
            "id,message,created_time,full_picture,permalink_url,likes.summary(true),comments.summary(true),shares";
        const base = `https://graph.facebook.com/v19.0/${pageId}/posts`;
        const appsecret_proof = this.buildAppSecretProof(accessToken);

        const params = new URLSearchParams({
            fields,
            limit: "100",
            access_token: accessToken,
        });
        if (appsecret_proof) params.append("appsecret_proof", appsecret_proof);

        let url: string | null = `${base}?${params.toString()}`;
        const all: any[] = [];

        try {
            while (url) {
                try {
                    const { data } = await axios.get(url, {
                        headers: this.fbHeaders(accessToken, rawCookie),
                        timeout: 20000,
                    });

                    if (Array.isArray(data?.data)) {
                        all.push(...data.data);
                    }
                    url = data?.paging?.next ?? null;
                } catch (err: any) {
                    console.error(
                        "[fetchAllPostsFromGraph] Error fetching posts:",
                        {
                            url,
                            pageId,
                            message: err?.message,
                            response: err?.response?.data,
                        }
                    );
                    break; // hoặc throw err;
                }
            }
        } catch (outerErr) {
            console.error("[fetchAllPostsFromGraph] Unexpected error:", outerErr);
            throw outerErr;
        }

        return all;
    }

    /** Lấy reach (post_impressions_unique) cho từng post id */
    private async fetchReachForPosts(postIds: string[], accessToken: string, rawCookie?: string) {
        const appsecret_proof = this.buildAppSecretProof(accessToken)
        const out = new Map<string, number>()

        const queue = [...postIds]
        const CONCURRENCY = 5
        const worker = async () => {
            while (queue.length) {
                const id = queue.shift()!
                try {
                    const params: Record<string, string> = {
                        metric: 'post_impressions_unique',
                        access_token: accessToken,
                    }
                    if (appsecret_proof) params['appsecret_proof'] = appsecret_proof

                    const { data } = await axios.get(
                        `https://graph.facebook.com/v19.0/${id}/insights`,
                        { params, headers: this.fbHeaders(accessToken, rawCookie), timeout: 20000 }
                    )
                    const reach = data?.data?.[0]?.values?.[0]?.value ?? 0
                    out.set(id, Number(reach) || 0)
                } catch (e) {
                    this.logger.warn(`Reach fail for ${id}: ${e instanceof Error ? e.message : e}`)
                    out.set(id, 0)
                }
            }
        }
        await Promise.all(Array.from({ length: CONCURRENCY }, worker))
        return out
    }

    /**
     * API nội bộ: lấy posts + reach từ Graph rồi format trả về FE
     * - Nếu không truyền pageId: dùng user.idPage
     * - Lấy token/cookie từ DB theo user.email
     */
    async fetchPagePostsForUser(userdto: User) {
        const userEmail = userdto.email
        const pageIdOptional = userdto.idPage
        console.log('user:', userEmail, 'pageIdOptional:', pageIdOptional);
        const user = await this.userRepo.findOne({ where: { email: userEmail } })

        console.log('user found:', !!user, user ? { id: user.id, email: user.email, idPage: user.idPage } : null);

        if (!user) throw new BadRequestException('Không tìm thấy user')
        const pageId = pageIdOptional || user.idPage
        if (!pageId) throw new BadRequestException('Thiếu pageId')
        if (!user.accessToken) throw new BadRequestException('User thiếu accessTokenUser')

        const accessToken = user.accessToken
        const rawCookie = user.cookie // "c_user=...; xs=...; fr=..."

        // 1) posts
        const posts = await this.fetchAllPostsFromGraph(pageId, accessToken, rawCookie)

        // 2) reach từng post
        const idList = posts.map((p: any) => p?.id).filter(Boolean)
        const reachMap = await this.fetchReachForPosts(idList, accessToken, rawCookie)

        // 3) format giống FE
        const formatted = posts.map((post: any, idx: number) => ({
            key: String(idx + 1),
            id: post.id,
            media: post.full_picture || null, // FE render <Image/> từ URL này
            caption: post.message || '(No content)',
            react: post?.likes?.summary?.total_count || 0,
            comment: post?.comments?.summary?.total_count || 0,
            share: post?.shares?.count || 0,
            createdTime: post.created_time,
            reach: reachMap.get(post.id) || 0,
            url: post.full_picture || null,
            permalink_url: post.permalink_url || null,
        }))

        // 4) thống kê theo tháng (12 ô)
        const monthlyCount = Array.from({ length: 12 }, (_, i) => ({
            date: String(i + 1).padStart(2, '0'),
            quantity: 0,
        }))
        for (const p of posts) {
            const m = new Date(p.created_time).getMonth() // 0-11
            if (monthlyCount[m]) monthlyCount[m].quantity += 1
        }

        return {
            data: formatted,
            meta: {
                total: posts.length,
                monthlyCount,
            },
        }
    }

    // ================== NEW: INSIGHTS PAGE VIEWS (14 ngày) ==================

    /** NEW: core call insights page_views_total theo ngày */
    private async fetchPageViewsDaily(
        pageId: string,
        accessToken: string,
        rawCookie?: string,
        days = 14
    ): Promise<Array<{ name: string; views: number }>> {
        if (!pageId || !accessToken) throw new BadRequestException('Missing pageId/accessToken');

        const metric = 'page_views_total';
        const appsecret_proof = this.buildAppSecretProof(accessToken);
        const headers = this.fbHeaders(accessToken, rawCookie);
        const baseUrl = `https://graph.facebook.com/v19.0/${pageId}/insights`;

        // helper: format [{ name:'dd/MM', views }]
        const formatValues = (values: any[]) =>
            (values || []).map((item: any) => {
                const d = new Date(item?.end_time);
                // FE dùng local time → giữ getDate/getMonth
                const day = String(d.getDate()).padStart(2, '0');
                const month = String(d.getMonth() + 1).padStart(2, '0');
                return { name: `${day}/${month}`, views: item?.value ?? 0 };
            });

        // 1) Ưu tiên date_preset nếu days ∈ {7,14,28} (ổn định hơn)
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

                const { data } = await axios.get(baseUrl, { params: paramsPreset, headers, timeout: 20000 });
                console.log('[fetchPageViewsDaily] preset data:', data);
                
                const rawValues = data?.data?.find((it: any) => it?.name === metric)?.values ?? [];
                if (Array.isArray(rawValues) && rawValues.length) {
                    return formatValues(rawValues);
                }
                // rơi xuống since/until nếu preset không có dữ liệu
                this.logger.warn('[fetchPageViewsDaily] preset empty, fallback to since/until', { days });
            }

            // 2) Fallback: since/until (chuẩn hoá thật sự “end-of-yesterday UTC”)
            const nowSec = Math.floor(Date.now() / 1000);
            const todayUtc = new Date();
            todayUtc.setUTCHours(0, 0, 0, 0);
            const endOfYesterdayUtc = new Date(todayUtc.getTime() - 1); // 23:59:59.999 hôm qua
            const endOfYesterdaySec = Math.min(Math.floor(endOfYesterdayUtc.getTime() / 1000), nowSec);

            const sinceDateUtc = new Date((endOfYesterdaySec - (days - 1) * 86400) * 1000);
            sinceDateUtc.setUTCHours(0, 0, 0, 0);
            const sinceSec = Math.floor(sinceDateUtc.getTime() / 1000);
            const untilSec = endOfYesterdaySec;

            this.logger.log('[fetchPageViewsDaily] time window', {
                sinceSec, untilSec,
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

            const { data: dataRange } = await axios.get(baseUrl, { params: paramsRange, headers, timeout: 20000 });
            const rawValues2 = dataRange?.data?.find((it: any) => it?.name === metric)?.values ?? [];
            return formatValues(rawValues2);
        } catch (err: any) {
            this.logger.error('[fetchPageViewsDaily] Error', {
                pageId,
                message: err?.message,
                response: err?.response?.data,
            } as any);
            throw new BadRequestException(err?.response?.data?.error?.message || 'Facebook Insights error');
        }
    }



    /**
     * NEW: Wrapper theo user – trả mảng { name: 'dd/MM', views: number } cho FE vẽ chart
     * - Nếu không truyền pageId: lấy từ user.idPage
     * - Lấy token/cookie từ DB theo user.email
     */
    async fetchPageViewsForUser(userdto: User, days = 14) {
        const userEmail = userdto.email
        const pageIdOptional = userdto.idPage
        const user = await this.userRepo.findOne({ where: { email: userEmail } })
        if (!user) throw new BadRequestException('Không tìm thấy user')

        const pageId = pageIdOptional || user.idPage
        if (!pageId) throw new BadRequestException('Thiếu pageId')
        if (!user.accessToken) throw new BadRequestException('User thiếu accessTokenUser')

        const accessToken = user.accessToken
        const rawCookie = user.cookie

        const data = await this.fetchPageViewsDaily(pageId, accessToken, rawCookie, days)
        return { ok: true, data } // FE setDataChart(json.data)
    }
}
