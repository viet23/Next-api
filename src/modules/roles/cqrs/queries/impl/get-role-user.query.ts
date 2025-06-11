import { Role } from '@models/role.entity'
import { User } from '@models/user.entity'
import { Query } from '@nestjs-architects/typed-cqrs'
export class GetRoleUserQuery extends Query<Role> {
  constructor(public readonly user: User) {
    super()
  }
}
