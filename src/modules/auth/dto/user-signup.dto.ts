import { IsPasswordValid } from '@decorators/validate-password.decorator'
import { ApiProperty } from '@nestjs/swagger'
import { IsEmail, IsNotEmpty } from 'class-validator'

export class UserSignUpDTO {
  @ApiProperty()
  @IsEmail()
  @IsNotEmpty()
  email: string

  @ApiProperty()
  @IsNotEmpty()
  username: string

  @ApiProperty()
  phone: string

  @ApiProperty()
  fullName: string

  @ApiProperty()
  @IsPasswordValid()
  password: string
}
