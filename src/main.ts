import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import { Transport, KafkaOptions } from '@nestjs/microservices';
import * as express from 'express';
import { join } from 'path';
import { SeedRolesService } from './seed/seed.roles';
import { Connection } from 'typeorm'; // TypeORM 0.2.x

require('dotenv').config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  // Nếu chạy sau proxy (Nginx/ALB) để lấy đúng IP client
  app.getHttpAdapter().getInstance().set('trust proxy', true);

  // CORS
  app.enableCors({ origin: true, credentials: true });

  // Body limit (không cần thêm package)
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  // ✅ ValidationPipe: bắt buộc để DTO map dữ liệu chính xác
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Prefix API (không có dấu '/')
  app.setGlobalPrefix('api/v1');

  // Seed roles
  const seedRolesService = app.get(SeedRolesService);
  await seedRolesService.seed();

  // Seed Free-subscription (TypeORM 0.2.x: Connection)
  const connection = app.get(Connection);
  try {
    await connection.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);
    // Đảm bảo đã có plan 'Free' (nếu chưa có, hãy insert trong seed/migration riêng)
    await connection.query(`
      INSERT INTO "tbl_user_subscriptions"
        ("id","userId","planId","startDate","endDate","isPaid","created_at","updated_at")
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
    console.log('[Seed] User Free subscriptions ensured.');
  } catch (e) {
    console.error('[Seed] Error seeding user subscriptions:', e?.message || e);
  }

  // Swagger (chỉ bật khi không phải production)
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Camera AI')
    .setDescription('Camera AI Service')
    .setVersion('1.0')
    .addTag('Camera AI')
    .addBearerAuth()
    .build();

  if (process.env.NODE_ENV !== 'production') {
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    // Hiển thị tại: GET /api/v1/explorer
    SwaggerModule.setup('explorer', app, document, { useGlobalPrefix: true });
  }

  // Static files
  app.use('/public', express.static(join(__dirname, '..', 'uploads')));

  // Graceful shutdown
  app.enableShutdownHooks();

  const port = Number(process.env.PORT) || 3001;
  await app.listen(port);
  console.log(`🚀 Server is running at http://localhost:${port}`);
}

bootstrap();

// (Tuỳ chọn) Kafka config – giữ nguyên, không yêu cầu cài thêm gì
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
