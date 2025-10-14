import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { FindOneUserQuery } from '../impl/find-one-user.query'
import { InjectRepository } from '@nestjs/typeorm'
import { User } from '@models/user.entity'
import { Repository } from 'typeorm'
import { CreditTransaction } from '@models/credit-ransaction .entity'
import { UserSubscription } from '@models/user-subscription.entity'

@QueryHandler(FindOneUserQuery)
export class FindOneUserQueryHandler implements IQueryHandler<FindOneUserQuery> {
  constructor(
    @InjectRepository(CreditTransaction)
    private readonly creditRepo: Repository<CreditTransaction>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(UserSubscription)
    private readonly userSubRepo: Repository<UserSubscription>,
  ) {}

  async execute(query: FindOneUserQuery): Promise<User> {
    const { userId } = query

    const user = await this.userRepo
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.groups', 'group')
      .leftJoinAndSelect('group.roles', 'roles')
      .where('u.id=:id', { id: userId })
      .getOne()

    if (!user) {
      throw new Error(`User with id ${userId} not found`)
    }

    // Lấy lịch sử credits
    const creditsData = await this.creditRepo.find({
      where: { updatedById: user.id.toString() },
      order: { paymentDate: 'DESC' },
    })
    user['creditsData'] = creditsData || []

    // Lấy gói dịch vụ hiện tại (subscription mới nhất)
    const sub = await this.userSubRepo
      .createQueryBuilder('sub')
      .leftJoinAndSelect('sub.plan', 'plan')
      .where('sub.userId = :id', { id: user.id })
      .orderBy('sub.updatedAt', 'DESC')
      .getOne()

    user['currentPlan'] = sub
      ? {
          id: sub.id,
          name: sub.plan?.name,
          price: sub.plan?.price,
          startDate: sub.startDate,
          endDate: sub.endDate,
          isPaid: sub.isPaid,
        }
      : null

    return user
  }
}
