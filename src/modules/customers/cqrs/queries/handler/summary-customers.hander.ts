import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { SummaryCustomersQuery } from '../impl/summary-customers.query'
import { InjectRepository } from '@nestjs/typeorm'
import { Customers } from '@models/customer.entity'
import { Repository } from 'typeorm'
import { IsSusPectEnum } from '@common/enums/suspect.enum'

@QueryHandler(SummaryCustomersQuery)
export class SummaryCustomersQueryHandler implements IQueryHandler<SummaryCustomersQuery> {
  constructor(@InjectRepository(Customers) private readonly customerRepo: Repository<Customers>) {}
  async execute(query: SummaryCustomersQuery): Promise<any> {
    const totalCustomer = await this.customerRepo.count()
    const totalBlackList = await this.customerRepo
      .createQueryBuilder()
      .where('isSuspect =:isSuspect', { isSuspect: IsSusPectEnum.IS_SUSPECT })
      .getCount()

    return { totalCustomer, totalBlackList }
  }
}
