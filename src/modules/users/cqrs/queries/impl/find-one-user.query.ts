import { User } from '@models/user.entity'
import { Query } from '@nestjs-architects/typed-cqrs'

export class FindOneUserQuery extends Query<User> {
  constructor(public readonly userId: string) {
    super()
  }
}
