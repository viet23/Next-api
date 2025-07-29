import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { GetCaseQueryHandler } from './cqrs/queries/handler/get-case.handler'
import { CqrsModule } from '@nestjs/cqrs'
import { CreateCaseCommandHandler } from './cqrs/commands/handler/create-case.handler'
import { UpdateCaseCommandHandler } from './cqrs/commands/handler/update-case.handler'
import { DeleteCaseCommandHandler } from './cqrs/commands/handler/delete-case.handler'
import { FindCaseQueryHandler } from './cqrs/queries/handler/find-case.handler'
import { CaseController } from './controllers/case.controller'
import { Case } from '@models/case.entity'
import { GetCustomerCasesQueryHandler } from './cqrs/queries/handler/get-customers.handler'
import { GtelpayCustomer } from '@models/gtelpay-customer.entity'
import { GetUserCasesQueryHandler } from './cqrs/queries/handler/get-users.handler'
import { User } from '@models/user.entity'
import { ExportCasesQueryHandler } from './cqrs/queries/handler/export-case.handler'
import { DetailCaseQueryHandler } from './cqrs/queries/handler/detail-case.handler'
import { ReportCaseQueryHandler } from './cqrs/queries/handler/report-case.handler'
import { ExportReportCasesQueryHandler } from './cqrs/queries/handler/export-report-case.handler'
import { ReceptionReportCaseQueryHandler } from './cqrs/queries/handler/reception-report-case.handler'
import { ExportReportReceptionCasesQueryHandler } from './cqrs/queries/handler/export-reception-report-case.handler'
import { CreateAnalysisFbCommandHandler } from './cqrs/commands/handler/create-anl.handler'
import { AnalysisFb } from '@models/analysis-fb.entity'
import { GetAnalysisFbQueryHandler } from './cqrs/queries/handler/get-anl.handler'
import { GetFacebookAdsQueryHandler } from './cqrs/queries/handler/get-facebook-ads.handler'
import { FacebookAd } from '@models/facebook-ad.entity'
const CommandHandlers = [
  CreateCaseCommandHandler,
  UpdateCaseCommandHandler,
  DeleteCaseCommandHandler,
  CreateAnalysisFbCommandHandler,
]

const QueriesHandler = [
  GetCaseQueryHandler,
  ReportCaseQueryHandler,
  FindCaseQueryHandler,
  GetCustomerCasesQueryHandler,
  GetUserCasesQueryHandler,
  ExportCasesQueryHandler,
  DetailCaseQueryHandler,
  ExportReportCasesQueryHandler,
  ReceptionReportCaseQueryHandler,
  ExportReportReceptionCasesQueryHandler,
  GetAnalysisFbQueryHandler,
  GetFacebookAdsQueryHandler
]

@Module({
  imports: [TypeOrmModule.forFeature([Case, GtelpayCustomer, User, AnalysisFb,FacebookAd]), CqrsModule],
  controllers: [CaseController],
  exports: [],
  providers: [...QueriesHandler, ...CommandHandlers],
})
export class CaseModule {}
