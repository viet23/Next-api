import { Query } from '@nestjs-architects/typed-cqrs'
export class GetFacebookAdsHistoryQuery extends Query<any> {
  constructor(public readonly id: string) {
    super()
  }
}
