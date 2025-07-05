import { Module } from '@nestjs/common'
import { EmailController } from './email.controller'
import { EmailService } from './email.service'
import { HttpModule } from '@nestjs/axios'
import { TypeOrmModule } from '@nestjs/typeorm'
import { FacebookAd } from '@models/facebook-ad.entity'
import { User } from '@models/user.entity'
import { CqrsModule } from '@nestjs/cqrs'

@Module({
  imports: [HttpModule, TypeOrmModule.forFeature([User, FacebookAd]), CqrsModule],
  controllers: [EmailController],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
