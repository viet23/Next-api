import { BadRequestException, Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common'
import { FacebookAdsService } from './facebook-ads.service'
import { CreateFacebookAdDto } from './dto/facebook-ads.dto'
import { ApiParam, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '@modules/auth/jwt-auth.guard'
import { User } from '@models/user.entity'
import { Authen } from '@decorators/authen.decorator'
import { AdInsightUpdateDTO } from './dto/ads-update.dto'
import { FacebookPostService } from 'src/facebook-post/facebook-post.service'
import { UpdateAdStatusDto } from './dto/update-ad-status.dto'
import { FacebookAdsUpdateService } from './facebook-ads-update.service'


@ApiTags('facebook-ads')
@Controller('facebook-ads')
export class FacebookAdsController {
  constructor(
    private readonly fbService: FacebookAdsService,
    private readonly fbpostService: FacebookPostService,
    private readonly fbAdsUpdate: FacebookAdsUpdateService
  ) { }

  @Post('create')
  @UseGuards(JwtAuthGuard)
  createAd(@Body() dto: CreateFacebookAdDto, @Authen() user: User) {
    console.log(`dto`, dto, user);
    
    return this.fbService.createFacebookAd(dto, user)
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @ApiParam({ name: 'id' })
  async updateflag(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AdInsightUpdateDTO): Promise<Partial<any>> {
    console.log(`id`, id, dto);
    return this.fbAdsUpdate.updateAdInsight(id, dto)
  }

  @Get()
  async listAds(
    @Query('limit') limit = '200',
    @Query('fields') fieldsCsv = 'id,name,adset_id,campaign_id,status,effective_status,created_time,updated_time',
    @Query('effective_status') effectiveStatusCsv = 'ACTIVE,PAUSED,ARCHIVED',
    @Query('apiVersion') apiVersion = 'v19.0',
  ) {
    const fields = fieldsCsv.split(',').map((s) => s.trim()).filter(Boolean);
    const effective_status = effectiveStatusCsv.split(',').map((s) => s.trim()).filter(Boolean);

    const adAccountId = '930874367109118'; // 'FB_AD_ACCOUNT_ID';
    const accessTokenUser = 'EACMBh2I112ABOxgLmMooe04vFcMxxLKYe6YAiwUlzqy0U1AHKWHhyoCO84JZALo18FePlIQTrwykkcVKl8g6eZAk49IKTdNfrp1iNiudZCnoEChB4Y2qvwuENhLCkSPb7FhqDJmQ1PFHauidQdnkfAEr96Kiw3fZBXigqTZAnn2hPJTGgFWwdLZAro2bzv'; // 'FB_ACCESS_TOKEN_USER';
    const config = { apiVersion: 'v19.0', adAccountId, accessTokenUser }

    return this.fbService.listAds({
      limit: Math.max(1, parseInt(limit, 10)),
      fields,
      effective_status,
      apiVersion,
    }, config);
  }

  @Get('graph')
  @UseGuards(JwtAuthGuard)
  async fetchFromGraph(@Authen() user: User) {
    console.log(`pageId hâhahahaahahah`, user);
    if (!user?.email) {
      throw new BadRequestException('Không xác định được email người dùng từ token.');
    }
    return this.fbpostService.fetchPagePostsForUser(user);
  }

  // 👇 THÊM MỚI: Đổi trạng thái Ad (ACTIVE/PAUSED)
  @Put(':adId/status')
  @UseGuards(JwtAuthGuard)
  @ApiParam({ name: 'adId', description: 'Facebook Ad ID (ví dụ: 1234567890)' })
  async setAdStatus(
    @Param('adId') adId: string, // KHÔNG dùng ParseUUIDPipe vì adId là số/string của FB
    @Body() dto: UpdateAdStatusDto,
    @Authen() user: User
  ) {

    return this.fbService.setAdStatus({
      adId,
      isActive: dto.isActive,
      user,
    });
  }
}
