import { AppController } from './app.controller'
import { AppService } from './app.service'
import { Module, MiddlewareConsumer, OnModuleInit } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import DATABASE_CONFIG from './config/database.config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { SubscribersModule } from './subscribers/subscribers.module'
import { Connection } from 'typeorm'
import { ModulesContainer, Reflector } from '@nestjs/core'
import { IS_SUBSCRIBER } from './subscribers/subscribers.decorator'
import { AuthModule } from './modules/auth/auth.module'
import { RolesModule } from '@modules/roles/role.module'
import { SeedModule } from './seed/seed.module'
import { CustomersModule } from './modules/customers/customers.module'
import { MailerModule } from '@nestjs-modules/mailer'
import { HandlebarsAdapter } from '@nestjs-modules/mailer/dist/adapters/handlebars.adapter'
import { join } from 'path'
import { ScheduleModule } from '@nestjs/schedule'
import { UsersModule } from '@modules/users/users.module'
import { CaseModule } from '@modules/case/case.module'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      name: 'default',
      useFactory: () => DATABASE_CONFIG,
    }),
    MailerModule.forRoot({
      transport: {
        host: '',
        port: 587,
        secure: false,
        auth: {
          user: '',
          pass: '',
        },
      },
      defaults: {
        from: '',
      },
      template: {
        dir: join(__dirname, 'templates'),
        adapter: new HandlebarsAdapter(),
        options: {
          strict: true,
        },
      },
    }),
    SubscribersModule,
    AuthModule,
    RolesModule,
    SeedModule,
    CustomersModule,
    UsersModule,
    CaseModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements OnModuleInit {
  constructor(
    private readonly connection: Connection,
    private readonly container: ModulesContainer,
    private readonly reflector: Reflector,
  ) {}

  onModuleInit() {
    const subscribers = [...this.container.values()]
      .filter(({ providers }) => providers.size > 0)
      .reduce(
        (matching, { providers }) => [
          ...matching,
          ...[...providers.values()]
            .filter(
              (provider) =>
                provider.instance && this.reflector.get(IS_SUBSCRIBER, provider.instance.constructor) === true,
            )
            .map((provider) => provider.instance),
        ],
        [],
      )

    subscribers.forEach((subscriber) => {
      this.connection.subscribers.push(subscriber)
    })
  }

  configure(consumer: MiddlewareConsumer) {}
}
