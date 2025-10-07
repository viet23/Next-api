import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import { KafkaOptions, Transport } from '@nestjs/microservices';
import * as express from 'express';
import { join } from 'path';
import { SeedRolesService } from './seed/seed.roles';
import cookieParser from 'cookie-parser';
import { Connection } from 'typeorm'; // ⬅️ TypeORM 0.2.x dùng Connection
require('dotenv').config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'debug', 'verbose', 'log'],
  });

  // Nếu sau proxy: lấy đúng client IP cho CAPI
  app.getHttpAdapter().getInstance().set('trust proxy', true);

  // Seed roles
  const seedRolesService = app.get(SeedRolesService);
  await seedRolesService.seed();

  // Kết nối DB
  const connection = app.get(Connection);

  // ✅ Hàm seed Free subscriptions
  async function seedFreeSubscriptions() {
    try {
      // Nếu là PostgreSQL và dùng uuid_generate_v4()
      await connection.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);

      await connection.query(`
        INSERT INTO "tbl_user_subscriptions" 
          ("id", "userId", "planId", "startDate", "endDate", "isPaid", "created_at", "updated_at")
        SELECT
          uuid_generate_v4(),
          u."id",
          (SELECT "id" FROM "tbl_subscription_plans" WHERE "name" = 'Free' LIMIT 1),
          now(),
          now() + interval '7 day',
          true,
          now(),
          now()
        FROM "tbl_users" u
        WHERE NOT EXISTS (
          SELECT 1 FROM "tbl_user_subscriptions" s WHERE s."userId" = u."id"
        );
      `);

      console.log(`[Seed] ✅ User Free subscriptions ensured at ${new Date().toISOString()}`);
    } catch (e) {
      console.error('[Seed] ❌ Error seeding user subscriptions:', e?.message || e);
    }
  }

  // 👉 Chạy lần đầu khi khởi động
  await seedFreeSubscriptions();

  // 👉 Cứ 5 phút chạy lại 1 lần (30 * 60 * 1000 ms)
  setInterval(seedFreeSubscriptions, 5 * 60 * 1000);

  // setInterval(seedFreeSubscriptions, 30 * 1000);


  // CORS
  app.enableCors({ origin: true, credentials: true });

  // Body limit
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

  // await app.startAllMicroservices(); // nếu dùng connectMicroservice() ở nơi khác

  await app.listen(3001);
  console.log(`🚀 Server running on http://localhost:3001`);
}

bootstrap();

// ================= Kafka Config ===================
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

// ================= Redis Config (tùy chọn) ===================
// export const redisConfig: RedisOptions = {
//   transport: Transport.REDIS,
//   options: { host: 'localhost', port: /* ... */ }
// };
