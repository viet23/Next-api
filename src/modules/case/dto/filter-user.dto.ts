import { ApiPropertyOptional } from '@nestjs/swagger'
export class FilterUserCaseDto {
  @ApiPropertyOptional()
  fullName: string
}
