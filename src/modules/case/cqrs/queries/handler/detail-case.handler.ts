import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import _ from 'lodash'
import { Case } from '@models/case.entity'
import { DetailCaseQuery } from '../impl/detail-case.query'
@QueryHandler(DetailCaseQuery)
export class DetailCaseQueryHandler implements IQueryHandler<DetailCaseQuery> {
  constructor(@InjectRepository(Case) private readonly caseRepo: Repository<Case>) {}
  async execute(q: DetailCaseQuery): Promise<Case[]> {
    const { phone, otp } = q
    return this.caseRepo
      .createQueryBuilder('case')
      .leftJoinAndSelect('case.customers', 'customers')
      .leftJoinAndSelect('case.assignedBy', 'assignedBy')
      .where('case.contactInfo=:contactInfo', { contactInfo: phone })
      .andWhere('case.otp=:otp', { otp: otp })
      .getMany()
  }
}
