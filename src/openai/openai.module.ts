import { Module } from '@nestjs/common';
import { OpenaiController } from './openai.controller';
import { OpenaiService } from './openai.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '@models/user.entity';
import { CqrsModule } from '@nestjs/cqrs';
import { FacebookModule } from 'src/facebook-ads/facebook-ads.module';

@Module({
  imports: [FacebookModule, TypeOrmModule.forFeature([User]), CqrsModule],
  controllers: [OpenaiController],
  providers: [OpenaiService]
})
export class OpenaiModule { }
