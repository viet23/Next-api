import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import _ from 'lodash'
import { GetRoleQuery } from '../impl/get-role.query'
import { Role } from '@models/role.entity'
@QueryHandler(GetRoleQuery)
export class GetRoleQueryHandler implements IQueryHandler<GetRoleQuery> {
  constructor(@InjectRepository(Role) private readonly roleRepo: Repository<Role>) {}
  async execute(): Promise<any> {
    return this.roleRepo.createQueryBuilder('role').getMany()
  }
}
