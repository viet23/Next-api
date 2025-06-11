import {MigrationInterface, QueryRunner} from "typeorm";

export class updateDb1749656033862 implements MigrationInterface {
    name = 'updateDb1749656033862'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "tbl_case" DROP CONSTRAINT "FK_c24fd32146b7cf499f833c936c5"`);
        await queryRunner.query(`ALTER TABLE "group_role" DROP CONSTRAINT "FK_23e6ccf814c8fb5704dc35bda8d"`);
        await queryRunner.query(`ALTER TABLE "group_role" DROP CONSTRAINT "FK_e9d49994467a645560fce4bcca4"`);
        await queryRunner.query(`ALTER TABLE "group_user" DROP CONSTRAINT "FK_d339f18d53e39b898da78bbabba"`);
        await queryRunner.query(`ALTER TABLE "group_user" DROP CONSTRAINT "FK_0837be536f0f518052a7bef2e04"`);
        await queryRunner.query(`ALTER TABLE "tbl_case" DROP COLUMN "title"`);
        await queryRunner.query(`ALTER TABLE "tbl_case" DROP COLUMN "description"`);
        await queryRunner.query(`ALTER TABLE "tbl_case" DROP COLUMN "status"`);
        await queryRunner.query(`DROP TYPE "public"."tbl_case_status_enum"`);
        await queryRunner.query(`ALTER TABLE "tbl_case" DROP COLUMN "solution"`);
        await queryRunner.query(`ALTER TABLE "tbl_case" DROP COLUMN "contact_info"`);
        await queryRunner.query(`ALTER TABLE "tbl_case" DROP COLUMN "receive_date"`);
        await queryRunner.query(`ALTER TABLE "tbl_case" DROP COLUMN "problem_type"`);
        await queryRunner.query(`ALTER TABLE "tbl_case" DROP COLUMN "internal_state"`);
        await queryRunner.query(`ALTER TABLE "tbl_case" DROP COLUMN "handler"`);
        await queryRunner.query(`ALTER TABLE "tbl_case" DROP COLUMN "customer_name"`);
        await queryRunner.query(`ALTER TABLE "tbl_case" DROP COLUMN "feature"`);
        await queryRunner.query(`ALTER TABLE "tbl_case" DROP COLUMN "feature_details"`);
        await queryRunner.query(`ALTER TABLE "tbl_case" DROP COLUMN "processing_plan"`);
        await queryRunner.query(`ALTER TABLE "tbl_case" DROP COLUMN "department"`);
        await queryRunner.query(`ALTER TABLE "tbl_case" DROP COLUMN "handling_date"`);
        await queryRunner.query(`ALTER TABLE "tbl_case" DROP COLUMN "call_content"`);
        await queryRunner.query(`ALTER TABLE "tbl_case" DROP COLUMN "note"`);
        await queryRunner.query(`ALTER TABLE "tbl_case" DROP COLUMN "close_date"`);
        await queryRunner.query(`ALTER TABLE "tbl_case" DROP COLUMN "receive_channel"`);
        await queryRunner.query(`ALTER TABLE "tbl_case" DROP COLUMN "otp"`);
        await queryRunner.query(`ALTER TABLE "tbl_case" DROP COLUMN "assigned_by_id"`);
        await queryRunner.query(`ALTER TABLE "tbl_case" ADD "url_video" character varying`);
        await queryRunner.query(`ALTER TABLE "tbl_case" ADD "caption" character varying`);
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
        await queryRunner.query(`ALTER TABLE "tbl_case" DROP COLUMN "caption"`);
        await queryRunner.query(`ALTER TABLE "tbl_case" DROP COLUMN "url_video"`);
        await queryRunner.query(`ALTER TABLE "tbl_case" ADD "assigned_by_id" uuid`);
        await queryRunner.query(`ALTER TABLE "tbl_case" ADD "otp" character varying`);
        await queryRunner.query(`ALTER TABLE "tbl_case" ADD "receive_channel" character varying`);
        await queryRunner.query(`ALTER TABLE "tbl_case" ADD "close_date" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "tbl_case" ADD "note" character varying`);
        await queryRunner.query(`ALTER TABLE "tbl_case" ADD "call_content" character varying`);
        await queryRunner.query(`ALTER TABLE "tbl_case" ADD "handling_date" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "tbl_case" ADD "department" character varying`);
        await queryRunner.query(`ALTER TABLE "tbl_case" ADD "processing_plan" character varying`);
        await queryRunner.query(`ALTER TABLE "tbl_case" ADD "feature_details" character varying`);
        await queryRunner.query(`ALTER TABLE "tbl_case" ADD "feature" character varying`);
        await queryRunner.query(`ALTER TABLE "tbl_case" ADD "customer_name" character varying`);
        await queryRunner.query(`ALTER TABLE "tbl_case" ADD "handler" character varying`);
        await queryRunner.query(`ALTER TABLE "tbl_case" ADD "internal_state" character varying`);
        await queryRunner.query(`ALTER TABLE "tbl_case" ADD "problem_type" character varying`);
        await queryRunner.query(`ALTER TABLE "tbl_case" ADD "receive_date" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "tbl_case" ADD "contact_info" character varying`);
        await queryRunner.query(`ALTER TABLE "tbl_case" ADD "solution" character varying`);
        await queryRunner.query(`CREATE TYPE "public"."tbl_case_status_enum" AS ENUM('NEW', 'PENDING', 'PROCESS', 'SUCCESS', 'CANCEL')`);
        await queryRunner.query(`ALTER TABLE "tbl_case" ADD "status" "public"."tbl_case_status_enum" DEFAULT 'NEW'`);
        await queryRunner.query(`ALTER TABLE "tbl_case" ADD "description" character varying`);
        await queryRunner.query(`ALTER TABLE "tbl_case" ADD "title" character varying`);
        await queryRunner.query(`ALTER TABLE "group_user" ADD CONSTRAINT "FK_0837be536f0f518052a7bef2e04" FOREIGN KEY ("user_id") REFERENCES "tbl_users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "group_user" ADD CONSTRAINT "FK_d339f18d53e39b898da78bbabba" FOREIGN KEY ("group_id") REFERENCES "tbl_group"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "group_role" ADD CONSTRAINT "FK_e9d49994467a645560fce4bcca4" FOREIGN KEY ("group_id") REFERENCES "tbl_group"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "group_role" ADD CONSTRAINT "FK_23e6ccf814c8fb5704dc35bda8d" FOREIGN KEY ("role_id") REFERENCES "tbl_role"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "tbl_case" ADD CONSTRAINT "FK_c24fd32146b7cf499f833c936c5" FOREIGN KEY ("assigned_by_id") REFERENCES "tbl_users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

}
