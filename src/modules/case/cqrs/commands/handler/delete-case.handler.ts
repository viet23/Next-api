import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { Repository } from 'typeorm'
import { InjectRepository } from '@nestjs/typeorm'
import { DeleteCaseCommand } from '../impl/delete-case.command'
import { Case } from '@models/case.entity'
import { BadRequestException } from '@nestjs/common'

@CommandHandler(DeleteCaseCommand)
export class DeleteCaseCommandHandler implements ICommandHandler<DeleteCaseCommand> {
  constructor(@InjectRepository(Case) private readonly caseRepo: Repository<Case>) {}
  async execute(command: DeleteCaseCommand): Promise<any> {
    const { id } = command
    let caseDelete = await this.caseRepo.findOne(id)
    if (!caseDelete) {
      throw new BadRequestException('Case find not found')
    }

    return this.caseRepo.remove(caseDelete)
  }
}
