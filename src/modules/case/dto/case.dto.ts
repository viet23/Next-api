import { CaseStatusEnum } from '@common/enums/case.enum'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsString, IsOptional, IsEnum, IsArray, IsUUID, IsDateString } from 'class-validator'

export class CaseDTO {
  @ApiProperty({ description: 'link video' })
  @IsOptional()
  @IsString()
  urlVideo: string

  @ApiProperty({ description: 'Mô tả chi tiết của case' })
  @IsOptional()
  @IsString()
  caption: string

}
