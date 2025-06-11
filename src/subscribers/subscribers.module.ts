import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
// import { Tracking } from 'src/models/tracking.entity';
// import { SocketGateway } from 'src/modules/socket/socket.gateway';
// import { TrackingSubscriber } from './tracking.subscriber';

@Module({
  imports: [],
  providers: [],
  // providers: [TraUckingSubscriber, SocketGateway],
})
export class SubscribersModule {}
