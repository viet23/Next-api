import { Query } from '@nestjs-architects/typed-cqrs'
export class GetRolesAuthQuery extends Query<any> {
  constructor(public readonly userId: string) {
    super()
  }
}
