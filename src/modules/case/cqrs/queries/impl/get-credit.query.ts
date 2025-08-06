import { User } from '@models/user.entity'
import { Query } from '@nestjs-architects/typed-cqrs'
export class GetCreditQuery extends Query<any> {
  constructor(public readonly user: User) {
    super()
  }
}
