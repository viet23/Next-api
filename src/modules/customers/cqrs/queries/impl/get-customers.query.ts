import { FindManyDto } from '@common/dto/filter.dto'
import { Customers } from '@models/customer.entity'
import { FilterCustomerDto } from '@modules/customers/dto/filter-customer.dto'
import { Query } from '@nestjs-architects/typed-cqrs'
export class GetCustomersQuery extends Query<Customers> {
  constructor(public readonly filter: FindManyDto<FilterCustomerDto>['filter']) {
    super()
  }
}
