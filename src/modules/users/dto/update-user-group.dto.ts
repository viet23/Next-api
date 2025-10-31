import { ApiProperty, PartialType } from '@nestjs/swagger'
import { Type, Transform } from 'class-transformer'
import { IsArray, IsString, IsBoolean, IsNumber, IsOptional, IsUUID } from 'class-validator'

// Nếu đây là DTO update, thường nên cho các field optional:
export class UpdateUserGroupDto {
  @ApiProperty({ type: [String], required: false, description: 'Danh sách group UUID' })
  @IsOptional()
  @IsArray()
  // Nếu là UUID v4: dùng IsUUID thay cho IsString
  // @IsUUID('4', { each: true })
  @IsString({ each: true })
  @Type(() => String)
  groupIds?: string[]

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  extension?: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  fullName?: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  isActive?: boolean

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  isOptimization?: boolean

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  idPage?: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  credits?: number

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  phone?: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  cookie?: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  zalo?: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  accessToken?: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  accessTokenUser?: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  internalUserAccessToken?: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  internalPageAccessToken?: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  // Nếu thực sự là account id dạng số, có thể đổi sang IsNumber + @Type(() => Number)
  accountAdsId?: string
}
