import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { CqrsModule } from '@nestjs/cqrs'
import { UsersController } from './controllers/users.controller'
import { Role } from '@models/role.entity'
import { Group } from '@models/group.entity'
import { GetUsersQueryHandler } from './cqrs/queries/handler/get-users.handler'
import { User } from '@models/user.entity'
import { UpdateUserCommandHandler } from './cqrs/commands/handler/update-user.handler'
import { FindOneUserQueryHandler } from './cqrs/queries/handler/find-one-user.handler'
import { UpdateUserGroupCommandHandler } from './cqrs/commands/handler/update-user-group.handler'
import { CreateUserCommandHandler } from './cqrs/commands/handler/create-user.handler'
import { UsersService } from './users.service'
import { EmailModule } from 'src/email/email.module'
import { CreditTransaction } from '@models/credit-ransaction .entity'
import { SubscriptionPlan } from '@models/subscription-plan.entity'
import { UserSubscription } from '@models/user-subscription.entity'
const CommandHandlers = [UpdateUserCommandHandler, UpdateUserGroupCommandHandler, CreateUserCommandHandler]
const QueriesHandler = [GetUsersQueryHandler, FindOneUserQueryHandler]

@Module({
  imports: [
    TypeOrmModule.forFeature([Role, Group, User, CreditTransaction, SubscriptionPlan, UserSubscription]),
    CqrsModule,
    EmailModule,
  ],
  controllers: [UsersController],
  exports: [UsersService],
  providers: [...CommandHandlers, ...QueriesHandler, UsersService],
})
export class UsersModule {}
