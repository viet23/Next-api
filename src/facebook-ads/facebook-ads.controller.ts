import { Body, Controller, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common'
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
    console.log(`id` , id , dto);
    
    return this.fbService.updateAdInsight(id, dto)
  }
}
