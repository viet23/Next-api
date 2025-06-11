import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { CreateCustomerCommand } from '../impl/create-customer.command'
import { InjectRepository } from '@nestjs/typeorm'
import { Customers } from '@models/customer.entity'
import { Repository } from 'typeorm'

@CommandHandler(CreateCustomerCommand)
export class CreateCusstomerCommandHandler implements ICommandHandler<CreateCustomerCommand> {
  constructor(@InjectRepository(Customers) private readonly customerRepo: Repository<Customers>) {}
  async execute(command: CreateCustomerCommand): Promise<Customers> {
    const { dto } = command
    const entity = new Customers()
    entity.email = dto.email
    entity.phone = dto.phone
    entity.fullName = dto.fullName
    entity.gender = dto.gender
    entity.dateOfBirth = dto.dateOfBirth
    entity.kycDate = dto.kycDate
    entity.registerDate = dto.registerDate
    return this.customerRepo.save(entity)
  }
}
