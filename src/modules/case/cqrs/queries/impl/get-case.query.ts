import { CaseManyDto } from '@modules/case/dto/filter-case.dto'
import { Query } from '@nestjs-architects/typed-cqrs'
export class GetCaseQuery extends Query<any> {
  constructor(public readonly filter: CaseManyDto['filter']) {
    super()
  }
}
