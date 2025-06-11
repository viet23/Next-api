import { CustomerEnum } from '@common/enums/gender.enum'
import { ApiProperty } from '@nestjs/swagger'
import { IsDate, IsDateString } from 'class-validator'

export class CreateCustomerDTO {
  @ApiProperty()
  email: string

  @ApiProperty()
  phone: string

  @ApiProperty()
  fullName: string

  @ApiProperty()
  @IsDateString()
  dateOfBirth: Date

  @ApiProperty({ type: 'enum', enum: CustomerEnum, default: CustomerEnum.MALE })
  gender: CustomerEnum

  @ApiProperty({ type: 'timestamp with time zone' })
  registerDate: Date

  @ApiProperty({ type: 'timestamp with time zone' })
  kycDate: Date
}
