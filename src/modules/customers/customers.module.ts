import { Module } from '@nestjs/common'
import { CustomersController } from './controller/customers.controller'
import { CreateCusstomerCommandHandler } from './cqrs/commands/handler/create-customer.handler'
import { CqrsModule } from '@nestjs/cqrs'
import { Customers } from '@models/customer.entity'
import { TypeOrmModule } from '@nestjs/typeorm'
import { GetCustomersQueryHandler } from './cqrs/queries/handler/get-customers.handler'
import { GetDetailCustomerByIDQueryHandler } from './cqrs/queries/handler/get-detail-customer-by-id.handler'
import { UpdateNotBlacklistCommandHandler } from './cqrs/commands/handler/update-not-black-list.handler'
import { GtelpayCustomer } from '@models/gtelpay-customer.entity'
import { ExportCustomersQueryHandler } from './cqrs/queries/handler/export-customers.handler'
import { SummaryCustomersQueryHandler } from './cqrs/queries/handler/summary-customers.hander'

const CommandHandlers = [CreateCusstomerCommandHandler, UpdateNotBlacklistCommandHandler]
const QueriesHandler = [
  GetCustomersQueryHandler,
  GetDetailCustomerByIDQueryHandler,
  ExportCustomersQueryHandler,
  SummaryCustomersQueryHandler,
]
@Module({
  imports: [TypeOrmModule.forFeature([Customers, GtelpayCustomer], 'default'), CqrsModule],
  controllers: [CustomersController],
  providers: [...CommandHandlers, ...QueriesHandler],
})
export class CustomersModule {}
