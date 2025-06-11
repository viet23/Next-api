import { IsOptional, IsString, IsObject, IsInt } from 'class-validator'
import { ApiPropertyOptional } from '@nestjs/swagger'

class WhereFilterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fullName?: string
}

class FilterDto {
  @ApiPropertyOptional({ type: WhereFilterDto })
  @IsOptional()
  @IsObject()
  where?: WhereFilterDto

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  page?: number
}

export class BlackListFindManyDto {
  @ApiPropertyOptional({ type: FilterDto })
  @IsOptional()
  filter?: FilterDto
}
