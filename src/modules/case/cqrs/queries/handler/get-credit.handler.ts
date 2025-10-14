import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import _ from 'lodash'

import { AnalysisFb } from '@models/analysis-fb.entity'
import { User } from '@models/user.entity'
import { GetCreditQuery } from '../impl/get-credit.query'
import { CreditTransaction } from '@models/credit-ransaction .entity'

@QueryHandler(GetCreditQuery)
export class GetCreditQueryHandler implements IQueryHandler<GetCreditQuery> {
  constructor(
    @InjectRepository(CreditTransaction) private readonly creditRepo: Repository<CreditTransaction>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}
  async execute(q: GetCreditQuery): Promise<CreditTransaction[]> {
    const { user } = q
    const userData = await this.userRepo.findOne({ where: { email: user.email } })
    return await this.creditRepo.find({
      where: { updatedById: userData?.id.toString() },
      order: { paymentDate: 'DESC' },
    })
  }
}
