import { Injectable, BadRequestException } from '@nestjs/common';
import axios from 'axios';
import { CreateFacebookAdDto } from './dto/facebook-ads.dto';
import qs from 'qs';
import { User } from '@models/user.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FacebookAd } from '@models/facebook-ad.entity';

@Injectable()
export class FacebookAdsService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(FacebookAd) private readonly facebookAdRepo: Repository<FacebookAd>
  ) { }

  async createFacebookAd(dto: CreateFacebookAdDto, user: User) {
    try {
      console.log(`📥 Input DTO:`, dto);
      console.log(`📥 Input user:`, user);

      const userData = await this.userRepo.findOne({ where: { email: user.email } });
      if (!userData) {
        throw new BadRequestException(`Không tìm thấy thông tin người dùng với email: ${user.email}`);
      }

      const { accessTokenUser, accountAdsId: adAccountId, idPage: pageId } = userData;

      if (!accessTokenUser) {
        throw new BadRequestException(`Người dùng chưa liên kết Facebook hoặc thiếu accessTokenUser.`);
      }

      if (!adAccountId) {
        throw new BadRequestException(`Người dùng chưa có accountAdsId. Vui lòng kiểm tra lại cài đặt tài khoản quảng cáo.`);
      }

      if (!pageId) {
        throw new BadRequestException(`Người dùng chưa liên kết Fanpage (idPage).`);
      }

      const campaignId = await this.createCampaign(dto, accessTokenUser, adAccountId);
      const adSetId = await this.createAdSet(dto, campaignId, accessTokenUser, pageId, adAccountId);
      const creativeId = await this.createCreative(dto.postId, accessTokenUser, adAccountId);
      const ad = await this.createAd(adSetId, creativeId, accessTokenUser, adAccountId);

      await this.facebookAdRepo.save({
        adId: ad.id,
        campaignName: dto.campaignName,
        caption: dto.caption,
        objective: dto.goal,
        startTime: new Date(dto.startTime),
        endTime: new Date(dto.endTime),
        dailyBudget: dto.dailyBudget,
        status: 'ACTIVE',
        createdBy: userData,
      });
      return ad;
    } catch (error: any) {
      const errorMessage = error?.response?.data?.error?.error_user_msg || error.message;
      console.error('❌ createFacebookAd failed:', error?.response?.data);
      throw new BadRequestException(`Tạo quảng cáo thất bại: ${errorMessage}`);
    }
  }

  private async createCampaign(dto: CreateFacebookAdDto, accessTokenUser: string, adAccountId: string): Promise<string> {
    try {
      const res = await axios.post(
        `https://graph.facebook.com/v19.0/act_${adAccountId}/campaigns`,
        qs.stringify({
          name: dto.campaignName,
          objective:
            dto.goal === 'message'
              ? 'OUTCOME_LEADS'
              : dto.goal === 'engagement'
                ? 'OUTCOME_ENGAGEMENT'
                : dto.goal === 'leads'
                  ? 'OUTCOME_LEADS'
                  : 'OUTCOME_TRAFFIC',
          status: 'PAUSED',
          special_ad_categories: '["NONE"]',
          access_token: accessTokenUser,
        }),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        },
      );
      console.log(`✅ Campaign created: ${res.data.id}`);
      return res.data.id;
    } catch (error: any) {
      const message = error?.response?.data?.error?.error_user_msg || error.message;
      console.error('❌ Campaign creation error:', error?.response?.data);
      throw new BadRequestException(`Tạo chiến dịch thất bại: ${message}`);
    }
  }

  private async createAdSet(dto: CreateFacebookAdDto, campaignId: string, accessTokenUser: string, pageId: string, adAccountId: string): Promise<string> {
    try {
      const getInterestId = async (name: string) => {
        try {
          const url = `https://graph.facebook.com/v19.0/search?type=adinterest&q=${encodeURIComponent(name)}&access_token=${accessTokenUser}`;
          const res = await axios.get(url);
          return res.data?.data?.[0] || null;
        } catch (e) {
          console.warn(`⚠️ Không tìm thấy interest: ${name}`);
          return null;
        }
      };

      const interestResults: { id: string; name: string }[] = [];
      if (dto.detailedTargeting?.length > 0) {
        for (const keyword of dto.detailedTargeting) {
          const result = await getInterestId(keyword);
          if (result) interestResults.push(result);
        }
      }

      const targetingPayload: any = {
        geo_locations: dto.location && dto.radius
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
      };

      if (dto.aiTargeting) {
        targetingPayload.targeting_automation = { advantage_audience: 1 };
        if (dto.gender && dto.gender !== 'all') {
          targetingPayload.genders = dto.gender === 'male' ? [1] : [2];
        }
        if (dto.ageRange?.length === 2) {
          targetingPayload.age_min = dto.ageRange[0];
          targetingPayload.age_max = dto.ageRange[1];
        }
        if (interestResults.length > 0) {
          targetingPayload.interests = interestResults.map((item) => ({
            id: item.id,
            name: item.name,
          }));;
        }
      }

      console.log(`targetingPayload`, targetingPayload);


      const res = await axios.post(
        `https://graph.facebook.com/v19.0/act_${adAccountId}/adsets`,
        qs.stringify({
          name: dto.campaignName,
          campaign_id: campaignId,
          daily_budget: dto.dailyBudget * 100,
          billing_event: 'IMPRESSIONS',
          optimization_goal: 'LINK_CLICKS',
          bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
          start_time: dto.startTime,
          end_time: dto.endTime,
          status: 'PAUSED',
          targeting: JSON.stringify(targetingPayload),
          promoted_object: JSON.stringify({
            page_id: pageId,
            custom_event_type: 'OTHER',
          }),
          access_token: accessTokenUser,
        }),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        },
      );

      console.log(`✅ AdSet created: ${res.data.id}`);
      return res.data.id;
    } catch (error: any) {
      const message = error?.response?.data?.error?.error_user_msg || error.message;
      console.error('❌ AdSet creation error:', error?.response?.data);
      throw new BadRequestException(`Tạo AdSet thất bại: ${message}`);
    }
  }

  private async createCreative(postId: string, accessTokenUser: string, adAccountId: string): Promise<string> {
    try {
      const res = await axios.post(
        `https://graph.facebook.com/v19.0/act_${adAccountId}/adcreatives`,
        qs.stringify({
          name: 'Creative từ bài viết có sẵn',
          object_story_id: postId,
          access_token: accessTokenUser,
        }),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        },
      );
      console.log(`✅ Creative created: ${res.data.id}`);
      return res.data.id;
    } catch (error: any) {
      const message = error?.response?.data?.error?.error_user_msg || error.message;
      console.error('❌ Creative creation error:', error?.response?.data);
      throw new BadRequestException(`Tạo Creative thất bại: ${message}`);
    }
  }

  private async createAd(adSetId: string, creativeId: string, accessTokenUser: string, adAccountId: string) {
    try {
      const res = await axios.post(
        `https://graph.facebook.com/v19.0/act_${adAccountId}/ads`,
        null,
        {
          params: {
            name: 'Final Ad',
            adset_id: adSetId,
            creative: JSON.stringify({ creative_id: creativeId }),
            status: 'PAUSED',
            access_token: accessTokenUser,
          },
        },
      );
      const adId = res.data.id;
      console.log(`✅ Ad created: ${adId}`);
      await this.activateAd(adId, accessTokenUser);
      return res.data;
    } catch (error: any) {
      const message = error?.response?.data?.error?.error_user_msg || error.message;
      console.error('❌ Ad creation error:', error?.response?.data);
      throw new BadRequestException(`Tạo quảng cáo thất bại: ${message}`);
    }
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
      );
      console.log(`🚀 Ad ${adId} activated successfully.`);
    } catch (error: any) {
      const message = error?.response?.data?.error?.error_user_msg || error.message;
      console.error(`❌ Failed to activate Ad ${adId}:`, error?.response?.data);
      throw new BadRequestException(`Kích hoạt quảng cáo thất bại: ${message}`);
    }
  }
}
