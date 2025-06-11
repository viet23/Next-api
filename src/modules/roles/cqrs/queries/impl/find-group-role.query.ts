import { Role } from '@models/role.entity'
import { Query } from '@nestjs-architects/typed-cqrs'
export class FindGroupRoleQuery extends Query<Role> {
  constructor(public readonly id: string) {
    super()
  }
}
