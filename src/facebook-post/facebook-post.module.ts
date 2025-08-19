import { Module } from '@nestjs/common';
import { FacebookPostController } from './facebook-post.controller';
import { FacebookPostService } from './facebook-post.service';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CqrsModule } from '@nestjs/cqrs';
import { FacebookPost } from '@models/facebook_post.entity';

@Module({
  imports: [HttpModule, TypeOrmModule.forFeature([FacebookPost]), CqrsModule],
  controllers: [FacebookPostController],
  providers: [FacebookPostService]
})
export class FacebookPostModule {}
