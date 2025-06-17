import { User } from '@models/user.entity'
import { Query } from '@nestjs-architects/typed-cqrs'
export class GetAnalysisFbQuery extends Query<any> {
  constructor(public readonly user: User) {
    super()
  }
}
