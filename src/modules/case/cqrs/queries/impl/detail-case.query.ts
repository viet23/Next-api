import { Case } from '@models/case.entity'
import { Query } from '@nestjs-architects/typed-cqrs'
export class DetailCaseQuery extends Query<Case> {
  constructor(
    public readonly phone: string,
    public readonly otp: string,
  ) {
    super()
  }
}
