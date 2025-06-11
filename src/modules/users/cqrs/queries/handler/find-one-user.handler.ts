import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { FindOneUserQuery } from '../impl/find-one-user.query'
import { InjectRepository } from '@nestjs/typeorm'
import { User } from '@models/user.entity'
import { Repository } from 'typeorm'

@QueryHandler(FindOneUserQuery)
export class FindOneUserQueryHandler implements IQueryHandler<FindOneUserQuery> {
  constructor(@InjectRepository(User) private readonly userRepo: Repository<User>) {}
  async execute(query: FindOneUserQuery): Promise<User> {
    const { userId } = query
    return this.userRepo
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.groups', 'group')
      .leftJoinAndSelect('group.roles', 'roles')
      .where('u.id=:id', { id: userId })
      .getOne()
  }
}
