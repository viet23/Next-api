import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import _ from 'lodash'
import { GetUsersQuery } from '../impl/get-users.query'
import { User } from '@models/user.entity'
import { UserSubscription } from '@models/user-subscription.entity'

@QueryHandler(GetUsersQuery)
export class GetUsersQueryHandler implements IQueryHandler<GetUsersQuery> {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(UserSubscription)
    private readonly userSubRepo: Repository<UserSubscription>,
  ) {}

  async execute(query: GetUsersQuery): Promise<any> {
    const { filter } = query

    const queryBuilder = this.userRepo.createQueryBuilder('u')

    // ---- Đọc điều kiện lọc ----
    const keyword = filter?.where?.keyword as string | undefined
    const status = filter?.where?.status as boolean | undefined
    const planRaw = filter?.where?.plan as string | undefined // ví dụ: "free" | "starter" | "pro" | "enterprise"

    // ---- Lọc theo keyword ----
    if (keyword) {
      queryBuilder.where('(u.username LIKE :keywords OR u.fullName LIKE :keywords)', { keywords: `%${keyword}%` })
    }

    // ---- Lọc theo status (isActive) ----
    if (status !== undefined) {
      queryBuilder.andWhere('u.isActive = :status', { status })
    }

    // ---- Lọc theo "current plan" (subscription mới nhất mỗi user) ----
    if (planRaw && planRaw.trim()) {
      const plan = planRaw.trim().toLowerCase()

      // Subquery: lấy updatedAt mới nhất cho từng userId (alias snake_case để tránh lỗi Postgres)
      const latestPerUserQb = this.userSubRepo
        .createQueryBuilder('s2')
        .select('s2.userId', 'user_id') // 👈 alias snake_case
        .addSelect('MAX(s2.updatedAt)', 'max_updated_at')
        .groupBy('s2.userId')

      // Join với subquery để lấy đúng bản ghi subscription mới nhất
      const latestSubs = await this.userSubRepo
        .createQueryBuilder('sub')
        .innerJoin(
          '(' + latestPerUserQb.getQuery() + ')',
          'mx',
          'mx.user_id = sub.userId AND mx.max_updated_at = sub.updatedAt',
        )
        .setParameters(latestPerUserQb.getParameters())
        .leftJoin('sub.plan', 'plan')
        .where('LOWER(plan.name) = :plan', { plan })
        .select('sub.userId', 'user_id') // 👈 alias snake_case nhất quán
        .getRawMany<{ user_id: string }>()

      const userIds = latestSubs.map((r) => r.user_id)

      // Không ai match -> trả về rỗng
      if (userIds.length === 0) {
        return { data: [], total: 0 }
      }

      // Lọc user theo danh sách userIds vừa tìm được
      queryBuilder.andWhere('u.id IN (:...userIds)', { userIds })
    }

    // ---- Sắp xếp & phân trang ----
    queryBuilder.orderBy('u.createdAt', 'DESC')

    const pageSize = filter?.pageSize || 20
    const page = filter?.page || 1
    const skip = (page - 1) * pageSize

    queryBuilder.take(pageSize)
    queryBuilder.skip(skip)

    const [data, total] = await queryBuilder.getManyAndCount()

    // ---- Lấy currentPlan cho từng user (bản ghi subscription mới nhất) ----
    const usersWithPlans = await Promise.all(
      data.map(async (user) => {
        const sub = await this.userSubRepo
          .createQueryBuilder('sub')
          .leftJoinAndSelect('sub.plan', 'plan')
          .where('sub.userId = :id', { id: user.id })
          .orderBy('sub.updatedAt', 'DESC')
          .getOne()

        return {
          ..._.omit(user, ['password']),
          currentPlan: sub
            ? {
                id: sub.id,
                name: sub.plan?.name,
                price: sub.plan?.price,
                startDate: sub.startDate,
                endDate: sub.endDate,
                isPaid: sub.isPaid,
              }
            : null,
        }
      }),
    )

    return { data: usersWithPlans, total }
  }
}
