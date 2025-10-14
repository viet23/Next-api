import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { User } from 'src/models/user.entity'
import { Repository, Connection } from 'typeorm'
import { InjectRepository, InjectConnection } from '@nestjs/typeorm'
import { NotFoundException } from '@nestjs/common'
import { CreateUserCommand } from '../impl/create-user.command'

@CommandHandler(CreateUserCommand)
export class CreateUserCommandHandler implements ICommandHandler<CreateUserCommand> {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  async execute(command: CreateUserCommand): Promise<User> {
    const { username, password, email, phone, zalo } = command?.createUserDto

    const existed = await this.userRepo.findOne({ where: { email } })
    if (existed) {
      throw new NotFoundException('User already exists')
    }

    const user = await this.userRepo.create({
      email,
      username: email,
      fullName: username,
      password,
      phone,
      zalo,
    })

    console.log('Creating user and seeding subscriptions...', user)

    // (Tuỳ chọn) transaction gói cả tạo user + seed subscriptions
    return await this.connection.transaction(async (manager) => {
      const savedUser = await manager.getRepository(User).save(user)

      // (Nếu là PostgreSQL, dùng uuid_generate_v4) đảm bảo extension (idempotent)
      await manager.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`)

      // ✅ Seed cho TẤT CẢ user chưa có subscription (bulk, idempotent)
      await manager.query(`
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
      `)

      return savedUser
    })
  }
}
