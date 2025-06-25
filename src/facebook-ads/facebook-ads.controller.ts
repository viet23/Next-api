import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { FacebookAdsService } from './facebook-ads.service';
import { CreateFacebookAdDto } from './dto/facebook-ads.dto';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/auth/jwt-auth.guard';
import { User } from '@models/user.entity';
import { Authen } from '@decorators/authen.decorator';

@ApiTags('facebook-ads')
@Controller('facebook-ads')
export class FacebookAdsController {
  constructor(private readonly fbService: FacebookAdsService) { }

  @Post('create')
  @UseGuards(JwtAuthGuard)
  createAd(@Body() dto: CreateFacebookAdDto ,@Authen() user: User) {
    return this.fbService.createFacebookAd(dto , user );
  }
}