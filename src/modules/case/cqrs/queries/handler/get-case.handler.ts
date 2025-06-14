import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import _ from 'lodash'
import { GetCaseQuery } from '../impl/get-case.query'
import { PaginatedResult } from '@common/interfaces/paginated-result.interface'
import { Case } from '@models/case.entity'
import moment from 'moment'
import { formatDateTime } from '@common/constants/customer'
@QueryHandler(GetCaseQuery)
export class GetCaseQueryHandler implements IQueryHandler<GetCaseQuery> {
  constructor(@InjectRepository(Case) private readonly caseRepo: Repository<Case>) {}
  async execute(q: GetCaseQuery): Promise<PaginatedResult<Partial<Case>>> {
    const { filter } = q
    const query = await this.caseRepo
      .createQueryBuilder('case')

    if (filter?.pageSize && filter?.page) {
      const pageSize = filter?.pageSize
      const page = filter?.page
      const skip = (page - 1) * pageSize
      query.take(pageSize)
      query.skip(skip)
    }

    query.orderBy('case.createdAt', 'DESC')
    const [data, total] = await query.getManyAndCount()
    return { data, total }
  }
}
