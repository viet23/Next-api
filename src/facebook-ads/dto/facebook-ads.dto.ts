import { Type } from 'class-transformer'
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator'

export enum AdsGoal {
  MESSAGE = 'message',
  ENGAGEMENT = 'engagement',
  LEADS = 'leads',
  TRAFFIC = 'traffic',
}

export enum MessageDestination {
  MESSENGER = 'MESSENGER',
  WHATSAPP = 'WHATSAPP',
  INSTAGRAM_DIRECT = 'INSTAGRAM_DIRECT',
}

class LocationDto {
  @IsNumber()
  lat: number

  @IsNumber()
  lng: number
}

export class CreateFacebookAdDto {
  @IsEnum(AdsGoal)
  goal: AdsGoal

  @IsString()
  campaignName: string

  @IsString()
  caption: string

  @IsOptional()
  @IsString()
  urlWebsite?: string

  @IsOptional()
  @IsString()
  language?: string

  @IsBoolean()
  aiTargeting: boolean

  @IsOptional()
  @IsString()
  gender?: 'all' | 'male' | 'female'

  @IsOptional()
  @IsArray()
  ageRange?: [number, number]

  @IsOptional()
  @ValidateNested()
  @Type(() => LocationDto)
  location?: LocationDto

  @IsOptional()
  @IsNumber()
  /** miles */
  radius?: number

  @IsOptional()
  @IsArray()
  detailedTargeting?: [string, string]

  @IsDateString()
  startTime: string

  @IsDateString()
  endTime: string

  @IsNumber()
  @Min(1)
  dailyBudget: number

  /** postId chỉ cần cho campaign KHÔNG phải MESSAGE */
  @ValidateIf(o => o.goal !== AdsGoal.MESSAGE)
  @IsOptional()
  @IsString()
  postId?: string

  // ====== Thêm để hỗ trợ Click-to-Message (CTM) ======

  /** Mặc định MESSENGER nếu không truyền */
  @IsOptional()
  @IsEnum(MessageDestination)
  messageDestination?: MessageDestination

  /** Bắt buộc nếu messageDestination = WHATSAPP (định dạng 84xxxxxxxxx) */
  @ValidateIf(o => o.messageDestination === MessageDestination.WHATSAPP)
  @IsOptional()
  @IsString()
  whatsappNumber?: string

  /** 1 trong 2 phải có khi goal = MESSAGE (service sẽ kiểm tra và upload nếu chỉ có imageUrl) */
  @ValidateIf(o => o.goal === AdsGoal.MESSAGE)
  @IsOptional()
  @IsString()
  imageHash?: string

  @ValidateIf(o => o.goal === AdsGoal.MESSAGE)
  @IsOptional()
  @IsUrl()
  imageUrl?: string

  /** Link hiển thị trong creative CTM (tùy chọn) */
  @IsOptional()
  @IsUrl()
  linkUrl?: string

  // ================================================

  @IsOptional()
  targetingAI?: any
}
