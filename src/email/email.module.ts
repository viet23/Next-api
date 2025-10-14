import { Module } from '@nestjs/common'
import { EmailController } from './email.controller'
import { EmailService } from './email.service'
import { HttpModule } from '@nestjs/axios'
import { TypeOrmModule } from '@nestjs/typeorm'
import { FacebookAd } from '@models/facebook-ad.entity'
import { User } from '@models/user.entity'
import { CqrsModule } from '@nestjs/cqrs'
import { CreditTransaction } from '@models/credit-ransaction .entity'
import { AdInsight } from '@models/ad-insight.entity'

@Module({
  imports: [HttpModule, TypeOrmModule.forFeature([User, FacebookAd, CreditTransaction, AdInsight]), CqrsModule],
  controllers: [EmailController],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
