import { IsOptional, IsString, IsObject, IsInt } from 'class-validator'
import { ApiPropertyOptional } from '@nestjs/swagger'

class FilterDto<T> {
  @IsOptional()
  @IsObject()
  where?: T
}

export class ExportDto<T> {
  @ApiPropertyOptional({ type: FilterDto })
  @IsOptional()
  filter?: FilterDto<T>
}
