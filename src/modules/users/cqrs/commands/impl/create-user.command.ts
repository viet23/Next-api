import { UserCreateDTO } from '@modules/users/dto/user-create.dto'
import { Command } from '@nestjs-architects/typed-cqrs'
import { User } from 'src/models/user.entity'

export class CreateUserCommand extends Command<User> {
  constructor(
    public readonly createUserDto: UserCreateDTO
  ) {
    super()
  }
}
