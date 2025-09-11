import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateAdStatusDto {
  @IsBoolean()
  isActive!: boolean;
}
