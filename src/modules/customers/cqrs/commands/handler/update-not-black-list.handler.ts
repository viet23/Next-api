import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { UpdateNotBlackListCommand } from '../impl/update-not-black-list.command'
import { Repository, UpdateResult } from 'typeorm'
import { InjectRepository } from '@nestjs/typeorm'
import { Customers } from '@models/customer.entity'
import { IsSusPectEnum } from '@common/enums/suspect.enum'

@CommandHandler(UpdateNotBlackListCommand)
export class UpdateNotBlacklistCommandHandler implements ICommandHandler<UpdateNotBlackListCommand> {
  constructor(@InjectRepository(Customers) private readonly customerRepo: Repository<Customers>) {}
  async execute(command: UpdateNotBlackListCommand): Promise<UpdateResult> {
    const { id } = command
    return this.customerRepo.manager.transaction(async (ts) => {
      await ts.createQueryBuilder().relation(Customers, 'blackLists').of(id).remove([])
      return ts
        .createQueryBuilder()
        .update(Customers)
        .set({ isSuspect: IsSusPectEnum.IS_NOT_SUSPECT })
        .where('id=:id', { id })
        .execute()
    })
  }
}
