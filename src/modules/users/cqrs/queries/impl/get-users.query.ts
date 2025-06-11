import { FindManyDto } from '@common/dto/filter.dto'
import { Role } from '@models/role.entity'
import { User } from '@models/user.entity'
import { FilterUsersDto } from '@modules/users/dto/filter-users.dto'
import { Query } from '@nestjs-architects/typed-cqrs'
export class GetUsersQuery extends Query<User> {
  constructor(public readonly filter: FindManyDto<FilterUsersDto>['filter']) {
    super()
  }
}
