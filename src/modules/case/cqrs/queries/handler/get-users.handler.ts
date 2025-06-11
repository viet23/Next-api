import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import _ from 'lodash'
import { PaginatedResult } from '@common/interfaces/paginated-result.interface'
import { GetUserCasesQuery } from '../impl/get-users.query'
import { User } from '@models/user.entity'
import { RoleEnum } from '@common/enums/roles.enum'
@QueryHandler(GetUserCasesQuery)
export class GetUserCasesQueryHandler implements IQueryHandler<GetUserCasesQuery> {
  constructor(@InjectRepository(User) private readonly userRepo: Repository<User>) {}
  async execute(query: GetUserCasesQuery): Promise<PaginatedResult<Partial<User>>> {
    const { filter } = query
    const queryBulider = this.userRepo
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.groups', 'groups')
      .leftJoinAndSelect('groups.roles', 'roles')
    if (filter?.where) {
      const { where } = filter
      where?.fullName &&
        queryBulider.where('unaccent(u.username) ILIKE unaccent(:term)', { term: `%${where.fullName}%` })
    }
    queryBulider.andWhere('roles.name =:name', { name: RoleEnum.ASSIGN_CASE })

    const [data, total] = await queryBulider.getManyAndCount()
    return {
      data: data,
      total: total,
    }
  }
}
