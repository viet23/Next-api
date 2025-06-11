import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import _ from 'lodash'
import { GetGroupRoleQuery } from '../impl/get-group-role.query'
import { Group } from '@models/group.entity'
@QueryHandler(GetGroupRoleQuery)
export class GetGroupRoleQueryHandler implements IQueryHandler<GetGroupRoleQuery> {
  constructor(@InjectRepository(Group) private readonly groupRepo: Repository<Group>) {}
  async execute(q: GetGroupRoleQuery): Promise<any> {
    return this.groupRepo.createQueryBuilder('group').getMany()
  }
}
