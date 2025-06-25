import { Group } from '@models/group.entity'
import { ApiProperty } from '@nestjs/swagger'

export class UserUpdateDTO {
  @ApiProperty()
  phone: string

  @ApiProperty()
  extension: string

  @ApiProperty()
  idPage: string

  @ApiProperty()
  accessToken: string

  @ApiProperty()
  accessTokenUser: string

  @ApiProperty()
  accountAdsId: string

  @ApiProperty()
  isActive: boolean

  @ApiProperty()
  groupIds: string[]
}
