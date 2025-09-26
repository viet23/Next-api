import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common'
import { ApiBody, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger'
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
import { UsersService } from '../users.service'
import { ForgotPasswordDto } from '../dto/forgot-password.dto'
import { v4 as uuidv4 } from 'uuid';
import * as bcrypt from 'bcrypt';
import { ResetPasswordDto } from '../dto/reset-password.dto'
import { EmailService } from 'src/email/email.service'
import { createHmac } from "crypto";
import { UserDataSyncDto } from '../dto/user-data-sync.dto'
import { Authen } from '@decorators/authen.decorator'
import { BuyPlanDto } from '../dto/buy-plan.dto'
import { ConfirmPaymentDto } from '../dto/confirm-payment.dto'

class CheckTokenDto {
  token: string;
}

@Controller('users')
@ApiTags('users')
// @UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
    private readonly usersService: UsersService,
    private readonly mailerService: EmailService,
  ) { }

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
      console.log(`dto111111111111id`, id);
    console.log(`dto111111111111`, dto);
    
    return this.commandBus.execute(new UpdateUserGroupCommand(dto, id))
  }

  @Put(':id')
  @Roles(RoleEnum.PUT_USERS)
  @ApiParam({ name: 'id' })
  async updateflag(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UserUpdateDTO): Promise<Partial<any>> {
    return this.commandBus.execute(new UpdateUserCommand(id, dto))
  }

  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      return { message: 'Nếu email tồn tại, hệ thống sẽ gửi hướng dẫn' };
    }

    const token = uuidv4();
    await this.usersService.saveResetToken(user.id.toString(), token);

    const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
    await this.mailerService.sendMailPassword({
      to: dto.email,
      subject: 'Khôi phục mật khẩu',
      html: `<p>Bạn đã yêu cầu đặt lại mật khẩu.</p>
             <p>Nhấn vào liên kết dưới đây để tạo mật khẩu mới:</p>
             <a href="${resetLink}">${resetLink}</a>`,
    });

    return { message: 'Nếu email tồn tại, hệ thống sẽ gửi hướng dẫn' };
  }

  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    const user = await this.usersService.findByResetToken(dto.token);
    if (!user) throw new BadRequestException('Token không hợp lệ hoặc đã hết hạn');
    console.log(`user`, user);

    const rawPassword = dto.newPassword;
    // const hashedPassword = createHmac("sha256", rawPassword).digest("hex");
    await this.usersService.updatePassword(user.id.toString(), rawPassword);
    await this.usersService.clearResetToken(user.id.toString());

    return { message: 'Mật khẩu đã được cập nhật' };
  }

  @Post('update-token')
  @UseGuards(JwtAuthGuard)
  async updateToken(@Body() dto: UserDataSyncDto, @Authen() user: User) {
    return await this.usersService.updateToken(user, dto);

  }

  @Post('check-reset-token')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Kiểm tra token reset password còn sống không' })
  async checkResetToken(@Authen() user: User) {
    return { message: 'Token còn sống', email: user.email };
  }

  @Post('buy-plan')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Mua gói dịch vụ (chưa xác nhận thanh toán)' })
  async buyPlan(@Authen() user: User, @Body() dto: BuyPlanDto) {
    return this.usersService.buyPlan(user, dto);
  }

  @Post('confirm-plan')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Xác nhận thanh toán gói dịch vụ' })
  async confirmPlan(@Authen() user: User, @Body() dto: ConfirmPaymentDto) {
    return this.usersService.confirmPayment(user, dto);
  }

  @Get('current-plan')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Lấy gói dịch vụ hiện tại của user (mặc định Free nếu chưa có)' })
  async getCurrentPlan(@Authen() user: User) {
    return this.usersService.getCurrentPlan(user);
  }

}
