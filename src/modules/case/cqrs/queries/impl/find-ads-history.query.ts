import { User } from '@models/user.entity'
import { Query } from '@nestjs-architects/typed-cqrs'
export class FindAdsHistoryQuery extends Query<any> {
  constructor(
    public readonly id: string,
    public readonly user: User,
  ) {
    super()
  }
}
