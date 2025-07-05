import { Injectable, BadRequestException } from '@nestjs/common'
import axios from 'axios'
import { CreateFacebookAdDto } from './dto/facebook-ads.dto'
import qs from 'qs'
import { User } from '@models/user.entity'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { FacebookAd } from '@models/facebook-ad.entity'

@Injectable()
export class FacebookAdsService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(FacebookAd) private readonly facebookAdRepo: Repository<FacebookAd>,
  ) {}

  async createFacebookAd(dto: CreateFacebookAdDto, user: User) {
    try {
      console.log(`📥 Input DTO:`, dto)
      console.log(`📥 Input user:`, user)

      const userData = await this.userRepo.findOne({ where: { email: user.email } })
      if (!userData) {
        throw new BadRequestException(`Không tìm thấy thông tin người dùng với email: ${user.email}`)
      }

      const { accessTokenUser, accountAdsId: adAccountId, idPage: pageId, accessToken } = userData

      if (!accessTokenUser) {
        throw new BadRequestException(`Người dùng chưa liên kết Facebook hoặc thiếu accessTokenUser.`)
      }

      if (!adAccountId) {
        throw new BadRequestException(
          `Người dùng chưa có accountAdsId. Vui lòng kiểm tra lại cài đặt tài khoản quảng cáo.`,
        )
      }

      if (!pageId) {
        throw new BadRequestException(`Người dùng chưa liên kết Fanpage (idPage).`)
      }

      const campaignId = await this.createCampaign(dto, accessTokenUser, adAccountId)
      const adSetId = await this.createAdSet(dto, campaignId, accessTokenUser, pageId, adAccountId)
      const creativeId = await this.createCreative(dto, accessTokenUser, adAccountId, pageId)
      const ad = await this.createAd(dto, adSetId, creativeId, accessTokenUser, adAccountId)
      await this.activateCampaign(campaignId, accessTokenUser)
      await this.activateAdSet(adSetId, accessTokenUser)

      await this.facebookAdRepo.save({
        adId: ad.id,
        campaignName: dto.campaignName,
        caption: dto.caption,
        objective: 'awareness',
        startTime: new Date(dto.startTime),
        endTime: new Date(dto.endTime),
        dailyBudget: dto.dailyBudget,
        status: 'ACTIVE',
        createdBy: userData,
      })
      return ad
    } catch (error: any) {
      const errorMessage = error?.response?.data?.error?.error_user_msg || error.message
      console.error('❌ createFacebookAd failed:', error?.response?.data)
      throw new BadRequestException(`Tạo quảng cáo thất bại: ${errorMessage}`)
    }
  }

  private async createCampaign(
    dto: CreateFacebookAdDto,
    accessTokenUser: string,
    adAccountId: string,
  ): Promise<string> {
    try {
      const res = await axios.post(
        `https://graph.facebook.com/v19.0/act_${adAccountId}/campaigns`,
        qs.stringify({
          name: dto.campaignName,
          objective: 'OUTCOME_AWARENESS',
          status: 'PAUSED',
          special_ad_categories: '["NONE"]',
          access_token: accessTokenUser,
        }),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        },
      )
      console.log(`✅ Campaign created: ${res.data.id}`)
      return res.data.id
    } catch (error: any) {
      const message = error?.response?.data?.error?.error_user_msg || error.message
      console.error('❌ Campaign creation error:', error?.response?.data)
      throw new BadRequestException(`Tạo chiến dịch thất bại: ${message}`)
    }
  }

  private async createAdSet(
    dto: CreateFacebookAdDto,
    campaignId: string,
    accessTokenUser: string,
    pageId: string,
    adAccountId: string,
  ): Promise<string> {
    try {
      const targetingPayload: any = {
        geo_locations:
          dto.location && dto.radius
            ? {
                custom_locations: [
                  {
                    latitude: dto.location.lat,
                    longitude: dto.location.lng,
                    radius: +(dto.radius / 1609.34).toFixed(2),
                    distance_unit: 'mile',
                  },
                ],
              }
            : { countries: ['VN'] },
        publisher_platforms: ['facebook', 'instagram'],
        facebook_positions: ['feed'],
        instagram_positions: ['stream', 'story'],
      }
      if (dto.aiTargeting) {
        targetingPayload.targeting_automation = { advantage_audience: 1 }
      }

      const res = await axios.post(
        `https://graph.facebook.com/v19.0/act_${adAccountId}/adsets`,
        qs.stringify({
          name: dto.campaignName,
          campaign_id: campaignId,
          daily_budget: dto.dailyBudget,
          billing_event: 'IMPRESSIONS',
          optimization_goal: 'REACH',
          bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
          start_time: dto.startTime,
          end_time: dto.endTime,
          status: 'PAUSED',
          targeting: JSON.stringify(targetingPayload),
          promoted_object: JSON.stringify({
            page_id: pageId,
          }),
          access_token: accessTokenUser,
        }),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        },
      )
      console.log(`✅ AdSet created: ${res.data.id}`)
      return res.data.id
    } catch (error: any) {
      const message = error?.response?.data?.error?.error_user_msg || error.message
      console.error('❌ AdSet creation error:', error?.response?.data)
      throw new BadRequestException(`Tạo AdSet thất bại: ${message}`)
    }
  }

  private async createCreative(
    dto: CreateFacebookAdDto,
    accessTokenUser: string,
    adAccountId: string,
    pageId: string,
  ): Promise<string> {
    try {
      if (!dto.postId) {
        throw new BadRequestException('Thiếu postId cho bài viết.')
      }

      const res = await axios.post(
        `https://graph.facebook.com/v19.0/act_${adAccountId}/adcreatives`,
        qs.stringify({
          name: dto.campaignName,
          object_story_id: dto.postId,
          access_token: accessTokenUser,
        }),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        },
      )

      console.log(`✅ Creative created: ${res.data.id}`)
      return res.data.id
    } catch (error: any) {
      const message = error?.response?.data?.error?.error_user_msg || error.message
      console.error('❌ Creative creation error:', error?.response?.data)
      throw new BadRequestException(`Tạo Creative thất bại: ${message}`)
    }
  }

  private async createAd(
    dto: CreateFacebookAdDto,
    adSetId: string,
    creativeId: string,
    accessTokenUser: string,
    adAccountId: string,
  ) {
    try {
      const res = await axios.post(`https://graph.facebook.com/v19.0/act_${adAccountId}/ads`, null, {
        params: {
          name: dto.campaignName,
          adset_id: adSetId,
          creative: JSON.stringify({ creative_id: creativeId }),
          status: 'PAUSED',
          access_token: accessTokenUser,
        },
      })
      const adId = res.data.id
      console.log(`✅ Ad created: ${adId}`)
      await this.activateAd(adId, accessTokenUser)
      return res.data
    } catch (error: any) {
      const message = error?.response?.data?.error?.error_user_msg || error?.response?.data?.error?.message
      console.error('❌ Ad creation error:', error?.response?.data)
      throw new BadRequestException(`Tạo quảng cáo thất bại: ${message}`)
    }
  }

  private async activateCampaign(campaignId: string, accessTokenUser: string) {
    await axios.post(
      `https://graph.facebook.com/v19.0/${campaignId}`,
      qs.stringify({ status: 'ACTIVE', access_token: accessTokenUser }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    )
    console.log(`🚀 Campaign ${campaignId} activated successfully.`)
  }

  private async activateAdSet(adSetId: string, accessTokenUser: string) {
    await axios.post(
      `https://graph.facebook.com/v19.0/${adSetId}`,
      qs.stringify({ status: 'ACTIVE', access_token: accessTokenUser }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    )
    console.log(`🚀 AdSet ${adSetId} activated successfully.`)
  }

  private async activateAd(adId: string, accessTokenUser: string) {
    try {
      await axios.post(
        `https://graph.facebook.com/v19.0/${adId}`,
        qs.stringify({
          status: 'ACTIVE',
          access_token: accessTokenUser,
        }),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        },
      )
      console.log(`🚀 Ad ${adId} activated successfully.`)
    } catch (error: any) {
      const message = error?.response?.data?.error?.error_user_msg || error.message
      console.error(`❌ Failed to activate Ad ${adId}:`, error?.response?.data)
      throw new BadRequestException(`Kích hoạt quảng cáo thất bại: ${message}`)
    }
  }
}
