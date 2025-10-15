// src/facebook/facebook.module.ts
import { Module } from '@nestjs/common'
import { HttpModule } from '@nestjs/axios'
import { FacebookAdsController } from './facebook-ads.controller'
import { FacebookAdsService } from './facebook-ads.service'
import { TypeOrmModule } from '@nestjs/typeorm'
import { User } from '@models/user.entity'
import { CqrsModule } from '@nestjs/cqrs'
import { FacebookAd } from '@models/facebook-ad.entity'
import { AdInsight } from '@models/ad-insight.entity'
import { FacebookPostModule } from 'src/facebook-post/facebook-post.module'
import { FacebookAdsUpdateService } from './facebook-ads-update.service'
import { AiPlannerService } from './ai-planner.service'
import { TargetingSearchService } from './targeting-search.service'
import { SetStatusService } from './set-status.service'
import { FacebookCampaign } from '@models/facebook_campaign.entity'
import { FacebookAdsInternalService } from './facebook-ads-internal.service'

@Module({
  imports: [
    HttpModule,
    TypeOrmModule.forFeature([User, FacebookAd, AdInsight, FacebookCampaign]),
    CqrsModule,
    FacebookPostModule,
  ],
  providers: [FacebookAdsService, AiPlannerService, FacebookAdsUpdateService, TargetingSearchService, SetStatusService ,FacebookAdsInternalService],
  controllers: [FacebookAdsController],
  exports: [FacebookAdsService , FacebookAdsInternalService],
})
export class FacebookModule {}
