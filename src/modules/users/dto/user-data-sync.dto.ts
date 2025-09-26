import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Allow, IsOptional, IsString, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class PageInfoDto {
  @ApiPropertyOptional() @Allow() idPage?: string;
  @ApiPropertyOptional() @Allow() accessToken?: string;
  @ApiPropertyOptional() @Allow() name?: string;
}

export class AdsInfoDto {
  @ApiPropertyOptional() @Allow() id?: string;
  @ApiPropertyOptional() @Allow() accessToken?: string;
  @ApiPropertyOptional() @Allow() name?: string;
  @ApiPropertyOptional() @Allow() accountId?: string;
}

export class UserDataSyncDto {
  @ApiProperty() @Allow() cookie: string;

  @ApiPropertyOptional({ type: [PageInfoDto] })
  @IsOptional() @IsArray() @ValidateNested({ each: true })
  @Type(() => PageInfoDto)
  pageInformation?: PageInfoDto[];

  @ApiPropertyOptional({ type: [AdsInfoDto] })
  @IsOptional() @IsArray() @ValidateNested({ each: true })
  @Type(() => AdsInfoDto)
  adsInformation?: AdsInfoDto[];

  @ApiProperty() @Allow() accessTokenUser: string;
  @ApiProperty() @Allow() accountAdsId: string;
}
