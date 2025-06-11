import { Role } from '@models/role.entity'
import { RoleDTO } from '@modules/roles/dto/role.dto'

import { Command } from '@nestjs-architects/typed-cqrs'

export class CreateRoleCommand extends Command<Role> {
  constructor(public readonly dto: RoleDTO) {
    super()
  }
}
