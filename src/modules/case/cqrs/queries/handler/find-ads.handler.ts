import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import _ from 'lodash'
import { Case } from '@models/case.entity'
import { FindAdsQuery } from '../impl/find-ads.query'
import { AdInsight } from '@models/ad-insight.entity'
@QueryHandler(FindAdsQuery)
export class FindAdsQueryHandler implements IQueryHandler<FindAdsQuery> {
  constructor(@InjectRepository(AdInsight) private readonly adInsightRepo: Repository<AdInsight>) {}
  async execute(q: FindAdsQuery): Promise<any> {
    const { id } = q
    const adInsight = await this.adInsightRepo.createQueryBuilder('adInsight').where('adInsight.adId=:id', { id: id }).getMany()
    return adInsight
  }
}
