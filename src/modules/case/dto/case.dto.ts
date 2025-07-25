
import { ApiProperty } from '@nestjs/swagger'
import { IsString, IsOptional } from 'class-validator'

export class CaseDTO {
  @ApiProperty({ description: 'link video' })
  @IsOptional()
  @IsString()
  urlVideo: string

  @ApiProperty({ description: 'Mô tả chi tiết của case' })
  @IsOptional()
  @IsString()
  caption: string

  @ApiProperty({ description: 'task video' })
  @IsOptional()
  @IsString()
  taskId: string

  @ApiProperty({ description: 'action video' })
  @IsOptional()
  @IsString()
  action: string

}
