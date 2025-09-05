// src/modules/facebook-post/facebook-post.controller.ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { FacebookPostService } from './facebook-post.service';
import { CreateFacebookPostDto } from './dto/create-facebook-post.dto';
import { UpdateFacebookPostDto } from './dto/update-facebook-post.dto';
import { QueryFacebookPostDto } from './dto/query-facebook-post.dto';

import { JwtAuthGuard } from '@modules/auth/jwt-auth.guard';
import { Authen } from '@decorators/authen.decorator';
import { User } from '@models/user.entity';

@ApiTags('facebook-posts')
@Controller('facebook-posts')
export class FacebookPostController {
  constructor(private readonly service: FacebookPostService) {}

  @Post()
  create(@Body() dto: CreateFacebookPostDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll(@Query() query: QueryFacebookPostDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateFacebookPostDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Patch(':id/restore')
  restore(@Param('id') id: string) {
    return this.service.restore(id);
  }

  // ===== NEW: gọi Graph ở BE, yêu cầu JWT; service sẽ tự xử lý Cookie/Bearer/appsecret_proof =====
  @Get('graph')
  @UseGuards(JwtAuthGuard)
  async fetchFromGraph( @Authen() user: User,) {
    console.log(`pageId hâhahahaahahah`, user);
    
    if (!user?.email) {
      throw new BadRequestException('Không xác định được email người dùng từ token.');
    }
    return this.service.fetchPagePostsForUser(user);
  }
}
