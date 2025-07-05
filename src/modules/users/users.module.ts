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
const CommandHandlers = [UpdateUserCommandHandler, UpdateUserGroupCommandHandler, CreateUserCommandHandler]
const QueriesHandler = [GetUsersQueryHandler, FindOneUserQueryHandler]

@Module({
  imports: [TypeOrmModule.forFeature([Role, Group, User]), CqrsModule],
  controllers: [UsersController],
  exports: [UsersService],
  providers: [...CommandHandlers, ...QueriesHandler, UsersService],
})
export class UsersModule {}
