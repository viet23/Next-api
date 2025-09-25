import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import { KafkaOptions, Transport } from '@nestjs/microservices';
import * as express from 'express';
import { join } from 'path';
import { SeedRolesService } from './seed/seed.roles';
import cookieParser from 'cookie-parser';

require('dotenv').config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'debug', 'verbose', 'log'],
  });

  // Nếu sau proxy: lấy đúng client IP cho CAPI
  app.getHttpAdapter().getInstance().set('trust proxy', true);

  // Seed
  const seedRolesService = app.get(SeedRolesService);
  await seedRolesService.seed();

  // CORS
  app.enableCors({ origin: true, credentials: true });

  // Body limit (nếu cần batch data lớn)
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  // Cookie
  app.use(cookieParser());

  // Validation
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Swagger
  const swaggerOptions = new DocumentBuilder()
    .setTitle('Camera AI')
    .setDescription('Camera AI Service')
    .setVersion('1.0')
    .addTag('Camera AI')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerOptions);
  SwaggerModule.setup('explorer', app, document); // muốn nằm trong prefix thì đổi thành 'api/v1/explorer'

  // Prefix
  app.setGlobalPrefix('/api/v1');

  // Static
  app.use('/public', express.static(join(__dirname, '..', 'uploads')));

  // Nếu đã connectMicroservice() ở nơi khác thì mới cần dòng này:
  // await app.startAllMicroservices();

  await app.listen(3001);
}
bootstrap();

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
};


// export const resdisConfig: RedisOptions = {
//   transport: Transport.REDIS,
//   options: {
//     host: 'localhost',
//     port:
//   }
// }
