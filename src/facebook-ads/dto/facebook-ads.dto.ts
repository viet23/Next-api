// src/.../create-facebook-ad.dto.ts
import { Type } from 'class-transformer';
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
} from 'class-validator';

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
  lat: number;

  @IsNumber()
  lng: number;
}

/** ==== geo_locations (chuẩn Graph API) ==== */
class GeoCityDto {
  @IsString()
  key: string;

  @IsOptional()
  @IsNumber()
  /** km */
  radius?: number;

  @IsOptional()
  @IsEnum(DistanceUnit)
  distance_unit?: DistanceUnit;
}

class GeoCustomLocationDto {
  @IsNumber()
  latitude: number;

  @IsNumber()
  longitude: number;

  @IsNumber()
  /** km */
  radius: number;

  @IsEnum(DistanceUnit)
  distance_unit: DistanceUnit;
}

class GeoLocationsDto {
  /** Thêm countries để khớp payload FE */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  countries?: string[];

  /** Các field khác có thể mở rộng thêm khi cần */
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => GeoCityDto)
  cities?: GeoCityDto[];

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => GeoCustomLocationDto)
  custom_locations?: GeoCustomLocationDto[];
}

/** ==== Post được chọn ở FE (multi) ==== */
class SelectedPostDto {
  @IsString()
  id: string;

  @IsOptional()
  @IsString()
  caption?: string;

  @IsOptional()
  @IsUrl()
  media?: string;

  @IsOptional()
  @IsUrl()
  permalink_url?: string;
}

/** ==== DTO chính ==== */
export class CreateFacebookAdDto {
  @IsEnum(AdsGoal)
  goal: AdsGoal;

  @IsString()
  campaignName: string;

  @IsString()
  caption: string;

  @IsOptional()
  @IsString()
  urlWebsite?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsBoolean()
  aiTargeting: boolean;

  @IsOptional()
  @IsString()
  gender?: 'all' | 'male' | 'female';

  @IsOptional()
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(2)
  @Type(() => Number)
  @IsNumber({}, { each: true })
  ageRange?: [number, number];

  /** detailedTargeting: mảng string (vd interest keywords) */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  detailedTargeting?: string[];

  /** ==== geo_locations (đa điểm) ==== */
  @IsOptional()
  @ValidateNested()
  @Type(() => GeoLocationsDto)
  geo_locations?: GeoLocationsDto;

  /** ==== (Deprecated) single point + radius – giữ để không phá API cũ ==== */
  @IsOptional()
  @ValidateNested()
  @Type(() => LegacyLocationDto)
  location?: LegacyLocationDto;

  @IsOptional()
  @IsNumber()
  /** miles (legacy) */
  radius?: number;

  /** ==== Multi-post: danh sách bài được chọn ==== */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SelectedPostDto)
  selectedPosts?: SelectedPostDto[];

  /** ==== Multi-post: chỉ danh sách id (tiện xử lý BE) ==== */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  postIds?: string[];

  /** ==== Multi-post: mảng ảnh url theo thứ tự ==== */
  @IsOptional()
  @IsArray()
  @IsUrl(undefined, { each: true })
  images?: string[];

  /** ==== Multi-post: mảng nội dung/caption theo thứ tự ==== */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  contents?: string[];

  /** ==== (Deprecated) số lượng quảng cáo – FE đã bỏ, vẫn giữ tương thích ==== */
  @IsOptional()
  @IsNumber()
  @Min(1)
  numAds?: number;

  @IsDateString()
  startTime: string;

  @IsDateString()
  endTime: string;

  @IsNumber()
  @Min(1)
  dailyBudget: number;

  // ====== Single-post fallback (giữ cho flow cũ) ======
  @IsOptional()
  @IsString()
  postId?: string;

  @IsOptional()
  @IsString()
  urlPost?: string;

  // ====== Click-to-Message (CTM) ======
  /** Mặc định MESSENGER nếu không truyền (set mặc định ở service) */
  @IsOptional()
  @IsEnum(MessageDestination)
  messageDestination?: MessageDestination;

  /** Bắt buộc nếu messageDestination = WHATSAPP (định dạng 84xxxxxxxxx) */
  @ValidateIf((o) => o.messageDestination === MessageDestination.WHATSAPP)
  @IsOptional()
  @IsString()
  whatsappNumber?: string;

  /**
   * Khi goal = MESSAGE:
   * - BE có thể chấp nhận hoặc mảng images (nhiều ảnh) hoặc ảnh đơn imageUrl/imageHash.
   * - Service nên kiểm tra ưu tiên mảng `images`, nếu không có thì dùng `imageUrl`/`imageHash`.
   */
  @ValidateIf((o) => o.goal === AdsGoal.MESSAGE)
  @IsOptional()
  @IsString()
  imageHash?: string;

  @ValidateIf((o) => o.goal === AdsGoal.MESSAGE)
  @IsOptional()
  @IsUrl()
  imageUrl?: string;

  /** Link hiển thị trong creative CTM (tùy chọn) */
  @IsOptional()
  @IsUrl()
  linkUrl?: string;

  /** targetingAI: để linh hoạt, nhận bất kỳ cấu trúc (VN keys) */
  @IsOptional()
  targetingAI?: any;
}
