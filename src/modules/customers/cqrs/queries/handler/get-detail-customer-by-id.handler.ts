import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { GetDetailCustomerByID } from '../impl/get-detail-customer-by-id.query'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { GtelpayCustomer } from '@models/gtelpay-customer.entity'

@QueryHandler(GetDetailCustomerByID)
export class GetDetailCustomerByIDQueryHandler implements IQueryHandler<GetDetailCustomerByID> {
  constructor(@InjectRepository(GtelpayCustomer) private readonly cusomerRepo: Repository<GtelpayCustomer>) {}
  async execute(query: GetDetailCustomerByID): Promise<Partial<GtelpayCustomer>> {
    const { id } = query
    const queryBuilder = await this.cusomerRepo.createQueryBuilder('c')
    queryBuilder.leftJoinAndSelect('c.blackLists', 'bl')
    return queryBuilder.where('c.id =:id', { id }).getOne()
  }
}
