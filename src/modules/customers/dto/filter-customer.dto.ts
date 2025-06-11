import { CustomerEnum } from '@common/enums/gender.enum'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class FilterCustomerDto {
  @ApiPropertyOptional()
  fullName: string

  @ApiPropertyOptional()
  phone: string

  @ApiPropertyOptional()
  email: string

  @ApiPropertyOptional()
  dateOfBirth: Date

  @ApiPropertyOptional()
  isSuspect: boolean

  @ApiPropertyOptional()
  delayDays: string

  @ApiPropertyOptional({ type: 'enum', enum: CustomerEnum, default: CustomerEnum.MALE })
  gender: CustomerEnum
}
