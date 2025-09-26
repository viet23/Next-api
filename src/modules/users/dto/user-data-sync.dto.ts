import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class PageInfoDto {
  @ApiPropertyOptional({ example: '1234567890', description: 'Facebook Page ID' })
  @IsOptional()
  @IsString()
  idPage?: string;

  @ApiPropertyOptional({ example: 'EAAG...', description: 'Access token của page' })
  @IsOptional()
  @IsString()
  accessToken?: string;

  @ApiPropertyOptional({ example: 'ALLONEADS', description: 'Facebook Page name' })
  @IsOptional()
  @IsString()
  name?: string;
}

export class AdsInfoDto {
  @ApiPropertyOptional({ example: 'act_1234567890', description: 'Ads (ad account) ID' })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiPropertyOptional({ example: 'EAAG...', description: 'Access token của user hoặc ad account' })
  @IsOptional()
  @IsString()
  accessToken?: string;

  @ApiPropertyOptional({ example: 'Nguyễn Văn A', description: 'Tên người dùng' })
  @IsOptional()
  @IsString()
  name?: string;

  // 🔹 Thêm để khớp payload bạn gửi
  @ApiPropertyOptional({ example: '930874367109118', description: 'Account Ads ID (chỉ số)' })
  @IsOptional()
  @IsString()
  accountId?: string;
}

export class UserDataSyncDto {
  @ApiProperty({ description: 'Cookie Facebook đầy đủ' })
  @IsString()
  cookie: string;

  @ApiPropertyOptional({
    type: [PageInfoDto],
    description: 'Danh sách các page cùng với accessToken',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PageInfoDto)
  pageInformation?: PageInfoDto[];

  @ApiPropertyOptional({
    type: [AdsInfoDto],
    description: 'Danh sách các tài khoản quảng cáo cùng với accessToken',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdsInfoDto)
  adsInformation?: AdsInfoDto[];

  @ApiProperty({ description: 'Access token của user' })
  @IsString()
  accessTokenUser: string;

  @ApiProperty({ example: '930874367109118', description: 'Account Ads ID mặc định' })
  @IsString()
  accountAdsId: string;
}
