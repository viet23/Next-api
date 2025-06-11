import { SamlUserSigninDTO } from '@modules/auth/dto/saml-user-signin.dto'
import { Command } from '@nestjs-architects/typed-cqrs'
import { User } from 'src/models/user.entity'

export class SamlSigninUserCommand extends Command<User> {
  constructor(public readonly dto: SamlUserSigninDTO) {
    super()
  }
}
