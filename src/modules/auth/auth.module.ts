import { Module } from '@nestjs/common'
import { PassportModule } from '@nestjs/passport'
import { JwtModule } from '@nestjs/jwt'
import { jwtConstants } from './constants'
import { JwtStrategy } from './jwt.strategy'
import { TypeOrmModule } from '@nestjs/typeorm'
import { User } from 'src/models/user.entity'
import { AuthController } from './controllers/auth.controller'
import { GetUserAuthQueryHandler } from './cqrs/queries/handler/get-user-auth.handler'
import { CqrsModule } from '@nestjs/cqrs'
import { SignUpUserCommandHandler } from './cqrs/commands/handler/signin-user.handler'
import { SignInQueryHandler } from './cqrs/queries/handler/signin.handler'
import { GetRoleAuthQueryHandler } from './cqrs/queries/handler/get-roles-auth.handler'
import { SamlStrategy } from './saml.strategy'
import { SamlSigninUserCommandHandler } from './cqrs/commands/handler/saml-signin-user.handler'
import { CookieAuthGuard } from './cookie-auth.guard'
import { GetCurrentUserQueryHandler } from './cqrs/queries/handler/get-current-user.handler'
import { Group } from '@models/group.entity'
// import { SamlGtelpayStrategy } from './saml-gtelpay.strategy'
import { UsersModule } from '@modules/users/users.module'
import { GoogleStrategy } from './google.strategy'
import { AuthService } from './auth.service'
const CommandHandlers = [SignUpUserCommandHandler, SamlSigninUserCommandHandler]
const QueriesHandler = [
  GetUserAuthQueryHandler,
  SignInQueryHandler,
  GetRoleAuthQueryHandler,
  GetCurrentUserQueryHandler,
]
@Module({
  imports: [
    TypeOrmModule.forFeature([User, Group]),
    PassportModule,
    UsersModule,
    JwtModule.register({
      secret: jwtConstants.secret,
      signOptions: { expiresIn: '2592000s' },
    }),
    CqrsModule,
  ],
  providers: [
    ...CommandHandlers,
    ...QueriesHandler,
    JwtStrategy,
    SamlStrategy,
    // SamlGtelpayStrategy,
    CookieAuthGuard,
    GoogleStrategy,
    AuthService,
  ],
  exports: [],
  controllers: [AuthController],
})
export class AuthModule {}
