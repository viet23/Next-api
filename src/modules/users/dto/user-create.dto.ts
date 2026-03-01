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

export class CreateInformationPostDto {
  @IsString()
  postId: string

  @IsOptional()
  @IsString()
  caption?: string

  @IsOptional()
  @IsString()
  urlPost?: string

  @IsOptional()
  @IsString()
  dataRewrite?: string
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

export class UpdateBusinessProfileDto {
  @IsOptional()
  @IsString()
  businessName?: string;

  @IsOptional()
  @IsString()
  businessLocation?: string;

  @IsOptional()
  @IsArray()
  businessFields?: { id: number; value: string }[];

  @IsOptional()
  @IsString()
  salesType?: string;

  @IsOptional()
  @IsString()
  selectedLocation?: string;

  @IsOptional()
  @IsString()
  locationDetail?: string;

  @IsOptional()
  @IsString()
  productService?: string;

  @IsOptional()
  @IsString()
  targetCustomer?: string;
}