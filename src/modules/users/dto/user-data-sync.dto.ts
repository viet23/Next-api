import { ApiProperty } from '@nestjs/swagger'

import { ApiPropertyOptional } from '@nestjs/swagger';

export class PageInfoDto {
  @ApiPropertyOptional({ example: '1234567890', description: 'Facebook Page ID' })
  idPage?: string;

  @ApiPropertyOptional({ example: 'EAAG...', description: 'Access token của page' })
  accessToken?: string;
}

export class UserDataSyncDto {


  @ApiProperty()
  cookie: string

  @ApiPropertyOptional({
    type: [PageInfoDto],
    description: 'Danh sách các page cùng với accessToken',
  })
  pageInformation?: PageInfoDto[];


  @ApiProperty()
  accessTokenUser: string

  @ApiProperty()
  accountAdsId: string
}
