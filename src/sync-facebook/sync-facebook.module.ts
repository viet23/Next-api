import { Module } from '@nestjs/common'
import { SyncFacebookController } from './sync-facebook.controller'
import { SyncFacebookService } from './sync-facebook.service'
import { TypeOrmModule } from '@nestjs/typeorm'
import { User } from '@models/user.entity'

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [SyncFacebookController],
  providers: [SyncFacebookService],
  exports: [SyncFacebookService],
})
export class SyncFacebookModule {}
