import { IsEmail, IsOptional, IsString } from 'class-validator'

export class RegisterTrialDto {
  @IsString()
  fullName: string

  @IsEmail()
  email: string

  @IsOptional()
  @IsString()
  phone?: string

  @IsString()
  source: string
}
