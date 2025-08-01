import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import _ from 'lodash'
import { AnalysisFb } from '@models/analysis-fb.entity'
import { User } from '@models/user.entity'
import { GetFacebookAdsQuery } from '../impl/get-facebook-ads.query'
import { FacebookAd } from '@models/facebook-ad.entity'
import { Logger } from '@nestjs/common'
import axios from 'axios'
import moment from 'moment-timezone'
const formatCurrency = (v) => Number(v).toLocaleString('en-US') // 1,234,567
const format2 = (v) => Number(v).toFixed(2) // 2 chữ số thập phân

@QueryHandler(GetFacebookAdsQuery)
export class GetFacebookAdsQueryHandler implements IQueryHandler<GetFacebookAdsQuery> {
  private readonly logger = new Logger(`${GetFacebookAdsQueryHandler.name}`)
  constructor(
    @InjectRepository(FacebookAd)
    private readonly facebookAdRepo: Repository<FacebookAd>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) { }
  async execute(q: GetFacebookAdsQuery): Promise<any> {
    const { filter, user } = q
    const userData = await this.userRepo.findOne({ where: { email: user.email } })

    const query = this.facebookAdRepo.createQueryBuilder('facebook_ads')
      .leftJoinAndSelect('facebook_ads.createdBy', 'createdBy')
      .where('facebook_ads.createdBy.id = :updatedById', { updatedById: userData?.id }).orderBy('facebook_ads.createdAt', 'DESC');

    if (filter[`filter`]?.pageSize && filter[`filter`]?.page) {
      const skip = (filter[`filter`]?.page - 1) * filter[`filter`]?.pageSize;
      query.take(filter[`filter`]?.pageSize).skip(skip);
    }


    const [data, total] = await query.getManyAndCount();

    const dataAds = []

    for (let i = 0; i < data.length; i++) {
      const ad = data[i];

      try {
        const response = await axios.get(`https://graph.facebook.com/v19.0/${ad.adId}/insights`, {
          params: {
            fields: [
              'date_start',
              'date_stop',
              'impressions',
              'reach',
              'frequency',
              'spend',
              'cpm',
              'cpc',
              'ctr',
              'clicks',
              'inline_link_clicks',
              'actions',
              'action_values',
              'video_avg_time_watched_actions',
              'purchase_roas'
            ].join(',')
            ,
            date_preset: 'maximum',
            access_token: ad.createdBy?.accessTokenUser,
          },
        });


        console.log(`response.data`, response.data);
        console.log(`response.data.actions`, response.data?.data?.[0].actions);


        const dataFb = response.data?.data?.[0];

        dataAds.push({
          key: i + 1,
          adId: ad.adId,
          campaignName: ad.campaignName,
          data: {
            impressions: dataFb?.impressions || 0,
            clicks: dataFb?.clicks || 0,
            spend: formatCurrency(dataFb?.spend || 0),
            ctr: format2(dataFb?.ctr || 0),
            cpm: formatCurrency(format2(dataFb?.cpm || 0)),
          },
        });
      } catch (error: any) {
        dataAds.push({
          key: ad.id,
          adId: ad.adId,
          campaignName: ad.campaignName,
          data: {
            impressions: 0,
            clicks: 0,
            spend: 0,
            ctr: 0,
            cpm: 0,
          },
        });

        console.log("❌ Error response:", error.response?.data || error.message);

        this.logger.error(`❌ Lỗi khi lấy dữ liệu cho ad ${ad.adId}: ${error.message}`);
      }
    }

    return { data: dataAds, total }
  }
}
