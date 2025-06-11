import { UserSignUpDTO } from '@modules/auth/dto/user-signup.dto'
import { Command } from '@nestjs-architects/typed-cqrs'
import { User } from 'src/models/user.entity'

export class SignupUserCommand extends Command<User> {
  constructor(public readonly dto: UserSignUpDTO) {
    super()
  }
}
