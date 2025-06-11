import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import _ from 'lodash'
import { FindGroupRoleQuery } from '../impl/find-group-role.query'
import { Group } from '@models/group.entity'
@QueryHandler(FindGroupRoleQuery)
export class FindBlackListQueryHandler implements IQueryHandler<FindGroupRoleQuery> {
  constructor(@InjectRepository(Group) private readonly groupRepo: Repository<Group>) {}
  async execute(q: FindGroupRoleQuery): Promise<Group> {
    const { id } = q
    return this.groupRepo
      .createQueryBuilder('group')
      .leftJoinAndSelect('group.roles', 'roles')
      .where('group.id =:id', { id })
      .getOne()
  }
}
