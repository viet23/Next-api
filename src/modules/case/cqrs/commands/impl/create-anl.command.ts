
import { User } from '@models/user.entity'
import { CreateAnalysisFbDto } from '@modules/case/dto/case-analysis.dto'
import { Command } from '@nestjs-architects/typed-cqrs'

export class CreateAnalysisFbCommand extends Command<CreateAnalysisFbDto> {
  constructor(public readonly dto: CreateAnalysisFbDto , public readonly user: User) {
    super()
  }
}
