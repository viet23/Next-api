import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { Repository } from 'typeorm'
import { InjectRepository } from '@nestjs/typeorm'
import { CreateCaseCommand } from '../impl/create-case.command'
import { Case } from '@models/case.entity'
import { User } from '@models/user.entity'
import { GtelpayCustomer } from '@models/gtelpay-customer.entity'
import { getStatusEnum } from 'src/utils/getstatus'
import { generateOtp } from 'src/utils/generate-otp'

@CommandHandler(CreateCaseCommand)
export class CreateCaseCommandHandler implements ICommandHandler<CreateCaseCommand> {
  constructor(
    @InjectRepository(Case) private readonly caseRepo: Repository<Case>,
    @InjectRepository(GtelpayCustomer) private readonly customerGtelRepo: Repository<GtelpayCustomer>,
  ) { }

  async execute(command: CreateCaseCommand): Promise<Case> {
    const { dto, user } = command

    const caseNew = new Case()
    caseNew.urlVideo = dto.urlVideo
    caseNew.caption = dto.caption
    const caseData = await this.caseRepo.save(caseNew)

    return caseData
  }
}
