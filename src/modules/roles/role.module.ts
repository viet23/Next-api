import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { CqrsModule } from '@nestjs/cqrs'
import { RolesController } from './controllers/role.controller'
import { Role } from '@models/role.entity'
import { Group } from '@models/group.entity'
import { CreateGroupRoleCommandHandler } from './cqrs/commands/handler/create-group-role.handler'
import { GetRoleQueryHandler } from './cqrs/queries/handler/get-role.handler'
import { GetGroupRoleQueryHandler } from './cqrs/queries/handler/get-group-role.handler'
import { FindBlackListQueryHandler } from './cqrs/queries/handler/find-group-role.handler'
import { CreateRoleCommandHandler } from './cqrs/commands/handler/create-role.handler'
import { GetRoleUserQueryHandler } from './cqrs/queries/handler/get-role-user.handler'
import { User } from '@models/user.entity'
const CommandHandlers = [CreateRoleCommandHandler, CreateGroupRoleCommandHandler]
const QueriesHandler = [
  GetRoleQueryHandler,
  GetGroupRoleQueryHandler,
  FindBlackListQueryHandler,
  GetRoleUserQueryHandler,
]

@Module({
  imports: [TypeOrmModule.forFeature([Role, Group, User]), CqrsModule],
  controllers: [RolesController],
  exports: [],
  providers: [...CommandHandlers, ...QueriesHandler],
})
export class RolesModule {}
