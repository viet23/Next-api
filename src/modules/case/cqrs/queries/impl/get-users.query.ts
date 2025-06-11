import { FindManyDto } from '@common/dto/filter.dto'
import { User } from '@models/user.entity'
import { FilterUserCaseDto } from '@modules/case/dto/filter-user.dto'
import { Query } from '@nestjs-architects/typed-cqrs'
export class GetUserCasesQuery extends Query<User> {
  constructor(public readonly filter: FindManyDto<FilterUserCaseDto>['filter']) {
    super()
  }
}
