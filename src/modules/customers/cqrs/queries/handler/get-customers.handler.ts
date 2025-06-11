import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import _ from 'lodash'
import { GetCustomersQuery } from '../impl/get-customers.query'
import { PaginatedResult } from '@common/interfaces/paginated-result.interface'
import { GtelpayCustomer } from '@models/gtelpay-customer.entity'
@QueryHandler(GetCustomersQuery)
export class GetCustomersQueryHandler implements IQueryHandler<GetCustomersQuery> {
  constructor(@InjectRepository(GtelpayCustomer) private readonly customerRepo: Repository<GtelpayCustomer>) {}
  async execute(query: GetCustomersQuery): Promise<PaginatedResult<Partial<GtelpayCustomer>>> {
    const { filter } = query
    const queryBulider = await this.customerRepo.createQueryBuilder('c')
    if (filter?.where) {
      const { where } = filter
      where?.fullName &&
        queryBulider.where('unaccent(c.customerName) ILIKE unaccent(:term)', { term: `%${where.fullName}%` })
      where?.email && queryBulider.andWhere('c.email  ILIKE :email', { email: `%${where.email}%` })
      where?.phone && queryBulider.andWhere('c.phoneNo =:phone', { phone: where.phone })
      where?.gender && queryBulider.andWhere('c.gender =:gender', { gender: where.gender })
      where?.dateOfBirth && queryBulider.andWhere('c.dateOfBirth =:dateOfBirth', { dateOfBirth: where.dateOfBirth })
      where?.isSuspect && queryBulider.andWhere('c.isSuspect =:isSuspect', { isSuspect: where.isSuspect })
    }
    const pageSize = filter?.pageSize || 20
    const page = filter?.page || 1
    const skip = (page - 1) * pageSize
    queryBulider.skip(skip)
    queryBulider.take(pageSize)
    const [data, total] = await queryBulider.getManyAndCount()
    return {
      data: data,
      total: total,
    }
  }
}
