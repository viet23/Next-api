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
}
