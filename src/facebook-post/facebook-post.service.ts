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

@Injectable()
export class FacebookPostService {
    private readonly logger = new Logger(FacebookPostService.name)

    constructor(
        @InjectRepository(FacebookPost)
        private readonly repo: Repository<FacebookPost>,

        @InjectRepository(User)                     // ⬅️ thêm
        private readonly userRepo: Repository<User> // ⬅️ thêm
    ) { }

    // ================== GIỮ NGUYÊN CÁC HÀM CRUD CỦ SẴN ==================
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
    private async fetchAllPostsFromGraph(pageId: string, accessToken: string, rawCookie?: string) {
        const fields =
            'id,message,created_time,full_picture,permalink_url,likes.summary(true),comments.summary(true),shares'
        const base = `https://graph.facebook.com/v19.0/${pageId}/posts`
        const appsecret_proof = this.buildAppSecretProof(accessToken)

        const params = new URLSearchParams({
            fields,
            limit: '100',
            access_token: accessToken,
        })
        if (appsecret_proof) params.append('appsecret_proof', appsecret_proof)

        let url: string | null = `${base}?${params.toString()}`
        const all: any[] = []

        while (url) {
            const { data } = await axios.get(url, {
                headers: this.fbHeaders(accessToken, rawCookie),
                timeout: 20000,
            })
            if (Array.isArray(data?.data)) all.push(...data.data)
            url = data?.paging?.next ?? null
        }
        return all
    }

    /** Lấy reach (post_impressions_unique) cho từng post id */
    private async fetchReachForPosts(postIds: string[], accessToken: string, rawCookie?: string) {
        const appsecret_proof = this.buildAppSecretProof(accessToken)
        const out = new Map<string, number>()

        // hạn chế đồng thời 5
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
        if (!user.accessTokenUser) throw new BadRequestException('User thiếu accessTokenUser')

        const accessToken = user.accessTokenUser
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
}
