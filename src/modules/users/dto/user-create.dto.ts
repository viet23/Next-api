import { ApiProperty } from '@nestjs/swagger'

export class UserCreateDTO {
  @ApiProperty()
  username: string

  @ApiProperty()
  email: string

  @ApiProperty()
  phone: string

  @ApiProperty()
  zalo: string

  @ApiProperty()
  password: string
}
