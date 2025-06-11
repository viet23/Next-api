import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import _ from 'lodash'
import { GetUsersQuery } from '../impl/get-users.query'
import { User } from '@models/user.entity'
@QueryHandler(GetUsersQuery)
export class GetUsersQueryHandler implements IQueryHandler<GetUsersQuery> {
  constructor(@InjectRepository(User) private readonly userRepo: Repository<User>) {}
  async execute(query: GetUsersQuery): Promise<any> {
    const { filter } = query
    const queryBuilder = await this.userRepo.createQueryBuilder('u')
    if (filter?.where) {
      const { keyword, status } = filter.where
      keyword &&
        queryBuilder.where('(u.username LIKE :keywords OR u.fullName LIKE :keywords)', { keywords: `%${keyword}%` })
      status && queryBuilder.andWhere(`u.isActive = :status`, { status })
    }

    const pageSize = filter?.pageSize || 20
    const page = filter?.page || 1
    const skip = (page - 1) * pageSize
    queryBuilder.take(pageSize)
    queryBuilder.skip(skip)
    const [data, total] = await queryBuilder.getManyAndCount()
    return { data: data.map((user) => _.omit(user, ['password'])), total }
  }
}
