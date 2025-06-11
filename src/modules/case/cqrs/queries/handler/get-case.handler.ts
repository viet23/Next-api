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
      .leftJoinAndSelect('case.customers', 'customers')
      .leftJoinAndSelect('case.assignedBy', 'assignedBy')
    if (filter?.where) {
      const { where } = filter
      where?.phoneOrEmail && query.andWhere('case.contactInfo =:contactInfo', { contactInfo: where.phoneOrEmail })
      where?.ticketCode && query.andWhere('case.code =:code', { code: where.ticketCode })
      where?.feature && query.andWhere('case.feature =:feature', { feature: where.feature })
      where?.issueType && query.andWhere('case.problemType =:problemType', { problemType: where.issueType })
      where?.receiver &&
        query.andWhere('unaccent(assignedBy.fullName) ILIKE unaccent(:assignBy)', { assignBy: `%${where.receiver}%` })
      where?.department && query.andWhere('case.department =:department', { department: where.department })
      where?.ticketStatus && query.andWhere('case.internalState =:internalState', { internalState: where.ticketStatus })
      where?.startDate &&
        query.andWhere('case.createdAt >= :startDate', {
          startDate: moment(where.startDate).startOf('day').format(formatDateTime),
        })
      where?.endDate &&
        query.andWhere('case.createdAt <= :endDate', {
          endDate: moment(where.endDate).endOf('day').format(formatDateTime),
        })
    }

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
