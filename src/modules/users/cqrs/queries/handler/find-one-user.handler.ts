import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { FindOneUserQuery } from '../impl/find-one-user.query'
import { InjectRepository } from '@nestjs/typeorm'
import { User } from '@models/user.entity'
import { Repository } from 'typeorm'
import { CreditTransaction } from '@models/credit-ransaction .entity'

@QueryHandler(FindOneUserQuery)
export class FindOneUserQueryHandler implements IQueryHandler<FindOneUserQuery> {
  constructor(
    @InjectRepository(CreditTransaction) private readonly creditRepo: Repository<CreditTransaction>,
    @InjectRepository(User) private readonly userRepo: Repository<User>) { }
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
    const creditsData = await this.creditRepo.find({
      where: { updatedById: user?.id.toString() },
      order: { paymentDate: 'DESC' },
    })
    user['creditsData'] = creditsData || []

    return user


  }
}
