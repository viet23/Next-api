import { FindManyDto } from '@common/dto/filter.dto'
import { FilterReportCaseDto } from '@modules/case/dto/filter-report.dto'
import { Query } from '@nestjs-architects/typed-cqrs'
import { Response } from 'express'

export class ExportReportReceptionCasesQuery extends Query<any> {
  constructor(
    public readonly filter: FindManyDto<FilterReportCaseDto>['filter'],
    public readonly response: Response,
  ) {
    super()
  }
}
