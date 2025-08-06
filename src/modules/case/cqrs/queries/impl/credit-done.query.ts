import { Case } from '@models/case.entity'
import { Query } from '@nestjs-architects/typed-cqrs'
export class CreditDoneQuery extends Query<Case> {
  constructor(public readonly id: string) {
    super()
  }
}
