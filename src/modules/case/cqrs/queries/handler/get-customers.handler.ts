import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import _ from 'lodash'
import { GetCustomerCasesQuery } from '../impl/get-customers.query'
import { PaginatedResult } from '@common/interfaces/paginated-result.interface'
import { GtelpayCustomer } from '@models/gtelpay-customer.entity'
@QueryHandler(GetCustomerCasesQuery)
export class GetCustomerCasesQueryHandler implements IQueryHandler<GetCustomerCasesQuery> {
  constructor(@InjectRepository(GtelpayCustomer) private readonly customerRepo: Repository<GtelpayCustomer>) {}
  async execute(query: GetCustomerCasesQuery): Promise<PaginatedResult<Partial<GtelpayCustomer>>> {
    const { filter } = query
    const queryBulider = await this.customerRepo.createQueryBuilder('c')
    if (filter?.where) {
      const { where } = filter
      where?.fullName &&
        queryBulider.where('unaccent(c.customerName) ILIKE unaccent(:term)', { term: `%${where.fullName}%` })
    }
    const [data, total] = await queryBulider.getManyAndCount()
    return {
      data: data,
      total: total,
    }
  }
}
