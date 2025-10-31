import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator'

export class TargetingDTO {
  @ApiPropertyOptional({ type: [String], description: 'Interest keywords' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  interests?: string[]

  @ApiPropertyOptional({
    type: [Number],
    description: 'Age range [min, max]',
    minItems: 2,
    maxItems: 2,
    example: [22, 45],
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(2)
  @Type(() => Number)
  @IsNumber({}, { each: true })
  ageRange?: [number, number]
}

export class AdInsightUpdateDTO {
  @ApiProperty({ description: 'Lưu trạng thái cục bộ, KHÔNG patch campaign' })
  @IsBoolean()
  isActive: boolean

  @ApiPropertyOptional({ type: TargetingDTO })
  @IsOptional()
  @ValidateNested()
  @Type(() => TargetingDTO)
  targeting?: TargetingDTO
}
