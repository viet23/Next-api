import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import _ from 'lodash';
import { GetUsersQuery } from '../impl/get-users.query';
import { User } from '@models/user.entity';
import { UserSubscription } from '@models/user-subscription.entity';

@QueryHandler(GetUsersQuery)
export class GetUsersQueryHandler implements IQueryHandler<GetUsersQuery> {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(UserSubscription)
    private readonly userSubRepo: Repository<UserSubscription>,
  ) { }

  async execute(query: GetUsersQuery): Promise<any> {
    const { filter } = query;

    const queryBuilder = this.userRepo.createQueryBuilder('u');

    if (filter?.where) {
      const { keyword, status } = filter.where;
      if (keyword) {
        queryBuilder.where(
          '(u.username LIKE :keywords OR u.fullName LIKE :keywords)',
          { keywords: `%${keyword}%` },
        );
      }
      if (status !== undefined) {
        queryBuilder.andWhere(`u.isActive = :status`, { status });
      }
    }

    const pageSize = filter?.pageSize || 20;
    const page = filter?.page || 1;
    const skip = (page - 1) * pageSize;
    queryBuilder.take(pageSize);
    queryBuilder.skip(skip);

    const [data, total] = await queryBuilder.getManyAndCount();

    // lấy currentPlan cho từng user
    const usersWithPlans = await Promise.all(
      data.map(async (user) => {
        const sub = await this.userSubRepo
          .createQueryBuilder('sub')
          .leftJoinAndSelect('sub.plan', 'plan')
          .where('sub.userId = :id', { id: user.id })
          .orderBy('sub.updatedAt', 'DESC')
          .getOne();

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
        };
      }),
    );

    return { data: usersWithPlans, total };
  }
}
