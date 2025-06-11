import { UserUpdateDTO } from '@modules/users/dto/user-update.dto'
import { Command } from '@nestjs-architects/typed-cqrs'
import { User } from 'src/models/user.entity'

export class UpdateUserCommand extends Command<User> {
  constructor(
    public readonly userId: string,
    public readonly dto: UserUpdateDTO,
  ) {
    super()
  }
}
