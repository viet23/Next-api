import { Query } from '@nestjs-architects/typed-cqrs'
export class GetUserAuthQuery extends Query<any> {
  constructor(public readonly userId: string) {
    super()
  }
}
