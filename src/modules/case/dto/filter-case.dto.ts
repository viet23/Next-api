import { IsOptional, IsString, IsEnum, IsDateString } from 'class-validator'
import { ApiPropertyOptional } from '@nestjs/swagger'
import { FilterDto } from '@common/dto/filter.dto'
import { CaseStatusEnum } from '@common/enums/case.enum'

export class GetCaseDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string

  @ApiPropertyOptional({ type: 'enum', enum: CaseStatusEnum, default: CaseStatusEnum.PENDING })
  @IsOptional()
  @IsEnum(CaseStatusEnum)
  status?: CaseStatusEnum

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assignBy?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customer?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phoneOrEmail?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ticketCode?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  feature?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  issueType?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  receiver?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  department?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ticketStatus?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDate?: string
}

export class CaseManyDto {
  @ApiPropertyOptional({ type: GetCaseDto })
  @IsOptional()
  filter?: FilterDto<GetCaseDto>
}
