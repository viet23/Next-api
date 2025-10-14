import { MigrationInterface, QueryRunner } from 'typeorm'

export class Plan1758034915908 implements MigrationInterface {
  name = 'Plan1758034915908'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "group_user" DROP CONSTRAINT "FK_d339f18d53e39b898da78bbabba"`)
    await queryRunner.query(`ALTER TABLE "group_user" DROP CONSTRAINT "FK_0837be536f0f518052a7bef2e04"`)
    await queryRunner.query(`ALTER TABLE "group_role" DROP CONSTRAINT "FK_23e6ccf814c8fb5704dc35bda8d"`)
    await queryRunner.query(`ALTER TABLE "group_role" DROP CONSTRAINT "FK_e9d49994467a645560fce4bcca4"`)
    await queryRunner.query(
      `CREATE TABLE "tbl_subscription_plans" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP DEFAULT now(), "name" character varying NOT NULL, "price" integer NOT NULL DEFAULT '0', "features" jsonb, CONSTRAINT "PK_81078e9fe1d54eb9009c2e7824b" PRIMARY KEY ("id"))`,
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_c21b74780c776285a59232fb2f" ON "tbl_subscription_plans" ("name") `,
    )
    await queryRunner.query(
      `CREATE TABLE "tbl_user_subscriptions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP DEFAULT now(), "startDate" TIMESTAMP NOT NULL, "endDate" TIMESTAMP NOT NULL, "isPaid" boolean NOT NULL DEFAULT false, "userId" uuid NOT NULL, "planId" uuid NOT NULL, CONSTRAINT "PK_7c293f1e28774a08208481a8c30" PRIMARY KEY ("id"))`,
    )
    await queryRunner.query(`CREATE INDEX "IDX_f4acb74efbc500b29c9d940177" ON "tbl_user_subscriptions" ("startDate") `)
    await queryRunner.query(`CREATE INDEX "IDX_ded1ebdc6dccfb24dd912e615b" ON "tbl_user_subscriptions" ("endDate") `)
    await queryRunner.query(
      `ALTER TABLE "tbl_user_subscriptions" ADD CONSTRAINT "FK_5fefb5e74415c4237d63942d72d" FOREIGN KEY ("userId") REFERENCES "tbl_users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    )
    await queryRunner.query(
      `ALTER TABLE "tbl_user_subscriptions" ADD CONSTRAINT "FK_09047bcb4e6da0212be19205f45" FOREIGN KEY ("planId") REFERENCES "tbl_subscription_plans"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    )
    await queryRunner.query(
      `ALTER TABLE "group_role" ADD CONSTRAINT "FK_23e6ccf814c8fb5704dc35bda8d" FOREIGN KEY ("role_id") REFERENCES "tbl_role"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    )
    await queryRunner.query(
      `ALTER TABLE "group_role" ADD CONSTRAINT "FK_e9d49994467a645560fce4bcca4" FOREIGN KEY ("group_id") REFERENCES "tbl_group"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    )
    await queryRunner.query(
      `ALTER TABLE "group_user" ADD CONSTRAINT "FK_0837be536f0f518052a7bef2e04" FOREIGN KEY ("user_id") REFERENCES "tbl_users"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    )
    await queryRunner.query(
      `ALTER TABLE "group_user" ADD CONSTRAINT "FK_d339f18d53e39b898da78bbabba" FOREIGN KEY ("group_id") REFERENCES "tbl_group"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    )
    await queryRunner.query(`
      INSERT INTO tbl_subscription_plans (id, name, price, features, created_at, updated_at)
      VALUES
      (gen_random_uuid(), 'Free', 0, '["Tối đa 2 chiến dịch","Ngân sách tối đa 5 triệu","Không có AI nâng cao"]', now(), now()),
      (gen_random_uuid(), 'Starter', 499000, '["Tối đa 3 chiến dịch","Ngân sách 10 triệu","AI gợi ý content & target"]', now(), now()),
      (gen_random_uuid(), 'Pro', 1999000, '["Chiến dịch không giới hạn","AI tối ưu real-time","A/B Testing tự động"]', now(), now()),
      (gen_random_uuid(), 'Enterprise', 4999000, '["Quản lý nhiều tài khoản ads","CRM & remarketing","Support 24/7"]', now(), now())
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "group_user" DROP CONSTRAINT "FK_d339f18d53e39b898da78bbabba"`)
    await queryRunner.query(`ALTER TABLE "group_user" DROP CONSTRAINT "FK_0837be536f0f518052a7bef2e04"`)
    await queryRunner.query(`ALTER TABLE "group_role" DROP CONSTRAINT "FK_e9d49994467a645560fce4bcca4"`)
    await queryRunner.query(`ALTER TABLE "group_role" DROP CONSTRAINT "FK_23e6ccf814c8fb5704dc35bda8d"`)
    await queryRunner.query(`ALTER TABLE "tbl_user_subscriptions" DROP CONSTRAINT "FK_09047bcb4e6da0212be19205f45"`)
    await queryRunner.query(`ALTER TABLE "tbl_user_subscriptions" DROP CONSTRAINT "FK_5fefb5e74415c4237d63942d72d"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_ded1ebdc6dccfb24dd912e615b"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_f4acb74efbc500b29c9d940177"`)
    await queryRunner.query(`DROP TABLE "tbl_user_subscriptions"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_c21b74780c776285a59232fb2f"`)
    await queryRunner.query(`DROP TABLE "tbl_subscription_plans"`)
    await queryRunner.query(
      `ALTER TABLE "group_role" ADD CONSTRAINT "FK_e9d49994467a645560fce4bcca4" FOREIGN KEY ("group_id") REFERENCES "tbl_group"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    )
    await queryRunner.query(
      `ALTER TABLE "group_role" ADD CONSTRAINT "FK_23e6ccf814c8fb5704dc35bda8d" FOREIGN KEY ("role_id") REFERENCES "tbl_role"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    )
    await queryRunner.query(
      `ALTER TABLE "group_user" ADD CONSTRAINT "FK_0837be536f0f518052a7bef2e04" FOREIGN KEY ("user_id") REFERENCES "tbl_users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    )
    await queryRunner.query(
      `ALTER TABLE "group_user" ADD CONSTRAINT "FK_d339f18d53e39b898da78bbabba" FOREIGN KEY ("group_id") REFERENCES "tbl_group"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    )
    await queryRunner.query(`
      DELETE FROM tbl_subscription_plans WHERE name IN ('Free','Starter','Pro','Enterprise');
    `)
  }
}
