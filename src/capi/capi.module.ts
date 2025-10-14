import { Module } from '@nestjs/common'
import { CapiService } from './capi.service'
import { CapiController } from './capi.controller'
import { HttpModule } from '@nestjs/axios'
import { ConfigModule } from '@nestjs/config'

@Module({
  imports: [HttpModule, ConfigModule],
  controllers: [CapiController],
  providers: [CapiService],
  exports: [CapiService],
})
export class CapiModule {}
