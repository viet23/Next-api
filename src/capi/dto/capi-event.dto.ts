import { IsString, IsNumber, IsOptional, IsObject } from 'class-validator'

export class CapiEventDto {
  @IsString() event_name: string // e.g. "CompleteRegistration" | "Purchase"
  @IsNumber() event_time: number // seconds (Unix)
  @IsString() action_source: string // e.g. "website"
  @IsOptional() @IsString() event_id?: string
  @IsOptional() @IsString() event_source_url?: string

  // FE gửi RAW; BE sẽ hash
  @IsOptional() @IsObject() user_data?: {
    email?: string
    phone?: string
  }

  @IsOptional() @IsObject() custom_data?: Record<string, any>
  @IsOptional() @IsObject() attribution_data?: Record<string, any>

  // từ FE lấy cookie/URL
  @IsOptional() @IsString() fbp?: string
  @IsOptional() @IsString() fbc?: string
}
