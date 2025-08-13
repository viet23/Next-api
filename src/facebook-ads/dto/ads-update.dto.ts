import { Group } from '@models/group.entity'
import { ApiProperty } from '@nestjs/swagger'

export class AdInsightUpdateDTO {
  @ApiProperty()
  isActive: boolean

}
