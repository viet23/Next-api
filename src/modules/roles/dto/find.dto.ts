import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsNumber, IsOptional, IsString } from 'class-validator'

export class FindBlackListDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fullName?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  yearOfBrith?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  crime?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  policeStation?: string
}
