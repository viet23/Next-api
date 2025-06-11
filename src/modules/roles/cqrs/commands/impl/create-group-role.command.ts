import { Group } from '@models/group.entity'
import { GroupRoleDTO } from '@modules/roles/dto/group-role.dto'
import { Command } from '@nestjs-architects/typed-cqrs'

export class CreateGroupRoleCommand extends Command<Group> {
  constructor(public readonly dto: GroupRoleDTO) {
    super()
  }
}
