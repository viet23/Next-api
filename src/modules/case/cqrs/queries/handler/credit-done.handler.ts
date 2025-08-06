import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import _ from 'lodash'
import { FindCaseQuery } from '../impl/find-case.query'
import { Case } from '@models/case.entity'
import { CreditDoneQuery } from '../impl/credit-done.query'
import { CreditTransaction, CreditTransactionStatus } from '@models/credit-ransaction .entity'
import { User } from '@models/user.entity'
@QueryHandler(CreditDoneQuery)
export class CreditDoneQueryHandler implements IQueryHandler<CreditDoneQuery> {
  constructor(@InjectRepository(CreditTransaction) private readonly creditRepo: Repository<CreditTransaction>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,) { }
  async execute(q: CreditDoneQuery): Promise<CreditTransaction> {
    const { id } = q
    const credit = await this.creditRepo.createQueryBuilder('credit').where('credit.id=:id', { id: id }).getOne()
    credit.status = CreditTransactionStatus.DONE
    const user = await this.userRepo.findOne({ where: { id: credit.updatedById } })

    user.credits = user.credits + credit.creditsPurchased

    await this.userRepo.save(user)

    return await this.creditRepo.save(credit)
  }
}
