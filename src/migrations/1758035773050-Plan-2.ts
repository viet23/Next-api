import { MigrationInterface, QueryRunner } from "typeorm";

export class Plan21758035773050 implements MigrationInterface {
    name = 'Plan21758035773050'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "group_role" DROP CONSTRAINT "FK_23e6ccf814c8fb5704dc35bda8d"`);
        await queryRunner.query(`ALTER TABLE "group_role" DROP CONSTRAINT "FK_e9d49994467a645560fce4bcca4"`);
        await queryRunner.query(`ALTER TABLE "group_user" DROP CONSTRAINT "FK_0837be536f0f518052a7bef2e04"`);
        await queryRunner.query(`ALTER TABLE "group_user" DROP CONSTRAINT "FK_d339f18d53e39b898da78bbabba"`);
        await queryRunner.query(`ALTER TABLE "group_role" ADD CONSTRAINT "FK_23e6ccf814c8fb5704dc35bda8d" FOREIGN KEY ("role_id") REFERENCES "tbl_role"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "group_role" ADD CONSTRAINT "FK_e9d49994467a645560fce4bcca4" FOREIGN KEY ("group_id") REFERENCES "tbl_group"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "group_user" ADD CONSTRAINT "FK_0837be536f0f518052a7bef2e04" FOREIGN KEY ("user_id") REFERENCES "tbl_users"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "group_user" ADD CONSTRAINT "FK_d339f18d53e39b898da78bbabba" FOREIGN KEY ("group_id") REFERENCES "tbl_group"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`
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



    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "group_user" DROP CONSTRAINT "FK_d339f18d53e39b898da78bbabba"`);
        await queryRunner.query(`ALTER TABLE "group_user" DROP CONSTRAINT "FK_0837be536f0f518052a7bef2e04"`);
        await queryRunner.query(`ALTER TABLE "group_role" DROP CONSTRAINT "FK_e9d49994467a645560fce4bcca4"`);
        await queryRunner.query(`ALTER TABLE "group_role" DROP CONSTRAINT "FK_23e6ccf814c8fb5704dc35bda8d"`);
        await queryRunner.query(`ALTER TABLE "group_user" ADD CONSTRAINT "FK_d339f18d53e39b898da78bbabba" FOREIGN KEY ("group_id") REFERENCES "tbl_group"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "group_user" ADD CONSTRAINT "FK_0837be536f0f518052a7bef2e04" FOREIGN KEY ("user_id") REFERENCES "tbl_users"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "group_role" ADD CONSTRAINT "FK_e9d49994467a645560fce4bcca4" FOREIGN KEY ("group_id") REFERENCES "tbl_group"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "group_role" ADD CONSTRAINT "FK_23e6ccf814c8fb5704dc35bda8d" FOREIGN KEY ("role_id") REFERENCES "tbl_role"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`
  DELETE FROM tbl_user_subscriptions 
  WHERE planId IN (SELECT id FROM tbl_subscription_plans WHERE name = 'Free');
`);

    }

}
