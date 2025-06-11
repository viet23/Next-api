import { FindManyDto } from '@common/dto/filter.dto'
import { FilterReportCaseDto } from '@modules/case/dto/filter-report.dto'
import { Query } from '@nestjs-architects/typed-cqrs'
export class ReportCaseQuery extends Query<any> {
  constructor(public readonly filter: FindManyDto<FilterReportCaseDto>['filter']) {
    super()
  }
}
