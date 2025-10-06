import { JwtAuthGuard } from '@modules/auth/jwt-auth.guard'
import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common'
import { ApiBody, ApiParam, ApiTags } from '@nestjs/swagger'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { GetCaseQuery } from '../cqrs/queries/impl/get-case.query'
import { CreateCaseCommand } from '../cqrs/commands/impl/create-case.command'
import { Response } from 'express'
import { CaseDTO } from '../dto/case.dto'
import { UpdateCaseCommand } from '../cqrs/commands/impl/update-case.command'
import { DeleteCaseCommand } from '../cqrs/commands/impl/delete-case.command'
import { DeleteResult, UpdateResult } from 'typeorm'
import { CaseManyDto, GetCaseDto } from '../dto/filter-case.dto'
import { RoleEnum } from '@common/enums/roles.enum'
import { Roles } from '@decorators/roles.decorator'
import { FindCaseQuery } from '../cqrs/queries/impl/find-case.query'
import { Case } from '@models/case.entity'
import { FilterCustomerCaseDto } from '../dto/filter-customer.dto'
import { FindManyDto } from '@common/dto/filter.dto'
import { GetCustomerCasesQuery } from '../cqrs/queries/impl/get-customers.query'
import { GetUserCasesQuery } from '../cqrs/queries/impl/get-users.query'
import { ExportCasesQuery } from '../cqrs/queries/impl/export-case.query'
import { ExportDto } from '@common/dto/export.dto'
import { DetailCaseQuery } from '../cqrs/queries/impl/detail-case.query'
import { Authen } from '@decorators/authen.decorator'
import { User } from '@models/user.entity'
import { ReportCaseQuery } from '../cqrs/queries/impl/report-case.query'
import { FilterReportCaseDto } from '../dto/filter-report.dto'
import { ExportReportCasesQuery } from '../cqrs/queries/impl/export-report-case.query'
import { ReceptionReportCaseQuery } from '../cqrs/queries/impl/reception-report-case.query'
import { ExportReportReceptionCasesQuery } from '../cqrs/queries/impl/export-reception-report-case.query'

import { CreateAnalysisFbCommand } from '../cqrs/commands/impl/create-anl.command'
import { GetAnalysisFbQuery } from '../cqrs/queries/impl/get-anl.query'
import { CreateAnalysisFbDto } from '../dto/case-analysis.dto'
import { CaseStatusEnum } from '@common/enums/case.enum'
import { GetFacebookAdsQuery } from '../cqrs/queries/impl/get-facebook-ads.query'
import { GetCreditQuery } from '../cqrs/queries/impl/get-credit.query'
import { CreditDoneQuery } from '../cqrs/queries/impl/credit-done.query'
import { FindAdsQuery } from '../cqrs/queries/impl/find-ads.query'
import { GetFacebookAdsHistoryQuery } from '../cqrs/queries/impl/get-facebook-ads-detatil.query'

@Controller('case')
@ApiTags('case')
export class CaseController {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
  ) { }

  @Get()
  @UseGuards(JwtAuthGuard)
  // @Roles(RoleEnum.GET_CASE)
  async find(@Query() query: CaseManyDto, @Authen() user: User): Promise<any> {
    const { filter } = query
    return this.queryBus.execute(new GetCaseQuery(filter, user))
  }

  @Get('all')
  @UseGuards(JwtAuthGuard)
  async findAlll(@Query() query: CaseManyDto, @Authen() user: User): Promise<any> {
    if (!query.filter) {
      query.filter = {
        where: {},
        page: 1,
        pageSize: 10,
        filter: {},
      };
    }
    query.filter.where = query.filter.where || {};
    query.filter.where.status = CaseStatusEnum.PENDING;

    return this.queryBus.execute(new GetCaseQuery(query.filter, user));
  }


  @Get('analysis')
  @UseGuards(JwtAuthGuard)
  // @Roles(RoleEnum.GET_CASE)
  async findAnalysis(@Authen() user: User): Promise<any> {
    console.log(`user-----------`, user)

    return this.queryBus.execute(new GetAnalysisFbQuery(user))
  }

  @Get('ads/:id')
  // @UseGuards(JwtAuthGuard)
  @ApiParam({ name: 'id' })
  async findByIdanAlysis(@Param('id') id: string): Promise<Case> {
    return this.queryBus.execute(new FindAdsQuery(id))
  }

  @Get('credit')
  @UseGuards(JwtAuthGuard)
  // @Roles(RoleEnum.GET_CASE)
  async findCredit(@Authen() user: User): Promise<any> {
    console.log(`user-----------`, user)
    return this.queryBus.execute(new GetCreditQuery(user))
  }

  @Get('facebookads')
  @UseGuards(JwtAuthGuard)
  // @Roles(RoleEnum.GET_CASE)
  async facebookAds(@Query() query: CaseManyDto, @Authen() user: User): Promise<any> {
    console.log(`user-----------`, user)

    return this.queryBus.execute(new GetFacebookAdsQuery(query.filter, user))
  }

  @Get('facebookads/:id')
  @UseGuards(JwtAuthGuard)
  async findOneHistory(@Param('id') id: string): Promise<any> {
    return this.queryBus.execute(new GetFacebookAdsHistoryQuery(id))
  }

  @Post('detail')
  @Roles(RoleEnum.GET_CASE)
  async findDetail(@Body() body: { phone: string; otp: string }): Promise<any> {
    const { phone, otp } = body
    return this.queryBus.execute(new DetailCaseQuery(phone, otp))
  }

  @Get('report')
  @UseGuards(JwtAuthGuard)
  @Roles(RoleEnum.REPORT_CASE)
  async findReport(@Query() query: FindManyDto<FilterReportCaseDto>): Promise<any> {
    const { filter } = query
    return this.queryBus.execute(new ReportCaseQuery(filter))
  }

  @Get('report/export')
  @UseGuards(JwtAuthGuard)
  @Roles(RoleEnum.REPORT_EXPORT_CASE)
  @Header('Content-disposition', 'attachment; filename=report-ticket.xlsx')
  async reportExport(@Query() query: FindManyDto<FilterReportCaseDto>, @Res() response: Response): Promise<any> {
    const { filter } = query
    return this.queryBus.execute(new ExportReportCasesQuery(filter, response))
  }

  @Get('reception-report')
  @UseGuards(JwtAuthGuard)
  @Roles(RoleEnum.REPORT_CASE)
  async findReceptionReport(@Query() query: FindManyDto<FilterReportCaseDto>): Promise<any> {
    const { filter } = query
    return this.queryBus.execute(new ReceptionReportCaseQuery(filter))
  }

  @Get('reception-report/export')
  @UseGuards(JwtAuthGuard)
  @Roles(RoleEnum.REPORT_EXPORT_CASE)
  @Header('Content-disposition', 'attachment; filename=report-reception-ticket.xlsx')
  async receptionReportExport(
    @Query() query: FindManyDto<FilterReportCaseDto>,
    @Res() response: Response,
  ): Promise<any> {
    const { filter } = query
    return this.queryBus.execute(new ExportReportReceptionCasesQuery(filter, response))
  }

  @Get('export')
  @UseGuards(JwtAuthGuard)
  @Roles(RoleEnum.GET_CASE)
  @Header('Content-disposition', 'attachment; filename=tickets.xlsx')
  async findExport(@Query() query: ExportDto<GetCaseDto>, @Res() response: Response): Promise<any> {
    const { filter } = query
    return this.queryBus.execute(new ExportCasesQuery(filter, response))
  }

  @Get('customers')
  @UseGuards(JwtAuthGuard)
  @Roles(RoleEnum.CREATE_CASE)
  async findCustumer(@Query() query: FindManyDto<FilterCustomerCaseDto>): Promise<any> {
    const { filter } = query
    return this.queryBus.execute(new GetCustomerCasesQuery(filter))
  }

  @Get('users')
  @UseGuards(JwtAuthGuard)
  @Roles(RoleEnum.CREATE_CASE)
  async findUsers(@Query() query: FindManyDto<FilterCustomerCaseDto>): Promise<any> {
    const { filter } = query
    return this.queryBus.execute(new GetUserCasesQuery(filter))
  }

  @Get(':id')
  // @UseGuards(JwtAuthGuard)
  @ApiParam({ name: 'id' })
  async findById(@Param('id', ParseUUIDPipe) id: string): Promise<Case> {
    return this.queryBus.execute(new FindCaseQuery(id))
  }

  @Get('credit/:id')
  // @UseGuards(JwtAuthGuard)
  @ApiParam({ name: 'id' })
  async creditDone(@Param('id', ParseUUIDPipe) id: string): Promise<Case> {
    return this.queryBus.execute(new CreditDoneQuery(id))
  }


  @Post()
  @UseGuards(JwtAuthGuard)
  // @Roles(RoleEnum.CREATE_CASE)
  @ApiBody({ type: CaseDTO })
  async creates(@Body() creates: CaseDTO, @Authen() user: User): Promise<any> {
    return this.commandBus.execute(new CreateCaseCommand(creates, user))
  }

  @Post('analysis')
  @UseGuards(JwtAuthGuard)
  // @Roles(RoleEnum.CREATE_CASE)
  @ApiBody({ type: CreateAnalysisFbDto })
  async createsAnalysis(@Body() creates: CreateAnalysisFbDto, @Authen() user: User): Promise<any> {
    console.log(`user`, user)

    return this.commandBus.execute(new CreateAnalysisFbCommand(creates, user))
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @Roles(RoleEnum.UPDATE_CASE)
  @ApiParam({ name: 'id' })
  async updateflag(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CaseDTO,
    @Authen() user: User,
  ): Promise<Partial<UpdateResult>> {
    return this.commandBus.execute(new UpdateCaseCommand(id, dto, user))
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiParam({ name: 'id' })
  @Roles(RoleEnum.DELETE_CASE)
  async deleteflag(@Param('id', ParseUUIDPipe) id: string): Promise<Partial<DeleteResult>> {
    return this.commandBus.execute(new DeleteCaseCommand(id))
  }
}
