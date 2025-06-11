import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBody, ApiParam, ApiTags } from '@nestjs/swagger'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { CreateRoleCommand } from '../cqrs/commands/impl/create-role.command'
import { RoleDTO } from '../dto/role.dto'
import { Role } from '@models/role.entity'
import { GroupRoleDTO } from '../dto/group-role.dto'
import { CreateGroupRoleCommand } from '../cqrs/commands/impl/create-group-role.command'
import { GetRoleQuery } from '../cqrs/queries/impl/get-role.query'
import { GetGroupRoleQuery } from '../cqrs/queries/impl/get-group-role.query'
import { Group } from '@models/group.entity'
import { FindGroupRoleQuery } from '../cqrs/queries/impl/find-group-role.query'
import { JwtAuthGuard } from '@modules/auth/jwt-auth.guard'
import { Roles } from '@decorators/roles.decorator'
import { RolesGuard } from '@modules/auth/roles.guard'
import { RoleEnum } from '@common/enums/roles.enum'
import { CurrentUser } from '@decorators/current-user.decorator'
import { User } from '@models/user.entity'
import { GetRoleUserQuery } from '../cqrs/queries/impl/get-role-user.query'

@Controller('roles')
@ApiTags('roles')
// @UseGuards(JwtAuthGuard, RolesGuard)
export class RolesController {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
  ) {}

  @Get()
  // @Roles(RoleEnum.GET_ROLE)
  async listRole(): Promise<any> {
    return this.queryBus.execute(new GetRoleQuery())
  }

  @Get('user')
  // @Roles(RoleEnum.GET_ROLE)
  async listRoleUsers(@CurrentUser() user: User): Promise<any> {
    return this.queryBus.execute(new GetRoleUserQuery(user))
  }

  @Get('group')
  // @Roles(RoleEnum.GET_GROUP)
  async listGroup(@CurrentUser() user: User): Promise<any> {
    return this.queryBus.execute(new GetGroupRoleQuery(user?.id))
  }

  @Get('group/:id')
  // @Roles(RoleEnum.GET_GROUP_DETAIL)
  @ApiParam({ name: 'id' })
  async findById(@Param('id', ParseUUIDPipe) id: string): Promise<any> {
    return this.queryBus.execute(new FindGroupRoleQuery(id))
  }

  @Post()
  @Roles(RoleEnum.CREATE_ROLE)
  @ApiBody({ type: RoleDTO })
  async createRole(@Body() creates: RoleDTO): Promise<Partial<Role>> {
    return this.commandBus.execute(new CreateRoleCommand(creates))
  }

  @Post('group')
  @Roles(RoleEnum.CREATE_GROUP)
  @ApiBody({ type: GroupRoleDTO })
  async createGroupRole(@Body() creates: GroupRoleDTO): Promise<Partial<Group>> {
    return this.commandBus.execute(new CreateGroupRoleCommand(creates))
  }
}
