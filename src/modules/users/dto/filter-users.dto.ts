import { ApiProperty } from '@nestjs/swagger'

export class FilterUsersDto {
  @ApiProperty()
  keyword: string

  @ApiProperty()
  status: boolean

  @ApiProperty()
  plan: string
}
