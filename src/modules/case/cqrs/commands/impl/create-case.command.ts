import { User } from '@models/user.entity'
import { CaseDTO } from '@modules/case/dto/case.dto'
import { Command } from '@nestjs-architects/typed-cqrs'

export class CreateCaseCommand extends Command<CaseDTO> {
  constructor(
    public readonly dto: CaseDTO,
    public readonly user: User,
  ) {
    super()
  }
}
