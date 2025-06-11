import { Customers } from '@models/customer.entity'
import { Query } from '@nestjs-architects/typed-cqrs'

export class GetDetailCustomerByID extends Query<Customers> {
  constructor(public readonly id: string) {
    super()
  }
}
