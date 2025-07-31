import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { Repository } from 'typeorm'
import { InjectRepository } from '@nestjs/typeorm'
import { CreateCaseCommand } from '../impl/create-case.command'
import { Case } from '@models/case.entity'
import { User } from '@models/user.entity'
import { GtelpayCustomer } from '@models/gtelpay-customer.entity'
import { ActionType } from '@common/enums/case.enum'

@CommandHandler(CreateCaseCommand)
export class CreateCaseCommandHandler implements ICommandHandler<CreateCaseCommand> {
  constructor(
    @InjectRepository(Case) private readonly caseRepo: Repository<Case>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) { }

  async execute(command: CreateCaseCommand): Promise<Case> {
    const { dto, user } = command

    const userData = await this.userRepo
      .createQueryBuilder('user')
      .where('user.email=:email', { email: user?.email })
      .getOne()

    const caseNew = new Case()
    caseNew.urlVideo = dto.urlVideo
    caseNew.caption = dto.caption
    caseNew.taskId = dto.taskId
    caseNew.action = dto.action
    caseNew.updatedById = userData?.id.toString()
    const caseData = await this.caseRepo.save(caseNew)

    console.log(`caseData--------`, caseData);
    

    if (dto.action == ActionType.GENERATE_IMAGE) {
      
      userData.credits = userData.credits - 8
     console.log(`userData----------`, userData);
      await this.userRepo.save(userData)
    }

    if (dto.action == ActionType.GENERATE_VIDEO) {
      userData.credits = userData.credits - 50

      console.log(`userData---------`, userData);
      await this.userRepo.save(userData)
    }


    return caseData
  }
}
