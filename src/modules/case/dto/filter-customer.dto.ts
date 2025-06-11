import { ApiPropertyOptional } from '@nestjs/swagger'
export class FilterCustomerCaseDto {
  @ApiPropertyOptional()
  fullName: string
}
