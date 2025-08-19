
import { IsArray, IsOptional, IsString, IsUrl } from 'class-validator'

export class CreateFacebookPostDto {
  @IsString()
  postId: string

  @IsUrl({}, { message: 'urlPost phải là URL hợp lệ' })
  urlPost: string

  @IsOptional()
  dataTargeting?: any

  @IsOptional()
  @IsArray()
  adIds?: string[]

  @IsOptional()
  dataScoreAd?: any

  @IsOptional()
  @IsString()
  dataRewrite?: string
}
