import { MigrationInterface, QueryRunner } from "typeorm";

export class initDb1749659477279 implements MigrationInterface {
    name = 'initDb1749659477279'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
  CREATE TYPE "public"."tbl_customers_gender_enum" AS ENUM ('M', 'F');
`);

        await queryRunner.query(`
  CREATE TYPE "public"."tbl_customers_is_suspect_enum" AS ENUM ('0', '1');
`);

await queryRunner.query(`
  CREATE TYPE "public"."customers_is_suspect_enum" AS ENUM ('0', '1');
`);
        await queryRunner.query(`CREATE TABLE "tbl_case" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP DEFAULT now(), "code" character varying NOT NULL, "url_video" character varying, "caption" character varying, "updated_by_id" character varying, CONSTRAINT "UQ_bf606aff0fea5633b29c55df8aa" UNIQUE ("code"), CONSTRAINT "PK_d9ac14d9e24c291247e176375f9" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "tbl_role" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP DEFAULT now(), "name" character varying NOT NULL, "description" character varying, CONSTRAINT "UQ_9202294311d3253394ec1a84c99" UNIQUE ("name"), CONSTRAINT "PK_7fb8c467d6259854a09dd60c109" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "tbl_users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP DEFAULT now(), "username" character varying NOT NULL, "phone" character varying, "extension" character varying, "full_name" character varying, "password" character varying NOT NULL, "is_active" boolean NOT NULL DEFAULT false, CONSTRAINT "UQ_22e9c745c648bad6b39c5d5b58e" UNIQUE ("username"), CONSTRAINT "UQ_ba82e71e58933be15e3e35066e0" UNIQUE ("phone"), CONSTRAINT "PK_bb1d884179b3e42514b36c01e4e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "tbl_group" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP DEFAULT now(), "name" character varying NOT NULL, "description" character varying, CONSTRAINT "UQ_876dc7f82f7298f9377cb8956ce" UNIQUE ("name"), CONSTRAINT "PK_f3a01958f3d250451e0e77a1d8e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "tbl_customers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP DEFAULT now(), "customer_id" bigint NOT NULL, "full_name" character varying NOT NULL, "phone" character varying NOT NULL, "email" character varying, "date_of_birth" date, "gender" "public"."tbl_customers_gender_enum" DEFAULT 'M', "register_date" TIMESTAMP, "kyc_date" TIMESTAMP, "is_suspect" "public"."tbl_customers_is_suspect_enum" NOT NULL DEFAULT '0', "scan_date" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_374ee93a6b983572078b1ae8cbb" UNIQUE ("customer_id"), CONSTRAINT "PK_b4be48012ba704d9dd68114c270" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "customers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP DEFAULT now(), "customer_id" bigint NOT NULL, "customer_ref_id" character varying, "customer_name" character varying, "status" smallint NOT NULL, "phone_no" character varying, "available_balance" numeric(32,3) NOT NULL DEFAULT '0', "postal_code" character varying, "email" character varying, "customer_type" character varying, "date_of_birth" character varying, "gender" character varying, "created_date" character varying, "approved_date" character varying, "last_update_time" character varying, "unlink_bank" character varying(10) DEFAULT '', "relink_bank" character varying(10) DEFAULT '', "is_suspect" "public"."customers_is_suspect_enum" NOT NULL DEFAULT '0', "scan_date" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_6c444ce6637f2c1d71c3cf136c1" UNIQUE ("customer_id"), CONSTRAINT "PK_133ec679a801fab5e070f73d3ea" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "group_role" ("role_id" uuid NOT NULL, "group_id" uuid NOT NULL, CONSTRAINT "PK_34b9a049ae09a85e87e7f18787b" PRIMARY KEY ("role_id", "group_id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_23e6ccf814c8fb5704dc35bda8" ON "group_role" ("role_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_e9d49994467a645560fce4bcca" ON "group_role" ("group_id") `);
        await queryRunner.query(`CREATE TABLE "group_user" ("user_id" uuid NOT NULL, "group_id" uuid NOT NULL, CONSTRAINT "PK_8c8ce37e281754b6d2b50af9561" PRIMARY KEY ("user_id", "group_id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_0837be536f0f518052a7bef2e0" ON "group_user" ("user_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_d339f18d53e39b898da78bbabb" ON "group_user" ("group_id") `);
        await queryRunner.query(`ALTER TABLE "group_role" ADD CONSTRAINT "FK_23e6ccf814c8fb5704dc35bda8d" FOREIGN KEY ("role_id") REFERENCES "tbl_role"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "group_role" ADD CONSTRAINT "FK_e9d49994467a645560fce4bcca4" FOREIGN KEY ("group_id") REFERENCES "tbl_group"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "group_user" ADD CONSTRAINT "FK_0837be536f0f518052a7bef2e04" FOREIGN KEY ("user_id") REFERENCES "tbl_users"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "group_user" ADD CONSTRAINT "FK_d339f18d53e39b898da78bbabba" FOREIGN KEY ("group_id") REFERENCES "tbl_group"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "group_user" DROP CONSTRAINT "FK_d339f18d53e39b898da78bbabba"`);
        await queryRunner.query(`ALTER TABLE "group_user" DROP CONSTRAINT "FK_0837be536f0f518052a7bef2e04"`);
        await queryRunner.query(`ALTER TABLE "group_role" DROP CONSTRAINT "FK_e9d49994467a645560fce4bcca4"`);
        await queryRunner.query(`ALTER TABLE "group_role" DROP CONSTRAINT "FK_23e6ccf814c8fb5704dc35bda8d"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_d339f18d53e39b898da78bbabb"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_0837be536f0f518052a7bef2e0"`);
        await queryRunner.query(`DROP TABLE "group_user"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_e9d49994467a645560fce4bcca"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_23e6ccf814c8fb5704dc35bda8"`);
        await queryRunner.query(`DROP TABLE "group_role"`);
        await queryRunner.query(`DROP TABLE "customers"`);
        await queryRunner.query(`DROP TABLE "tbl_customers"`);
        await queryRunner.query(`DROP TABLE "tbl_group"`);
        await queryRunner.query(`DROP TABLE "tbl_users"`);
        await queryRunner.query(`DROP TABLE "tbl_role"`);
        await queryRunner.query(`DROP TABLE "tbl_case"`);
    }

}
