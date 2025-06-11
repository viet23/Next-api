import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import _ from 'lodash'
import { FindCaseQuery } from '../impl/find-case.query'
import { Case } from '@models/case.entity'
import { CaseHistory } from '@models/case-history.entity'
@QueryHandler(FindCaseQuery)
export class FindCaseQueryHandler implements IQueryHandler<FindCaseQuery> {
  constructor(
    @InjectRepository(Case) private readonly caseRepo: Repository<Case>,
    @InjectRepository(CaseHistory) private readonly caseHistoryRepo: Repository<CaseHistory>,
  ) {}
  async execute(q: FindCaseQuery): Promise<Case> {
    const { id } = q
    const caseData = await this.caseRepo
      .createQueryBuilder('case')
      .leftJoinAndSelect('case.customers', 'customers')
      .leftJoinAndSelect('case.assignedBy', 'assignedBy')
      .where('case.id=:id', { id: id })
      .getOne()
    caseData['history'] = await this.listHistory(id)
    return caseData
  }

  private async listHistory(id: string) {
    return await this.caseHistoryRepo
      .createQueryBuilder('h')
      .leftJoinAndMapOne('h.updateBy', 'tbl_users', 'updateBy', 'CAST(h.updatedById AS UUID) = updateBy.id')
      .where('h.ticketId = :ticketId', { ticketId: id })
      .orderBy('h.createdAt', 'DESC')
      .getMany()
  }
}
