import { IsOptional, IsObject, IsInt } from 'class-validator'
import { ApiPropertyOptional } from '@nestjs/swagger'

export class FilterDto<T> {
  @IsOptional()
  @IsObject()
  where?: T

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  page?: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  pageSize?: number
}

export class FindManyDto<T> {
  @ApiPropertyOptional({ type: FilterDto })
  @IsOptional()
  filter?: FilterDto<T>
}
