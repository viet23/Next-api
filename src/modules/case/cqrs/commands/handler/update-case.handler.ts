import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { Repository } from 'typeorm'
import { InjectRepository } from '@nestjs/typeorm'
import { UpdateCaseCommand } from '../impl/update-case.command'
import { Case } from '@models/case.entity'
import { BadRequestException } from '@nestjs/common'
import { getStatusEnum } from 'src/utils/getstatus'
import { GtelpayCustomer } from '@models/gtelpay-customer.entity'
import { User } from '@models/user.entity'

@CommandHandler(UpdateCaseCommand)
export class UpdateCaseCommandHandler implements ICommandHandler<UpdateCaseCommand> {
  constructor(
    @InjectRepository(Case) private readonly caseRepo: Repository<Case>,
    @InjectRepository(GtelpayCustomer) private readonly customerGtelRepo: Repository<GtelpayCustomer>,
  ) {}
  async execute(command: UpdateCaseCommand): Promise<Case> {
    const { id, dto, user } = command
    let caseData = await this.caseRepo.findOne(id)
    if (!caseData) {
      throw new BadRequestException('Case find not found')
    }

    caseData.urlVideo = dto.urlVideo
    caseData.caption = dto.caption
    caseData.updatedById = user?.id.toString()
    return this.caseRepo.save(caseData)
  }
}
