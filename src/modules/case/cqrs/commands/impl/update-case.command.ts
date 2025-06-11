import { User } from '@models/user.entity'
import { CaseDTO } from '@modules/case/dto/case.dto'
import { Command } from '@nestjs-architects/typed-cqrs'
import { UpdateResult } from 'typeorm'

export class UpdateCaseCommand extends Command<UpdateResult> {
  constructor(
    public readonly id: string,
    public readonly dto: CaseDTO,
    public readonly user: User,
  ) {
    super()
  }
}
