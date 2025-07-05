import { IsEmail, IsNotEmpty, IsOptional } from 'class-validator'

export class CreateEmailDto {
  @IsNotEmpty()
  fullName: string

  @IsEmail()
  email: string

  @IsNotEmpty()
  phone: string

  @IsOptional()
  zalo?: string
}
