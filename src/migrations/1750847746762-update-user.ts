import { MigrationInterface, QueryRunner } from 'typeorm'

export class updateUser1750847746762 implements MigrationInterface {
  name = 'updateUser1750847746762'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "group_user" DROP CONSTRAINT "FK_d339f18d53e39b898da78bbabba"`)
    await queryRunner.query(`ALTER TABLE "group_user" DROP CONSTRAINT "FK_0837be536f0f518052a7bef2e04"`)
    await queryRunner.query(`ALTER TABLE "group_role" DROP CONSTRAINT "FK_23e6ccf814c8fb5704dc35bda8d"`)
    await queryRunner.query(`ALTER TABLE "group_role" DROP CONSTRAINT "FK_e9d49994467a645560fce4bcca4"`)
    await queryRunner.query(`ALTER TABLE "tbl_users" ADD "access_token_user" character varying`)
    await queryRunner.query(`ALTER TABLE "tbl_users" ADD "account_ads_id" character varying`)
    await queryRunner.query(
      `ALTER TABLE "group_user" ADD CONSTRAINT "FK_0837be536f0f518052a7bef2e04" FOREIGN KEY ("user_id") REFERENCES "tbl_users"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    )
    await queryRunner.query(
      `ALTER TABLE "group_user" ADD CONSTRAINT "FK_d339f18d53e39b898da78bbabba" FOREIGN KEY ("group_id") REFERENCES "tbl_group"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    )
    await queryRunner.query(
      `ALTER TABLE "group_role" ADD CONSTRAINT "FK_e9d49994467a645560fce4bcca4" FOREIGN KEY ("group_id") REFERENCES "tbl_group"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    )
    await queryRunner.query(
      `ALTER TABLE "group_role" ADD CONSTRAINT "FK_23e6ccf814c8fb5704dc35bda8d" FOREIGN KEY ("role_id") REFERENCES "tbl_role"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "group_role" DROP CONSTRAINT "FK_23e6ccf814c8fb5704dc35bda8d"`)
    await queryRunner.query(`ALTER TABLE "group_role" DROP CONSTRAINT "FK_e9d49994467a645560fce4bcca4"`)
    await queryRunner.query(`ALTER TABLE "group_user" DROP CONSTRAINT "FK_d339f18d53e39b898da78bbabba"`)
    await queryRunner.query(`ALTER TABLE "group_user" DROP CONSTRAINT "FK_0837be536f0f518052a7bef2e04"`)
    await queryRunner.query(`ALTER TABLE "tbl_users" DROP COLUMN "account_ads_id"`)
    await queryRunner.query(`ALTER TABLE "tbl_users" DROP COLUMN "access_token_user"`)
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
  }
}
