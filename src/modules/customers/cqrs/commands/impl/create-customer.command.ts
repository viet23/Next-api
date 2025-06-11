import { Customers } from '@models/customer.entity'
import { CreateCustomerDTO } from '@modules/customers/dto/create-customer.dto'
import { Command } from '@nestjs-architects/typed-cqrs'
import { Controller } from '@nestjs/common'

export class CreateCustomerCommand extends Command<Customers> {
  constructor(public readonly dto: CreateCustomerDTO) {
    super()
  }
}
