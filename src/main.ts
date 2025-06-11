import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'
import { ValidationPipe } from '@nestjs/common'
import { KafkaOptions, Transport } from '@nestjs/microservices'
import * as express from 'express'
import { join } from 'path'
import { SeedRolesService } from './seed/seed.roles'
import cookieParser from 'cookie-parser'
require('dotenv').config()

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'debug', 'verbose', 'log'],
  })

  const seedRolesService = app.get(SeedRolesService)
  await seedRolesService.seed()
  app.enableCors()
  app.useGlobalPipes(new ValidationPipe())
  const swaggerOptions = new DocumentBuilder()
    .setTitle('Camera AI')
    .setDescription('Camera AI Service')
    .setVersion('1.0')
    .addTag('Camera AI')
    .addBearerAuth()
    .build()

  app.setGlobalPrefix('/api/v1')
  const document = SwaggerModule.createDocument(app, swaggerOptions)
  SwaggerModule.setup('explorer', app, document)
  app.use('/public', express.static(join(__dirname, '..', 'uploads')))
  await app.startAllMicroservices()
  app.use(cookieParser())
  await app.listen(3001)
}
bootstrap()

export const kafkaConfig: KafkaOptions = {
  transport: Transport.KAFKA,
  options: {
    client: {
      brokers: [process.env.KAFKA_SERVER || '10.0.229.11:9092'],
    },
    consumer: {
      groupId: process.env.KAFKA_GROUP || 'test_consumer_group',
      allowAutoTopicCreation: true,
    },
  },
}

// export const resdisConfig: RedisOptions = {
//   transport: Transport.REDIS,
//   options: {
//     host: 'localhost',
//     port:
//   }
// }
