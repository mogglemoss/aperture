CREATE TYPE "public"."chain_kind" AS ENUM('personal', 'shared');--> statement-breakpoint
CREATE TABLE "ap_map_chain" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"map_id" bigint NOT NULL,
	"name" text NOT NULL,
	"kind" "chain_kind" NOT NULL,
	"owner_character_id" bigint,
	"created_by_character_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ap_map_chain_kind_owner_chk" CHECK (("ap_map_chain"."kind" = 'personal' and "ap_map_chain"."owner_character_id" is not null)
          or ("ap_map_chain"."kind" = 'shared' and "ap_map_chain"."owner_character_id" is null))
);
--> statement-breakpoint
CREATE TABLE "ap_map_chain_member" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"chain_id" bigint NOT NULL,
	"map_system_id" bigint NOT NULL,
	"parent_member_id" bigint,
	"via_connection_id" bigint,
	"pointer_chain_id" bigint
);
--> statement-breakpoint
ALTER TABLE "ap_user" ADD COLUMN "chain_blob_threshold" integer DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TABLE "ap_map_chain" ADD CONSTRAINT "ap_map_chain_map_id_ap_map_id_fk" FOREIGN KEY ("map_id") REFERENCES "public"."ap_map"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ap_map_chain" ADD CONSTRAINT "ap_map_chain_owner_character_id_ap_character_id_fk" FOREIGN KEY ("owner_character_id") REFERENCES "public"."ap_character"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ap_map_chain" ADD CONSTRAINT "ap_map_chain_created_by_character_id_ap_character_id_fk" FOREIGN KEY ("created_by_character_id") REFERENCES "public"."ap_character"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ap_map_chain_member" ADD CONSTRAINT "ap_map_chain_member_chain_id_ap_map_chain_id_fk" FOREIGN KEY ("chain_id") REFERENCES "public"."ap_map_chain"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ap_map_chain_member" ADD CONSTRAINT "ap_map_chain_member_map_system_id_ap_map_system_id_fk" FOREIGN KEY ("map_system_id") REFERENCES "public"."ap_map_system"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ap_map_chain_member" ADD CONSTRAINT "ap_map_chain_member_parent_member_id_ap_map_chain_member_id_fk" FOREIGN KEY ("parent_member_id") REFERENCES "public"."ap_map_chain_member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ap_map_chain_member" ADD CONSTRAINT "ap_map_chain_member_via_connection_id_ap_map_connection_id_fk" FOREIGN KEY ("via_connection_id") REFERENCES "public"."ap_map_connection"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ap_map_chain_member" ADD CONSTRAINT "ap_map_chain_member_pointer_chain_id_ap_map_chain_id_fk" FOREIGN KEY ("pointer_chain_id") REFERENCES "public"."ap_map_chain"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ap_map_chain_map_id_idx" ON "ap_map_chain" USING btree ("map_id");--> statement-breakpoint
CREATE INDEX "ap_map_chain_member_chain_id_idx" ON "ap_map_chain_member" USING btree ("chain_id");--> statement-breakpoint
CREATE INDEX "ap_map_chain_member_map_system_id_idx" ON "ap_map_chain_member" USING btree ("map_system_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ap_map_chain_member_chain_system_uq" ON "ap_map_chain_member" USING btree ("chain_id","map_system_id") WHERE "ap_map_chain_member"."pointer_chain_id" is null;