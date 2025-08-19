// src/modules/facebook-post/dto/query-facebook-post.dto.ts
import { IsInt, IsOptional, IsString, Min } from 'class-validator'
import { Type } from 'class-transformer'

export class QueryFacebookPostDto {
  @IsOptional() @IsString()
  search?: string // tìm theo postId hoặc urlPost

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number = 1

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  limit?: number = 20

  // có thể thêm sort sau nếu cần
}
