import { Query } from '@nestjs-architects/typed-cqrs'

export class SummaryCustomersQuery extends Query<any> {
  constructor() {
    super()
  }
}
