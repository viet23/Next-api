import { UpdateNotBlackListCommand } from '../cqrs/commands/impl/update-not-black-list.command'
import { UpdateResult } from 'typeorm'
import { Body, Controller, Get, Header, Param, Post, Put, Query, Res, UseGuards } from '@nestjs/common'
import { CreateCustomerDTO } from '../dto/create-customer.dto'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { CreateCustomerCommand } from '../cqrs/commands/impl/create-customer.command'
import { ApiTags } from '@nestjs/swagger'
import { FindManyDto } from '@common/dto/filter.dto'
import { FilterCustomerDto } from '../dto/filter-customer.dto'
import { GetCustomersQuery } from '../cqrs/queries/impl/get-customers.query'
import { GetDetailCustomerByID } from '../cqrs/queries/impl/get-detail-customer-by-id.query'
import { Customers } from '@models/customer.entity'
import { DailyCheckingBlacklistCommand } from '../cqrs/commands/impl/daily-checking-blacklist.command'
import { ExportCustomersQuery } from '../cqrs/queries/impl/export-customers.query'
import { Response, response } from 'express'
import { ExportDto } from '@common/dto/export.dto'
import { SummaryCustomersQuery } from '../cqrs/queries/impl/summary-customers.query'
import { JwtAuthGuard } from '@modules/auth/jwt-auth.guard'

@Controller('customers')
@ApiTags('customers')
@UseGuards(JwtAuthGuard)
export class CustomersController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post()
  async create(@Body() dto: CreateCustomerDTO) {
    return this.commandBus.execute(new CreateCustomerCommand(dto))
  }
  @Get()
  async filter(@Query() query: FindManyDto<FilterCustomerDto>) {
    const { filter } = query
    return this.queryBus.execute(new GetCustomersQuery(filter))
  }

  @Get('export')
  @Header('Content-disposition', 'attachment; filename=customers.xlsx')
  async export(@Query() query: ExportDto<FilterCustomerDto>, @Res() response: Response) {
    const { filter } = query
    return this.queryBus.execute(new ExportCustomersQuery(filter, response))
  }

  @Get('checking')
  async checking() {
    return this.commandBus.execute(new DailyCheckingBlacklistCommand())
  }

  @Get('summary')
  async summary() {
    return this.commandBus.execute(new SummaryCustomersQuery())
  }

  @Put('update-not-black-list/:id')
  async updateNotBlacklist(@Param('id') id: string): Promise<UpdateResult> {
    return this.commandBus.execute(new UpdateNotBlackListCommand(id))
  }

  @Get(':id')
  async findOneById(@Param('id') id: string): Promise<Partial<Customers>> {
    return this.queryBus.execute(new GetDetailCustomerByID(id))
  }
}
