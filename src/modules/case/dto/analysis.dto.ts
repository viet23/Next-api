import { IsString, IsOptional, IsUrl, IsObject } from 'class-validator'

export class CreateAnalysisFbDto {
  @IsUrl()
  urlPage: string

  @IsOptional()
  @IsObject()
  analysis?: Record<string, any>

  @IsOptional()
  @IsObject()
  channelPlan?: Record<string, any>

  @IsOptional()
  @IsString()
  userId?: string
}
