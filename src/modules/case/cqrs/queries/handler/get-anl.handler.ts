import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import _ from 'lodash'
import { GetAnalysisFbQuery } from '../impl/get-anl.query'
import { AnalysisFb } from '@models/analysis-fb.entity'
import { User } from '@models/user.entity'

@QueryHandler(GetAnalysisFbQuery)
export class GetAnalysisFbQueryHandler implements IQueryHandler<GetAnalysisFbQuery> {
  constructor(
    @InjectRepository(AnalysisFb) private readonly analysisFbRepo: Repository<AnalysisFb>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}
  async execute(q: GetAnalysisFbQuery): Promise<AnalysisFb> {
    const { user } = q
    const userData = await this.userRepo.findOne({ where: { email: user.email } })
    return await this.analysisFbRepo.findOne({ userId: userData?.id.toString() })
  }
}
