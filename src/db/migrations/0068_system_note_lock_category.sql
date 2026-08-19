CREATE TYPE "public"."system_note_category" AS ENUM('intel', 'journal', 'pve', 'logistics', 'warning');--> statement-breakpoint
ALTER TABLE "ap_system_note" ADD COLUMN "category" "system_note_category";--> statement-breakpoint
ALTER TABLE "ap_system_note" ADD COLUMN "locked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ap_system_note" ADD COLUMN "last_edited_by_character_id" bigint;--> statement-breakpoint
ALTER TABLE "ap_system_note" ADD CONSTRAINT "ap_system_note_last_edited_by_character_id_ap_character_id_fk" FOREIGN KEY ("last_edited_by_character_id") REFERENCES "public"."ap_character"("id") ON DELETE set null ON UPDATE no action;