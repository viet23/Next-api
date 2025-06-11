import { ExportDto } from '@common/dto/export.dto'
import { Customers } from '@models/customer.entity'
import { FilterCustomerDto } from '@modules/customers/dto/filter-customer.dto'
import { Query } from '@nestjs-architects/typed-cqrs'
import { Response } from 'express'
export class ExportCustomersQuery extends Query<Customers> {
  constructor(
    public readonly filter: ExportDto<FilterCustomerDto>['filter'],
    public readonly response: Response,
  ) {
    super()
  }
}
