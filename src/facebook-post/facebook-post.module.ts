import { Module } from '@nestjs/common';
import { FacebookPostController } from './facebook-post.controller';
import { FacebookPostService } from './facebook-post.service';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CqrsModule } from '@nestjs/cqrs';
import { FacebookPost } from '@models/facebook_post.entity';
import { User } from '@models/user.entity';

@Module({
  imports: [HttpModule, TypeOrmModule.forFeature([FacebookPost,User]), CqrsModule],
  controllers: [FacebookPostController],
  providers: [FacebookPostService],
  exports: [FacebookPostService],

})
export class FacebookPostModule {}
