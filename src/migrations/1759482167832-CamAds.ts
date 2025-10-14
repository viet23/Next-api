import { MigrationInterface, QueryRunner } from 'typeorm'

export class CamAds1759482167832 implements MigrationInterface {
  name = 'CamAds1759482167832'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "group_role" DROP CONSTRAINT "FK_23e6ccf814c8fb5704dc35bda8d"`)
    await queryRunner.query(`ALTER TABLE "group_role" DROP CONSTRAINT "FK_e9d49994467a645560fce4bcca4"`)
    await queryRunner.query(`ALTER TABLE "group_user" DROP CONSTRAINT "FK_0837be536f0f518052a7bef2e04"`)
    await queryRunner.query(`ALTER TABLE "group_user" DROP CONSTRAINT "FK_d339f18d53e39b898da78bbabba"`)
    await queryRunner.query(`CREATE TABLE "facebook_campaigns" (
            "id" SERIAL NOT NULL, 
            "campaign_id" character varying NOT NULL, 
            "name" character varying NOT NULL, 
            "objective" character varying, 
            "status" character varying NOT NULL DEFAULT 'ACTIVE', 
            "daily_budget" integer, "start_time" TIMESTAMP WITH TIME ZONE, 
            "end_time" TIMESTAMP WITH TIME ZONE, 
            "created_at" TIMESTAMP NOT NULL DEFAULT now(), 
            "updated_at" TIMESTAMP NOT NULL DEFAULT now(), 
            "created_by" uuid, 
            CONSTRAINT "UQ_b191170a605c1db15056c534ba1" UNIQUE ("campaign_id"), 
            CONSTRAINT "PK_31a1d1fec23ffd3d892219e9ff8" PRIMARY KEY ("id"))`)
    await queryRunner.query(`ALTER TABLE "facebook_ads" ADD "campaign_id_ref" integer`)
    await queryRunner.query(
      `ALTER TABLE "facebook_ads" ADD CONSTRAINT "FK_b24a17eed3b2dfe402e71607374" FOREIGN KEY ("campaign_id_ref") REFERENCES "facebook_campaigns"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    )
    await queryRunner.query(
      `ALTER TABLE "facebook_campaigns" ADD CONSTRAINT "FK_5dcee11d2fdaa91def31e3757cf" FOREIGN KEY ("created_by") REFERENCES "tbl_users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
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
    await queryRunner.query(`ALTER TABLE "facebook_campaigns" DROP CONSTRAINT "FK_5dcee11d2fdaa91def31e3757cf"`)
    await queryRunner.query(`ALTER TABLE "facebook_ads" DROP CONSTRAINT "FK_b24a17eed3b2dfe402e71607374"`)
    await queryRunner.query(`ALTER TABLE "facebook_ads" DROP COLUMN "campaign_id_ref"`)
    await queryRunner.query(`DROP TABLE "facebook_campaigns"`)
    await queryRunner.query(
      `ALTER TABLE "group_user" ADD CONSTRAINT "FK_d339f18d53e39b898da78bbabba" FOREIGN KEY ("group_id") REFERENCES "tbl_group"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    )
    await queryRunner.query(
      `ALTER TABLE "group_user" ADD CONSTRAINT "FK_0837be536f0f518052a7bef2e04" FOREIGN KEY ("user_id") REFERENCES "tbl_users"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    )
    await queryRunner.query(
      `ALTER TABLE "group_role" ADD CONSTRAINT "FK_e9d49994467a645560fce4bcca4" FOREIGN KEY ("group_id") REFERENCES "tbl_group"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    )
    await queryRunner.query(
      `ALTER TABLE "group_role" ADD CONSTRAINT "FK_23e6ccf814c8fb5704dc35bda8d" FOREIGN KEY ("role_id") REFERENCES "tbl_role"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    )
  }
}
