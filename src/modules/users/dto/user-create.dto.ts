import { ApiProperty } from '@nestjs/swagger'
import { IsArray, IsOptional, IsString } from 'class-validator'

export class UserCreateDTO {
  @ApiProperty()
  username: string

  @ApiProperty()
  email: string

  @ApiProperty()
  phone: string

  @ApiProperty()
  zalo: string

  @ApiProperty()
  password: string
}

export class SaveBusinessProfileDto {

  @IsString()
  @IsOptional()
  businessName: string

  @IsString()
  @IsOptional()
  businessLocation: string

  @IsArray()
  @IsOptional()
  businessFields: { id: number; value: string }[]

  @IsString()
  @IsOptional()
  salesType: string

  @IsString()
  @IsOptional()
  selectedLocation: string

  @IsString()
  @IsOptional()
  locationDetail: string

  @IsString()
  @IsOptional()
  productService: string

  @IsString()
  @IsOptional()
  targetCustomer: string
}