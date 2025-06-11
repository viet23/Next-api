import { Query } from '@nestjs-architects/typed-cqrs'
export class GetCurrentUserQuery extends Query<any> {
  constructor(public readonly userId: string) {
    super()
  }
}
