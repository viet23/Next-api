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
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { FacebookPostService } from './facebook-post.service'
import { CreateFacebookPostDto } from './dto/create-facebook-post.dto'
import { UpdateFacebookPostDto } from './dto/update-facebook-post.dto'
import { QueryFacebookPostDto } from './dto/query-facebook-post.dto'

import { JwtAuthGuard } from '@modules/auth/jwt-auth.guard'
import { Authen } from '@decorators/authen.decorator'
import { User } from '@models/user.entity'
import { FacebookPostIInternalService } from './facebook-post-internal.service'
import { Repository } from 'typeorm'
import { InjectRepository } from '@nestjs/typeorm'

@ApiTags('facebook-posts')
@Controller('facebook-posts')
export class FacebookPostController {
  constructor(
    private readonly service: FacebookPostService,
    private readonly internalService: FacebookPostIInternalService,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  // ===== CRUD =====
  @Post()
  create(@Body() dto: CreateFacebookPostDto) {
    return this.service.create(dto)
  }

  @Get()
  findAll(@Query() query: QueryFacebookPostDto) {
    return this.service.findAll(query)
  }

  // ===== NEW: Gọi Graph lấy posts + reach (giữ y hệt style đang chạy tốt) =====
  @Get('graph')
  @UseGuards(JwtAuthGuard)
  async fetchFromGraph(@Authen() user: User) {
    console.log('fetchFromGraph user:', user)
    if (!user?.email) {
      throw new BadRequestException('Không xác định được email người dùng từ token.')
    }
    const userData = await this.userRepo.findOne({ where: { email: user.email } })
    if (!userData) {
      throw new BadRequestException(`Không tìm thấy thông tin người dùng với email: ${user.email}`)
    }

    if (userData.isInternal) {
      return this.internalService.fetchPagePostsForUser(user)
    }
    return this.service.fetchPagePostsForUser(user)
  }

  // ===== NEW: Gọi Graph lấy insights page_views_total (14 ngày mặc định) =====
  @Get('insights/page-views')
  @UseGuards(JwtAuthGuard)
  async fetchPageViews(@Authen() user: User, @Query('days') days?: string) {
    console.log('fetchPageViews user +++++++++++++++++++++++++++++++++++++++:', user)
    if (!user?.email) {
      throw new BadRequestException('Không xác định được email người dùng từ token.')
    }
    const d = days ? Math.max(1, parseInt(days, 10)) : 14
    const userData = await this.userRepo.findOne({ where: { email: user.email } })
    if (!userData) {
      throw new BadRequestException(`Không tìm thấy thông tin người dùng với email: ${user.email}`)
    }

    if (userData.isInternal) {
      return this.internalService.fetchPageViewsForUser(user, d)
    }
    return this.service.fetchPageViewsForUser(user, d)
  }

  // ===== Khôi phục (đặt trước :id để tránh hiểu nhầm route) =====
  @Patch(':id/restore')
  restore(@Param('id') id: string) {
    return this.service.restore(id)
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id)
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateFacebookPostDto) {
    return this.service.update(id, dto)
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id)
  }
}
