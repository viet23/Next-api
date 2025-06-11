import { ApiPropertyOptional } from '@nestjs/swagger'
export class FilterReportCaseDto {
  @ApiPropertyOptional()
  reportType: string

  @ApiPropertyOptional()
  dateTime: string
}
