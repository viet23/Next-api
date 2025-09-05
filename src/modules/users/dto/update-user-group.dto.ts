import { ApiProperty } from '@nestjs/swagger'

export class UpdateUserGroupDto {
  @ApiProperty()
  groupIds: string[]

  @ApiProperty()
  extension: string

  @ApiProperty()
  fullName: string

  @ApiProperty()
  isActive: boolean

  @ApiProperty()
  idPage: string

  @ApiProperty()
  credits: number

  @ApiProperty()
  phone: string

  @ApiProperty()
  cookie: string

  @ApiProperty()
  zalo: string

  @ApiProperty()
  accessToken: string

  @ApiProperty()
  accessTokenUser: string

  @ApiProperty()
  accountAdsId: string
}
