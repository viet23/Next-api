import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { Repository } from 'typeorm'
import { InjectRepository } from '@nestjs/typeorm'
import { CreateGroupRoleCommand } from '../impl/create-group-role.command'
import { Group } from '@models/group.entity'

@CommandHandler(CreateGroupRoleCommand)
export class CreateGroupRoleCommandHandler implements ICommandHandler<CreateGroupRoleCommand> {
  constructor(@InjectRepository(Group) private readonly groupRoleRepo: Repository<Group>) {}
  async execute(command: CreateGroupRoleCommand): Promise<Group | any> {
    const { dto } = command
    let group = await this.groupRoleRepo
      .createQueryBuilder('group')
      .leftJoinAndSelect('group.roles', 'roles')
      .where('group.name =:name', { name: dto.name })
      .getOne()
    if (!group) group = new Group()

    group.name = dto.name
    group.description = dto.description
    group.roles = dto.roles
    return this.groupRoleRepo.save(group)
  }
}
