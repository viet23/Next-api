import { ExportDto } from '@common/dto/export.dto'
import { GetCaseDto } from '@modules/case/dto/filter-case.dto'
import { Query } from '@nestjs-architects/typed-cqrs'
import { Response } from 'express'

export class ExportCasesQuery extends Query<any> {
  constructor(
    public readonly filter: ExportDto<GetCaseDto>['filter'],
    public readonly response: Response,
  ) {
    super()
  }
}
