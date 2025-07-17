import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common'
import { ApiBody, ApiParam, ApiTags } from '@nestjs/swagger'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { GetUsersQuery } from '../cqrs/queries/impl/get-users.query'
import { JwtAuthGuard } from '@modules/auth/jwt-auth.guard'
import { Roles } from '@decorators/roles.decorator'
import { RolesGuard } from '@modules/auth/roles.guard'
import { RoleEnum } from '@common/enums/roles.enum'
import { FindManyDto } from '@common/dto/filter.dto'
import { FilterUsersDto } from '../dto/filter-users.dto'
import { UpdateUserCommand } from '../cqrs/commands/impl/update-user.command'
import { UserUpdateDTO } from '../dto/user-update.dto'
import { FindOneUserQuery } from '../cqrs/queries/impl/find-one-user.query'
import { User } from '@models/user.entity'
import { UpdateUserGroupDto } from '../dto/update-user-group.dto'
import { UpdateUserGroupCommand } from '../cqrs/commands/impl/update-user-group.command'
import { UserCreateDTO } from '../dto/user-create.dto'
import { CreateUserCommand } from '../cqrs/commands/impl/create-user.command'

@Controller('users')
@ApiTags('users')
// @UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
  ) {}

  @Get()
  // @Roles(RoleEnum.GET_USERS)
  async listUser(@Query() query: FindManyDto<FilterUsersDto>): Promise<any> {
    const { filter } = query
    return this.queryBus.execute(new GetUsersQuery(filter))
  }

  @Get(':id')
  // @Roles(RoleEnum.GET_USERS)
  async findOne(@Param('id') id: string): Promise<User> {
    return this.queryBus.execute(new FindOneUserQuery(id))
  }

  @Post('register')
  async register(@Body() createUserDto: UserCreateDTO) {
    return this.commandBus.execute(new CreateUserCommand(createUserDto))
  }

  @Put('groups/:id')
  // @Roles(RoleEnum.PUT_USERS)
  @ApiParam({ name: 'id' })
  async updateGroup(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserGroupDto): Promise<Partial<any>> {
    return this.commandBus.execute(new UpdateUserGroupCommand(dto, id))
  }

  @Put(':id')
  @Roles(RoleEnum.PUT_USERS)
  @ApiParam({ name: 'id' })
  async updateflag(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UserUpdateDTO): Promise<Partial<any>> {
    return this.commandBus.execute(new UpdateUserCommand(id, dto))
  }
}
