import { Customers } from '@models/customer.entity'
import { Query } from '@nestjs-architects/typed-cqrs'

export class DailyCheckingBlacklistCommand extends Query<Customers> {
  constructor() {
    super()
  }
}
