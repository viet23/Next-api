import { Group } from '@models/group.entity'
import { Query } from '@nestjs-architects/typed-cqrs'
export class GetGroupRoleQuery extends Query<Group> {
  constructor(public readonly userId: number) {
    super()
  }
}
