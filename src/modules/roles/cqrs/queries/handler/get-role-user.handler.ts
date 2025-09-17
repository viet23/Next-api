import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GetRoleUserQuery } from '../impl/get-role-user.query';
import { User } from '@models/user.entity';

@QueryHandler(GetRoleUserQuery)
export class GetRoleUserQueryHandler
  implements IQueryHandler<GetRoleUserQuery> {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) { }

  async execute(query: GetRoleUserQuery): Promise<any> {
    const { user } = query;

    let userData: User;

    if (user?.email) {
      userData = await this.userRepo
        .createQueryBuilder('user')
        .leftJoinAndSelect('user.groups', 'groups')
        .leftJoinAndSelect('groups.roles', 'roles')
        .leftJoinAndSelect('user.subscriptions', 'subscriptions')
        .leftJoinAndSelect('subscriptions.plan', 'plan')
        .where({ email: user.email })
        .orderBy('subscriptions.endDate', 'DESC')
        .getOne();
    } else {
      userData = await this.userRepo
        .createQueryBuilder('user')
        .leftJoinAndSelect('user.groups', 'groups')
        .leftJoinAndSelect('groups.roles', 'roles')
        .leftJoinAndSelect('user.subscriptions', 'subscriptions')
        .leftJoinAndSelect('subscriptions.plan', 'plan')
        .where({ id: user.id })
        .orderBy('subscriptions.updatedAt', 'DESC')
        .getOne();
    }

    if (!userData) return [];

    // Lấy subscription mới nhất
    const currentSubscription = userData.subscriptions?.length
      ? userData.subscriptions[0]
      : null;

    // Map groups và thêm currentPlan vào từng group
    return userData.groups.map((g) => ({
      ...g,
      currentPlan: currentSubscription
        ? {
          id: currentSubscription.id,
          name: currentSubscription.plan?.name,
          price: currentSubscription.plan?.price,
          startDate: currentSubscription.startDate,
          endDate: currentSubscription.endDate,
          isPaid: currentSubscription.isPaid,
        }
        : null,
    }));
  }
}
