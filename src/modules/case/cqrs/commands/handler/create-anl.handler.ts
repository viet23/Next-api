import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { Repository } from 'typeorm'
import { InjectRepository } from '@nestjs/typeorm'
import { CreateAnalysisFbCommand } from '../impl/create-anl.command'
import { AnalysisFb } from '@models/analysis-fb.entity'
import { User } from '@models/user.entity'

@CommandHandler(CreateAnalysisFbCommand)
export class CreateAnalysisFbCommandHandler implements ICommandHandler<CreateAnalysisFbCommand> {
  constructor(
    @InjectRepository(AnalysisFb) private readonly analysisFbRepo: Repository<AnalysisFb>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  async execute(command: CreateAnalysisFbCommand): Promise<AnalysisFb> {
    const { dto, user } = command
    console.log(`user`, user)

    const userData = await this.userRepo.findOne({ where: { email: user.email } })

    console.log(`userData`, userData)

    let analysisFb = await this.analysisFbRepo.findOne({ userId: userData?.id.toString() })
    if (!analysisFb) {
      analysisFb = new AnalysisFb()
    }

    analysisFb.urlPage = dto.urlPage
    analysisFb.userId = userData.id.toString()
    analysisFb.analysis = dto.analysis
    analysisFb.channelPlan = dto.channelPlan
    analysisFb.targeting = dto.targeting
    analysisFb.styleImage = dto.styleImage
    return await this.analysisFbRepo.save(analysisFb)
  }
}
