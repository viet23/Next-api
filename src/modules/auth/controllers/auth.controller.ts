import {
  Body,
  Controller,
  Get,
  Logger,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiTags } from '@nestjs/swagger';
import { UserSignInDTO } from '../dto/user-signin.dto';
import { User } from 'src/models/user.entity';
import { UserSignUpDTO } from '../dto/user-signup.dto';
import { SignupUserCommand } from '../cqrs/commands/impl/signin-user.command';
import { SignInQuery } from '../cqrs/queries/impl/signin.query';
import { AuthGuard } from '@nestjs/passport';
import { SamlSigninUserCommand } from '../cqrs/commands/impl/saml-signin-user.command';
import { Response } from 'express';
import { CookieAuthGuard } from '../cookie-auth.guard';
import { Authen } from '@decorators/authen.decorator';
import { GetCurrentUserQuery } from '../cqrs/queries/impl/get-current-user.query';

import { JwtService } from '@nestjs/jwt';
import { UsersService } from '@modules/users/users.service';

@Controller('auth')
@ApiTags('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  constructor(
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) { }

  // Đăng nhập bằng username/password
  @Post('signin')
  async signin(@Body() dto: UserSignInDTO): Promise<any> {
    return this.queryBus.execute(new SignInQuery(dto));
  }

  @Get('facebook')
  @UseGuards(AuthGuard('facebook'))
  async facebookLogin() {
    // Redirects to Facebook login
  }

  @Get('facebook/callback')
  @UseGuards(AuthGuard('facebook'))
  async facebookCallback(@Req() req, @Res() res: Response) {
    const user = req.user;
    // Gửi dữ liệu user về cửa sổ gốc của frontend
    res.send(`
      <script>
        window.opener.postMessage(${JSON.stringify(user)}, '*');
        window.close();
      </script>
    `);
  }

  @Get('google')
  @UseGuards(AuthGuard('google'))
  async googleLogin() {
    // Google sẽ tự redirect
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(@Req() req, @Res() res: Response) {
    
   const user = await this.usersService.findOrCreateFromGoogle(req.user)

    const token = await this.jwtService.signAsync({ email: req.user.email });

    res.setHeader('Content-Type', 'text/html');
    res.send(`
  <!DOCTYPE html>
  <html>
    <head>
      <meta http-equiv="Cross-Origin-Opener-Policy" content="same-origin-allow-popups">
      <title>Login successful</title>
      <script>
        (function() {
          const data = ${JSON.stringify({ token, user })};
          if (window.opener) {
            window.opener.postMessage(data, '*');
            window.close();
          } else {
            document.body.innerText = "Không tìm thấy cửa sổ cha.";
          }
        })();
      </script>
    </head>
    <body></body>
  </html>
`);

  }


  // ==== Các phần đăng nhập SAML giữ nguyên ====

  @Get('saml/login')
  @UseGuards(AuthGuard('saml'))
  async samlLogin() { }

  @Get('saml/login-gtelpay')
  @UseGuards(AuthGuard('saml-gtelpay'))
  async samlLoginGtelpay() { }

  @Post('saml/callback-gtelpay')
  @UseGuards(AuthGuard('saml-gtelpay'))
  async samlCallbackGtelpay(@Req() req, @Res() res: Response) {
    const { user } = req;
    const token = await this.commandBus.execute(new SamlSigninUserCommand({ email: user.nameID }));
    res.cookie('jwt', token, {
      httpOnly: true,
      secure: true,
    });
    return res.redirect(process.env.SAML_REDIRECT);
  }

  @Post('saml/callback')
  @UseGuards(AuthGuard('saml'))
  async samlCallback(@Req() req, @Res() res: Response) {
    const { user } = req;
    const token = await this.commandBus.execute(new SamlSigninUserCommand({ email: user.nameID }));
    res.cookie('jwt', token, {
      httpOnly: true,
      secure: true,
    });
    return res.redirect(process.env.SAML_REDIRECT);
  }

  @Post('saml/login')
  @UseGuards(CookieAuthGuard)
  async verifySamlLogin(@Authen() user: any, @Res({ passthrough: true }) res: Response) {
    try {
      const payload = await this.queryBus.execute(new GetCurrentUserQuery(user.id));
      res.clearCookie('jwt', { httpOnly: true, sameSite: 'strict' });
      return payload;
    } catch (error) {
      throw new UnauthorizedException('Unauthorize');
    }
  }

  @Post('signup')
  async signup(@Body() dto: UserSignUpDTO): Promise<Partial<User>> {
    return this.commandBus.execute(new SignupUserCommand(dto));
  }
}
