import { IsString, IsOptional, IsUrl, IsObject } from 'class-validator'

export class CreateAnalysisFbDto {
  @IsUrl()
  urlPage: string

  @IsOptional()
  @IsObject()
  analysis?: Record<string, any>

  @IsOptional()
  @IsString()
  channelPlan?: string

  @IsOptional()
  @IsString()
  userId?: string
}
