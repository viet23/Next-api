import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { Repository } from 'typeorm'
import { InjectRepository } from '@nestjs/typeorm'
import { CreateRoleCommand } from '../impl/create-role.command'
import { Role } from '@models/role.entity'

@CommandHandler(CreateRoleCommand)
export class CreateRoleCommandHandler implements ICommandHandler<CreateRoleCommand> {
  constructor(@InjectRepository(Role) private readonly roleRepo: Repository<Role>) {}
  async execute(command: CreateRoleCommand): Promise<Role | any> {
    const { dto } = command
    let role = new Role()
    role.name = dto.name
    role.description = dto.description
    return this.roleRepo.save(role)
  }
}
