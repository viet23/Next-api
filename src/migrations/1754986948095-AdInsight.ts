import {MigrationInterface, QueryRunner} from "typeorm";

export class AdInsight1754986948095 implements MigrationInterface {
    name = 'AdInsight1754986948095'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "group_role" DROP CONSTRAINT "FK_23e6ccf814c8fb5704dc35bda8d"`);
        await queryRunner.query(`ALTER TABLE "group_role" DROP CONSTRAINT "FK_e9d49994467a645560fce4bcca4"`);
        await queryRunner.query(`ALTER TABLE "group_user" DROP CONSTRAINT "FK_0837be536f0f518052a7bef2e04"`);
        await queryRunner.query(`ALTER TABLE "group_user" DROP CONSTRAINT "FK_d339f18d53e39b898da78bbabba"`);
        await queryRunner.query(`CREATE TABLE "ad_insight" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP DEFAULT now(), "ad_id" character varying NOT NULL, "campaign_name" character varying, "created_by_email" character varying, "impressions" character varying NOT NULL DEFAULT '0', "reach" character varying NOT NULL DEFAULT '0', "frequency" character varying NOT NULL DEFAULT '0', "clicks" character varying NOT NULL DEFAULT '0', "inline_link_clicks" character varying NOT NULL DEFAULT '0', "spend_vnd" character varying NOT NULL DEFAULT '0', "ctr_percent" character varying NOT NULL DEFAULT '0', "cpm_vnd" character varying NOT NULL DEFAULT '0', "cpc_vnd" character varying NOT NULL DEFAULT '0', "total_engagement" character varying NOT NULL DEFAULT '0', "engagement_details" text, "recommendation" text, "html_report" text, "user_id" character varying, CONSTRAINT "PK_f88946d99593645f05d0759857d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_63ea578bb0645d864ff24f3c38" ON "ad_insight" ("ad_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_73a7b69b97c6fd8caaef2555f7" ON "ad_insight" ("user_id") `);
        await queryRunner.query(`ALTER TABLE "group_role" ADD CONSTRAINT "FK_23e6ccf814c8fb5704dc35bda8d" FOREIGN KEY ("role_id") REFERENCES "tbl_role"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "group_role" ADD CONSTRAINT "FK_e9d49994467a645560fce4bcca4" FOREIGN KEY ("group_id") REFERENCES "tbl_group"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "group_user" ADD CONSTRAINT "FK_d339f18d53e39b898da78bbabba" FOREIGN KEY ("group_id") REFERENCES "tbl_group"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "group_user" ADD CONSTRAINT "FK_0837be536f0f518052a7bef2e04" FOREIGN KEY ("user_id") REFERENCES "tbl_users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "group_user" DROP CONSTRAINT "FK_0837be536f0f518052a7bef2e04"`);
        await queryRunner.query(`ALTER TABLE "group_user" DROP CONSTRAINT "FK_d339f18d53e39b898da78bbabba"`);
        await queryRunner.query(`ALTER TABLE "group_role" DROP CONSTRAINT "FK_e9d49994467a645560fce4bcca4"`);
        await queryRunner.query(`ALTER TABLE "group_role" DROP CONSTRAINT "FK_23e6ccf814c8fb5704dc35bda8d"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_73a7b69b97c6fd8caaef2555f7"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_63ea578bb0645d864ff24f3c38"`);
        await queryRunner.query(`DROP TABLE "ad_insight"`);
        await queryRunner.query(`ALTER TABLE "group_user" ADD CONSTRAINT "FK_d339f18d53e39b898da78bbabba" FOREIGN KEY ("group_id") REFERENCES "tbl_group"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "group_user" ADD CONSTRAINT "FK_0837be536f0f518052a7bef2e04" FOREIGN KEY ("user_id") REFERENCES "tbl_users"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "group_role" ADD CONSTRAINT "FK_e9d49994467a645560fce4bcca4" FOREIGN KEY ("group_id") REFERENCES "tbl_group"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "group_role" ADD CONSTRAINT "FK_23e6ccf814c8fb5704dc35bda8d" FOREIGN KEY ("role_id") REFERENCES "tbl_role"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
    }

}
