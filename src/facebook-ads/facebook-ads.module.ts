// src/facebook/facebook.module.ts
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { FacebookAdsController } from './facebook-ads.controller';
import { FacebookAdsService } from './facebook-ads.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '@models/user.entity';
import { CqrsModule } from '@nestjs/cqrs';
import { FacebookAd } from '@models/facebook-ad.entity';


@Module({
  imports: [HttpModule, TypeOrmModule.forFeature([User,FacebookAd]), CqrsModule],
  providers: [FacebookAdsService],
  controllers: [FacebookAdsController],
})
export class FacebookModule { }
