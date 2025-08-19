// src/modules/facebook-post/dto/update-facebook-post.dto.ts
import { PartialType } from '@nestjs/mapped-types'
import { CreateFacebookPostDto } from './create-facebook-post.dto'

export class UpdateFacebookPostDto extends PartialType(CreateFacebookPostDto) {}
