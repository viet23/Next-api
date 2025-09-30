// src/.../create-facebook-ad.dto.ts
import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
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

export enum DistanceUnit {
  KILOMETER = 'kilometer',
  MILE = 'mile',
}

/** ==== (Deprecated) Single point + radius – giữ để tương thích ngược ==== */
class LegacyLocationDto {
  @IsNumber()
  lat: number

  @IsNumber()
  lng: number
}

/** ==== geo_locations (đúng chuẩn Graph API) ==== */
class GeoCityDto {
  @IsString()
  key: string

  @IsOptional()
  @IsNumber()
  /** km (Graph cho phép mi hoặc km; ở đây bạn đang gửi kilometer) */
  radius?: number

  @IsOptional()
  @IsEnum(DistanceUnit)
  distance_unit?: DistanceUnit
}

class GeoCustomLocationDto {
  @IsNumber()
  latitude: number

  @IsNumber()
  longitude: number

  @IsNumber()
  /** km */
  radius: number

  @IsEnum(DistanceUnit)
  distance_unit: DistanceUnit
}

class GeoLocationsDto {
  /** Các field khác (countries/regions/subcities/zip) có thể bổ sung sau nếu cần */
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => GeoCityDto)
  cities?: GeoCityDto[]

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => GeoCustomLocationDto)
  custom_locations?: GeoCustomLocationDto[]
}

/** ==== DTO chính ==== */
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
  @ArrayMinSize(2)
  @ArrayMaxSize(2)
  @Type(() => Number)
  @IsNumber({}, { each: true })
  ageRange?: [number, number]

  /** ==== Khối mới: geo_locations (đa điểm) ==== */
  @IsOptional()
  @ValidateNested()
  @Type(() => GeoLocationsDto)
  geo_locations?: GeoLocationsDto

  /** ==== (Deprecated) single point + radius – vẫn cho phép để không phá API cũ ==== */
  @IsOptional()
  @ValidateNested()
  @Type(() => LegacyLocationDto)
  location?: LegacyLocationDto

  @IsOptional()
  @IsNumber()
  /** miles (legacy) */
  radius?: number

  /** detailedTargeting: mảng string (vd interest keywords) */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  detailedTargeting?: string[]

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

  @IsOptional()
  @IsString()
  urlPost?: string

  // ====== Click-to-Message (CTM) ======
  /** Mặc định MESSENGER nếu không truyền (set mặc định ở service) */
  @IsOptional()
  @IsEnum(MessageDestination)
  messageDestination?: MessageDestination

  /** Bắt buộc nếu messageDestination = WHATSAPP (định dạng 84xxxxxxxxx) */
  @ValidateIf(o => o.messageDestination === MessageDestination.WHATSAPP)
  @IsOptional()
  @IsString()
  whatsappNumber?: string

  /** 1 trong 2 phải có khi goal = MESSAGE (service sẽ kiểm tra & upload nếu chỉ có imageUrl) */
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

  /** targetingAI: để linh hoạt, nhận bất kỳ cấu trúc (VN keys) */
  @IsOptional()
  targetingAI?: any
}
