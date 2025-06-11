import { UserSignInDTO } from '@modules/auth/dto/user-signin.dto'
import { Query } from '@nestjs-architects/typed-cqrs'
export class SignInQuery extends Query<any> {
  constructor(public readonly dto: UserSignInDTO) {
    super()
  }
}
