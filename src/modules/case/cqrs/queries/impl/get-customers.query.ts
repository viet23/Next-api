import { FindManyDto } from '@common/dto/filter.dto'
import { GtelpayCustomer } from '@models/gtelpay-customer.entity'
import { FilterCustomerCaseDto } from '@modules/case/dto/filter-customer.dto'
import { Query } from '@nestjs-architects/typed-cqrs'
export class GetCustomerCasesQuery extends Query<GtelpayCustomer> {
  constructor(public readonly filter: FindManyDto<FilterCustomerCaseDto>['filter']) {
    super()
  }
}
