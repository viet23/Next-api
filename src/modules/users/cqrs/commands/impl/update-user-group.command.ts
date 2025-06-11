import { User } from '@models/user.entity'
import { UpdateUserGroupDto } from '@modules/users/dto/update-user-group.dto'
import { Command } from '@nestjs-architects/typed-cqrs'

export class UpdateUserGroupCommand extends Command<User> {
  constructor(
    public readonly dto: UpdateUserGroupDto,
    public readonly userId: string,
  ) {
    super()
  }
}
