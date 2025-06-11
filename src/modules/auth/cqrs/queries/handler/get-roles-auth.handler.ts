import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { User } from 'src/models/user.entity'
import { Repository } from 'typeorm'
import _ from 'lodash'
import { GetRolesAuthQuery } from '../impl/get-roles-auth.query'
@QueryHandler(GetRolesAuthQuery)
export class GetRoleAuthQueryHandler implements IQueryHandler<GetRolesAuthQuery> {
  constructor(@InjectRepository(User) private readonly userRepo: Repository<User>) {}
  async execute(query: GetRolesAuthQuery): Promise<any> {
    const { userId } = query
    const user = await this.userRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.groups', 'groups')
      .leftJoinAndSelect('groups.roles', 'roles')
      .where({ id: userId })
      .getOne()
    return user?.groups
  }
}
