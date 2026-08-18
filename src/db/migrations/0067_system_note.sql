CREATE TYPE "public"."system_note_event_kind" AS ENUM('create', 'update', 'delete');--> statement-breakpoint
CREATE TABLE "ap_system_note" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"system_id" integer NOT NULL,
	"body" text NOT NULL,
	"created_by_character_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ap_system_note_event" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"note_id" bigint NOT NULL,
	"system_id" integer NOT NULL,
	"character_id" bigint,
	"kind" "system_note_event_kind" NOT NULL,
	"payload" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ap_system_note" ADD CONSTRAINT "ap_system_note_system_id_universe_system_id_fk" FOREIGN KEY ("system_id") REFERENCES "public"."universe_system"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ap_system_note" ADD CONSTRAINT "ap_system_note_created_by_character_id_ap_character_id_fk" FOREIGN KEY ("created_by_character_id") REFERENCES "public"."ap_character"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ap_system_note_event" ADD CONSTRAINT "ap_system_note_event_character_id_ap_character_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."ap_character"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ap_system_note_system_id_idx" ON "ap_system_note" USING btree ("system_id");--> statement-breakpoint
CREATE INDEX "ap_system_note_event_note_id_idx" ON "ap_system_note_event" USING btree ("note_id");--> statement-breakpoint
CREATE INDEX "ap_system_note_event_character_id_idx" ON "ap_system_note_event" USING btree ("character_id");