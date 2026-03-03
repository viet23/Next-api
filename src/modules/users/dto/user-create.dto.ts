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
  @IsOptional()
  @IsString()
  businessName?: string

  @IsOptional()
  @IsString()
  businessLocation?: string

  @IsOptional()
  @IsArray()
  businessFields?: { id: number; value: string }[]

  @IsOptional()
  @IsString()
  salesType?: string

  @IsOptional()
  @IsString()
  selectedLocation?: string

  // 🔥 ADD CÁI NÀY
  @IsOptional()
  @IsArray()
  locations?: {
    key?: string
    name?: string
    latitude?: number
    longitude?: number
    radius?: number
  }[]

  // 🔥 ADD CÁI NÀY
  @IsOptional()
  @IsArray()
  businessLocations?: {
    key?: string
    name?: string
    latitude?: number
    longitude?: number
    radius?: number
  }[]

  @IsOptional()
  @IsString()
  productService?: string

  @IsOptional()
  @IsString()
  targetCustomer?: string
}

export class UpdateBusinessProfileDto {
   @IsOptional()
  @IsString()
  businessName?: string

  @IsOptional()
  @IsString()
  businessLocation?: string

  @IsOptional()
  @IsArray()
  businessFields?: { id: number; value: string }[]

  @IsOptional()
  @IsString()
  salesType?: string

  @IsOptional()
  @IsString()
  selectedLocation?: string

  // 🔥 ADD CÁI NÀY
  @IsOptional()
  @IsArray()
  locations?: {
    key?: string
    name?: string
    latitude?: number
    longitude?: number
    radius?: number
  }[]

  // 🔥 ADD CÁI NÀY
  @IsOptional()
  @IsArray()
  businessLocations?: {
    key?: string
    name?: string
    latitude?: number
    longitude?: number
    radius?: number
  }[]

  @IsOptional()
  @IsString()
  productService?: string

  @IsOptional()
  @IsString()
  targetCustomer?: string
}
