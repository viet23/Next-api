import { ApiProperty } from '@nestjs/swagger'

import { ApiPropertyOptional } from '@nestjs/swagger';

export class PageInfoDto {
  @ApiPropertyOptional({ example: '1234567890', description: 'Facebook Page ID' })
  idPage?: string;

  @ApiPropertyOptional({ example: 'EAAG...', description: 'Access token của page' })
  accessToken?: string;

  @ApiPropertyOptional({ example: 'ALLONEADS', description: 'Facebook Page nane' })
  name?: string;
}

export class AdsInfoDto {
  @ApiPropertyOptional({ example: '1234567890', description: 'Ads ID' })
  idAds?: string;

  @ApiPropertyOptional({ example: 'EAAG...', description: 'Access token của user' })
  accessToken?: string;

  @ApiPropertyOptional({ example: 'Nguyễn Văn A', description: 'Tên người dùng' })
  name?: string;
}

export class UserDataSyncDto {


  @ApiProperty()
  cookie: string

  @ApiPropertyOptional({
    type: [PageInfoDto],
    description: 'Danh sách các page cùng với accessToken',
  })
  pageInformation?: PageInfoDto[];

  @ApiPropertyOptional({
    type: [AdsInfoDto],
    description: 'Danh sách các tài khoản quảng cáo cùng với accessToken',
  })
  adsInformation?: AdsInfoDto[];

  @ApiProperty()
  accessTokenUser: string

  @ApiProperty()
  accountAdsId: string
}
