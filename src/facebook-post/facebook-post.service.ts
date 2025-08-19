// src/modules/facebook-post/facebook-post.service.ts
import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, ILike } from 'typeorm'
import { CreateFacebookPostDto } from './dto/create-facebook-post.dto'
import { UpdateFacebookPostDto } from './dto/update-facebook-post.dto'
import { FacebookPost } from '@models/facebook_post.entity'
import { QueryFacebookPostDto } from './dto/query-facebook-post.dto'


@Injectable()
export class FacebookPostService {
    constructor(
        @InjectRepository(FacebookPost)
        private readonly repo: Repository<FacebookPost>,
    ) { }

    async create(dto: CreateFacebookPostDto) {
        const entity = this.repo.create(dto)
        return this.repo.save(entity)
    }

    async findAll(query: QueryFacebookPostDto) {
        const { page = 1, limit = 20, search } = query
        const where = search
            ? [
                { postId: ILike(`%${search}%`) },
                { urlPost: ILike(`%${search}%`) },
            ]
            : undefined

        const [data, total] = await this.repo.findAndCount({
            where,
            order: { createdAt: 'DESC' },
            skip: (page - 1) * limit,
            take: limit,
        })

        return {
            data,
            meta: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
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
        // Nếu BaseEntity có deletedAt: dùng soft-remove
        if ('deletedAt' in found) {
            await this.repo.softRemove(found as any)
            return { success: true, softDeleted: true }
        }
        await this.repo.remove(found)
        return { success: true }
    }

    async restore(id: string) {
        // chỉ cần nếu dùng soft delete
        await this.repo.restore(id)
        return this.findOne(id)
    }
}
