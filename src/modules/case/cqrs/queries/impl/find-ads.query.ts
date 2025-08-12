import { Query } from '@nestjs-architects/typed-cqrs'
export class FindAdsQuery extends Query<any> {
  constructor(public readonly id: string) {
    super()
  }
}
