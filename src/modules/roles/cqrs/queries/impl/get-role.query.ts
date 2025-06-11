import { Role } from '@models/role.entity'
import { Query } from '@nestjs-architects/typed-cqrs'
export class GetRoleQuery extends Query<Role> {
  constructor() {
    super()
  }
}
