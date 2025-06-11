import { Body, Controller, Get, Logger, Post, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ApiTags } from '@nestjs/swagger'
import { UserSignInDTO } from '../dto/user-signin.dto'
import { User } from 'src/models/user.entity'
import { UserSignUpDTO } from '../dto/user-signup.dto'
import { SignupUserCommand } from '../cqrs/commands/impl/signin-user.command'
import { SignInQuery } from '../cqrs/queries/impl/signin.query'
import { AuthGuard } from '@nestjs/passport'
import { SamlSigninUserCommand } from '../cqrs/commands/impl/saml-signin-user.command'
import { Response } from 'express'
import { CookieAuthGuard } from '../cookie-auth.guard'
import { Authen } from '@decorators/authen.decorator'
import { GetCurrentUserQuery } from '../cqrs/queries/impl/get-current-user.query'

@Controller('auth')
@ApiTags('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name)
  constructor(
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
  ) {}
  @Post('signin')
  async signin(@Body() dto: UserSignInDTO): Promise<any> {
    return this.queryBus.execute(new SignInQuery(dto))
  }

  @Get('saml/login')
  @UseGuards(AuthGuard('saml'))
  async samlLogin() {}

  @Get('saml/login-gtelpay')
  @UseGuards(AuthGuard('saml-gtelpay'))
  async samlLoginGtelpay() {}

  @Post('saml/callback-gtelpay')
  @UseGuards(AuthGuard('saml-gtelpay'))
  async samlCallbackGtelpay(@Req() req, @Res() res: Response) {
    const { user } = req
    const token = await this.commandBus.execute(new SamlSigninUserCommand({ email: user.nameID }))
    res.cookie('jwt', token, {
      httpOnly: true,
      secure: true,
    })
    return res.redirect(process.env.SAML_REDIRECT)
  }

  @Post('saml/callback')
  @UseGuards(AuthGuard('saml'))
  async samlCallback(@Req() req, @Res() res: Response) {
    const { user } = req
    const token = await this.commandBus.execute(new SamlSigninUserCommand({ email: user.nameID }))
    res.cookie('jwt', token, {
      httpOnly: true,
      secure: true,
    })
    return res.redirect(process.env.SAML_REDIRECT)
  }

  @Post('saml/login')
  @UseGuards(CookieAuthGuard)
  async verifySamlLogin(@Authen() user: any, @Res({ passthrough: true }) res: Response) {
    try {
      const payload = await this.queryBus.execute(new GetCurrentUserQuery(user.id))
      res.clearCookie('jwt', { httpOnly: true, sameSite: 'strict' })
      return payload
    } catch (error) {
      throw new UnauthorizedException('Unauthorize')
    }
  }
  @Post('signup')
  async signup(@Body() dto: UserSignUpDTO): Promise<Partial<User>> {
    return this.commandBus.execute(new SignupUserCommand(dto))
  }
}
