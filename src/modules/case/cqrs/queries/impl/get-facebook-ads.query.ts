import { User } from '@models/user.entity'
import { CaseManyDto } from '@modules/case/dto/filter-case.dto'
import { Query } from '@nestjs-architects/typed-cqrs'
export class GetFacebookAdsQuery extends Query<any> {
  constructor(
    public readonly filter: CaseManyDto['filter'],
    public readonly user: User,
  ) {
    super()
  }
}
