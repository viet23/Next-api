import { ApiProperty } from '@nestjs/swagger'

export class UserCreateDTO {
  @ApiProperty()
  username: string

  @ApiProperty()
  password: string
}
