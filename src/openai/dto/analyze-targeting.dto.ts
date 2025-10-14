import { IsString, MinLength } from 'class-validator'

export class AnalyzeTargetingDto {
  @IsString()
  @MinLength(3)
  prompt!: string
}
