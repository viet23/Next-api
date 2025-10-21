// src/facebook-ads/facebook-ads.controller.ts
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common'
import { ApiParam, ApiTags } from '@nestjs/swagger'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { JwtAuthGuard } from '@modules/auth/jwt-auth.guard'
import { Authen } from '@decorators/authen.decorator'

import { FacebookAdsService } from './facebook-ads.service'
import { FacebookAdsUpdateService } from './facebook-ads-update.service'
import { FacebookPostService } from 'src/facebook-post/facebook-post.service'
import { TargetingSearchService } from './targeting-search.service'

import { CreateFacebookAdDto } from './dto/facebook-ads.dto'
import { AdInsightUpdateDTO } from './dto/ads-update.dto'
import { UpdateAdStatusDto } from './dto/update-ad-status.dto'

import { User } from '@models/user.entity'
import { SetStatusService } from './set-status.service'
import { FacebookPostIInternalService } from 'src/facebook-post/facebook-post-internal.service'
import { FacebookAdsInternalService } from './facebook-ads-internal.service'
import { PlanUsageService } from './check-plan-service'

// ⬇️ Thêm: service kiểm tra gói/giới hạn theo currentPlan (startDate → endDate)


@ApiTags('facebook-ads')
@Controller('facebook-ads')
export class FacebookAdsController {
  constructor(
    private readonly fbService: FacebookAdsService,
    private readonly fbpostService: FacebookPostService,
    private readonly fbAdsUpdate: FacebookAdsUpdateService,
    private readonly targetingSearch: TargetingSearchService,
    private readonly setStatus: SetStatusService,
    private readonly internalService: FacebookPostIInternalService,
    private readonly fbAdsInternalService: FacebookAdsInternalService,
    private readonly planUsageService: PlanUsageService, // ⬅️ inject

    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) { }

  /** Helper: suy ra ngân sách/tháng từ DTO (ưu tiên monthlyBudget → budgetMonthly → dailyBudget*30) */
  private getProposedMonthlyBudgetFromDto(dto: CreateFacebookAdDto): number | null {
    const anyDto = dto as any
    const monthly =
      typeof anyDto.monthlyBudget === 'number'
        ? anyDto.monthlyBudget
        : typeof anyDto.budgetMonthly === 'number'
          ? anyDto.budgetMonthly
          : typeof anyDto.dailyBudget === 'number'
            ? Math.round(anyDto.dailyBudget * 30)
            : null
    return typeof monthly === 'number' && !Number.isNaN(monthly) ? monthly : null
  }

  @Post('create')
  @UseGuards(JwtAuthGuard)
  async createAd(@Body() dto: CreateFacebookAdDto, @Authen() user: User) {
    if (!user?.email) throw new BadRequestException('Không xác định được email người dùng từ token.')

    const userData = await this.userRepo.findOne({ where: { email: user.email } })
    if (!userData) {
      throw new BadRequestException(`Không tìm thấy thông tin người dùng với email: ${user.email}`)
    }

    // ====== Kiểm tra gói theo currentPlan (startDate → endDate) ======
    // 1) Chặn nếu gói đã hết hạn / đã hết lượt campaign trong kỳ gói

    await this.planUsageService.assertCanCreateCampaign(userData.id)


    // 2) Chặn nếu ngân sách/campaign vượt trần gói (Free/Starter). Pro/Enterprise: unlimited.
    const proposedMonthlyBudget = this.getProposedMonthlyBudgetFromDto(dto)
    if (proposedMonthlyBudget != null) {
      await this.planUsageService.assertBudgetAllowed(userData.id, proposedMonthlyBudget)
    }

    console.log(`userData+++++++++++++1`, userData);
    // 3) Lấy report để FE hiển thị cảnh báo sắp hết hạn / isPaid=false (không bắt buộc nhưng hữu ích)
    const planUsage = await this.planUsageService.evaluateUsage(userData)

    console.log(`userData+++++++++++++2`, userData);


    // ====== Tạo quảng cáo như logic cũ ======
    if (userData.isInternal) {
      const result = await this.fbAdsInternalService.createFacebookAd(dto, user)
      return { result, planUsage }
    }
    const result = await this.fbService.createFacebookAd(dto, user)
    return { result, planUsage }
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @ApiParam({ name: 'id' })
  async updateflag(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AdInsightUpdateDTO): Promise<Partial<any>> {
    return this.fbAdsUpdate.updateAdInsight(id, dto)
  }

  @Get()
  async listAds(
    @Query('limit') limit = '200',
    @Query('fields')
    fieldsCsv = 'id,name,adset_id,campaign_id,status,effective_status,created_time,updated_time',
    @Query('effective_status') effectiveStatusCsv = 'ACTIVE,PAUSED,ARCHIVED',
    @Query('apiVersion') apiVersion = 'v19.0',
  ) {
    const fields = fieldsCsv
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const effective_status = effectiveStatusCsv
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    // (giữ nguyên demo hardcode; bạn có thể thay bằng token/account từ DB như flow createAd)
    const adAccountId = '930874367109118'
    const accessTokenUser =
      'EACMBh2I112ABOxgLmMooe04vFcMxxLKYe6YAiwUlzqy0U1AHKWHhyoCO84JZALo18FePlIQTrwykkcVKl8g6eZAk49IKTdNfrp1iNiudZCnoEChB4Y2qvwuENhLCkSPb7FhqDJmQ1PFHauidQdnkfAEr96Kiw3fZBXigqTZAnn2hPJTGgFWwdLZAro2bzv'
    const config = { apiVersion: 'v19.0', adAccountId, accessTokenUser }

    return this.fbService.listAds(
      {
        limit: Math.max(1, parseInt(limit, 10)),
        fields,
        effective_status,
        apiVersion,
      },
      config,
    )
  }

  @Get('graph')
  @UseGuards(JwtAuthGuard)
  async fetchFromGraph(@Authen() user: User) {
    if (!user?.email) throw new BadRequestException('Không xác định được email người dùng từ token.')

    const userData = await this.userRepo.findOne({ where: { email: user.email } })
    if (!userData) {
      throw new BadRequestException(`Không tìm thấy thông tin người dùng với email: ${user.email}`)
    }

    if (userData.isInternal) {
      return this.internalService.fetchPagePostsForUser(user)
    }
    return this.fbpostService.fetchPagePostsForUser(user)
  }

  // Đổi trạng thái Ad (ACTIVE/PAUSED)
  @Put(':adId/status')
  @UseGuards(JwtAuthGuard)
  @ApiParam({ name: 'adId', description: 'Facebook Ad ID (ví dụ: 1234567890)' })
  async setAdStatus(@Param('adId') adId: string, @Body() dto: UpdateAdStatusDto, @Authen() user: User) {
    return this.setStatus.setAdStatus({ adId, isActive: dto.isActive, user })
  }

  // ⬇️ Proxy Targeting Search (tìm city/region/country/subcity) — dùng accessTokenUser từ DB
  @Get('targeting-search')
  @UseGuards(JwtAuthGuard)
  async targetingSearchEndpoint(@Authen() user: User, @Query() all: any) {
    const f = all?.filter ?? {}

    // chấp nhận nhiều tên tham số + filter[]
    const q = String((all.q ?? all.query ?? all.keyword ?? f.q ?? f.query ?? f.keyword ?? '').toString()).trim()
    if (!q) return [] // hoặc throw new BadRequestException('q is required')

    const country_code = String(all.country_code ?? f.country_code ?? 'VN')
    const location_types = String(all.location_types ?? f.location_types ?? '["city","region","country","subcity"]')
    const limit = String(all.limit ?? f.limit ?? '10')
    const version = String(all.version ?? f.version ?? 'v23.0')
    const normalize = String(all.normalize ?? f.normalize ?? '1')

    // ✅ Lấy token/cookie của user đang đăng nhập
    const userData = await this.userRepo.findOne({ where: { email: user.email } })
    if (!userData) {
      throw new BadRequestException(`Không tìm thấy thông tin người dùng với email: ${user.email}`)
    }
    const { internalUserAccessToken } = userData
    if (!internalUserAccessToken) {
      throw new BadRequestException('Người dùng chưa liên kết Facebook hoặc thiếu internalUserAccessToken.')
    }

    const raw = await this.targetingSearch.search(
      { q, country_code, location_types, limit, version },
      { token: internalUserAccessToken},
    )

    return normalize === '1' ? this.targetingSearch.normalize(raw) : raw
  }
}
