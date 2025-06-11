import { Command } from '@nestjs-architects/typed-cqrs'
import { User } from 'src/models/user.entity'

export class CreateUserCommand extends Command<User> {
  constructor(
    public readonly username: string,
    public readonly password: string,
  ) {
    super()
  }
}
