import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import _ from 'lodash'
import { FindCaseQuery } from '../impl/find-case.query'
import { Case } from '@models/case.entity'
@QueryHandler(FindCaseQuery)
export class FindCaseQueryHandler implements IQueryHandler<FindCaseQuery> {
  constructor(
    @InjectRepository(Case) private readonly caseRepo: Repository<Case>,
  ) {}
  async execute(q: FindCaseQuery): Promise<Case> {
    const { id } = q
    const caseData = await this.caseRepo
      .createQueryBuilder('case')
      .leftJoinAndSelect('case.customers', 'customers')
      .leftJoinAndSelect('case.assignedBy', 'assignedBy')
      .where('case.id=:id', { id: id })
      .getOne()
    return caseData
  }


}
