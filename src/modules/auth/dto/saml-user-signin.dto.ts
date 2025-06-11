import { ApiProperty } from '@nestjs/swagger'
import { IsEmail, IsNotEmpty } from 'class-validator'

export class SamlUserSigninDTO {
  @ApiProperty()
  @IsEmail()
  @IsNotEmpty()
  email: string
}
