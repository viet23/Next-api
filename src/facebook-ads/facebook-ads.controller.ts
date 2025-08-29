import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common'
import { FacebookAdsService } from './facebook-ads.service'
import { CreateFacebookAdDto } from './dto/facebook-ads.dto'
import { ApiParam, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '@modules/auth/jwt-auth.guard'
import { User } from '@models/user.entity'
import { Authen } from '@decorators/authen.decorator'
import { AdInsightUpdateDTO } from './dto/ads-update.dto'

@ApiTags('facebook-ads')
@Controller('facebook-ads')
export class FacebookAdsController {
  constructor(private readonly fbService: FacebookAdsService) { }

  @Post('create')
  @UseGuards(JwtAuthGuard)
  createAd(@Body() dto: CreateFacebookAdDto, @Authen() user: User) {
    return this.fbService.createFacebookAd(dto, user)
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @ApiParam({ name: 'id' })
  async updateflag(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AdInsightUpdateDTO): Promise<Partial<any>> {
    console.log(`id`, id, dto);

    return this.fbService.updateAdInsight(id, dto)
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
      limit: Math.max(1, parseInt(limit, 10)), // mặc định 200
      fields,
      effective_status,
      apiVersion,
    }, config);
  }

}
