import { MigrationInterface, QueryRunner } from 'typeorm'

export class facebookAds1750852272229 implements MigrationInterface {
  name = 'facebookAds1750852272229'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "group_role" DROP CONSTRAINT "FK_e9d49994467a645560fce4bcca4"`)
    await queryRunner.query(`ALTER TABLE "group_role" DROP CONSTRAINT "FK_23e6ccf814c8fb5704dc35bda8d"`)
    await queryRunner.query(`ALTER TABLE "group_user" DROP CONSTRAINT "FK_0837be536f0f518052a7bef2e04"`)
    await queryRunner.query(`ALTER TABLE "group_user" DROP CONSTRAINT "FK_d339f18d53e39b898da78bbabba"`)
    await queryRunner.query(`
            CREATE TABLE "facebook_ads" (
            "id" SERIAL NOT NULL, 
            "ad_id" character varying NOT NULL, 
            "campaign_name" character varying, 
            "caption" text, 
            "objective" character varying, 
            "start_time" TIMESTAMP WITH TIME ZONE, 
            "end_time" TIMESTAMP WITH TIME ZONE, 
            "daily_budget" integer, 
            "status" character varying DEFAULT 'ACTIVE', 
            "created_at" TIMESTAMP NOT NULL DEFAULT now(), 
            "created_by" uuid, 
            CONSTRAINT "UQ_a85de4184832a86ec58df990dca" UNIQUE ("ad_id"), 
            CONSTRAINT "PK_c93f614316bd515a68875f1cf9d" PRIMARY KEY ("id"))
            `)
    await queryRunner.query(
      `ALTER TABLE "facebook_ads" ADD CONSTRAINT "FK_2f28601f065c01f176b7f4c8f8a" FOREIGN KEY ("created_by") REFERENCES "tbl_users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    )
    await queryRunner.query(
      `ALTER TABLE "group_role" ADD CONSTRAINT "FK_23e6ccf814c8fb5704dc35bda8d" FOREIGN KEY ("role_id") REFERENCES "tbl_role"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    )
    await queryRunner.query(
      `ALTER TABLE "group_role" ADD CONSTRAINT "FK_e9d49994467a645560fce4bcca4" FOREIGN KEY ("group_id") REFERENCES "tbl_group"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    )
    await queryRunner.query(
      `ALTER TABLE "group_user" ADD CONSTRAINT "FK_d339f18d53e39b898da78bbabba" FOREIGN KEY ("group_id") REFERENCES "tbl_group"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    )
    await queryRunner.query(
      `ALTER TABLE "group_user" ADD CONSTRAINT "FK_0837be536f0f518052a7bef2e04" FOREIGN KEY ("user_id") REFERENCES "tbl_users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "group_user" DROP CONSTRAINT "FK_0837be536f0f518052a7bef2e04"`)
    await queryRunner.query(`ALTER TABLE "group_user" DROP CONSTRAINT "FK_d339f18d53e39b898da78bbabba"`)
    await queryRunner.query(`ALTER TABLE "group_role" DROP CONSTRAINT "FK_e9d49994467a645560fce4bcca4"`)
    await queryRunner.query(`ALTER TABLE "group_role" DROP CONSTRAINT "FK_23e6ccf814c8fb5704dc35bda8d"`)
    await queryRunner.query(`ALTER TABLE "facebook_ads" DROP CONSTRAINT "FK_2f28601f065c01f176b7f4c8f8a"`)
    await queryRunner.query(`DROP TABLE "facebook_ads"`)
    await queryRunner.query(
      `ALTER TABLE "group_user" ADD CONSTRAINT "FK_d339f18d53e39b898da78bbabba" FOREIGN KEY ("group_id") REFERENCES "tbl_group"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    )
    await queryRunner.query(
      `ALTER TABLE "group_user" ADD CONSTRAINT "FK_0837be536f0f518052a7bef2e04" FOREIGN KEY ("user_id") REFERENCES "tbl_users"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    )
    await queryRunner.query(
      `ALTER TABLE "group_role" ADD CONSTRAINT "FK_23e6ccf814c8fb5704dc35bda8d" FOREIGN KEY ("role_id") REFERENCES "tbl_role"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    )
    await queryRunner.query(
      `ALTER TABLE "group_role" ADD CONSTRAINT "FK_e9d49994467a645560fce4bcca4" FOREIGN KEY ("group_id") REFERENCES "tbl_group"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    )
  }
}
