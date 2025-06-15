import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import _ from 'lodash'
import { Role } from '@models/role.entity'
import { GetRoleUserQuery } from '../impl/get-role-user.query'
import { User } from '@models/user.entity'
@QueryHandler(GetRoleUserQuery)
export class GetRoleUserQueryHandler implements IQueryHandler<GetRoleUserQuery> {
  constructor(@InjectRepository(User) private readonly userRepo: Repository<User>) { }

  async execute(query: GetRoleUserQuery): Promise<any> {
    const { user } = query
    if (user?.email) {
      const userRole = await this.userRepo
        .createQueryBuilder('user')
        .leftJoinAndSelect('user.groups', 'groups')
        .leftJoinAndSelect('groups.roles', 'roles')
        .where({ email: user.email })
        .getOne()
      return userRole.groups
    }
    const userRole = await this.userRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.groups', 'groups')
      .leftJoinAndSelect('groups.roles', 'roles')
      .where({ id: user.id })
      .getOne()
    return userRole.groups

  }
}
