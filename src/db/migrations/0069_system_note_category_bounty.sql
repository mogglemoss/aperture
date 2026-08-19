ALTER TABLE "ap_system_note" ALTER COLUMN "category" SET DATA TYPE text;--> statement-breakpoint
UPDATE "ap_system_note" SET "category" = 'bounty' WHERE "category" = 'pve';--> statement-breakpoint
DROP TYPE "public"."system_note_category";--> statement-breakpoint
CREATE TYPE "public"."system_note_category" AS ENUM('intel', 'journal', 'bounty', 'logistics', 'warning');--> statement-breakpoint
ALTER TABLE "ap_system_note" ALTER COLUMN "category" SET DATA TYPE "public"."system_note_category" USING "category"::"public"."system_note_category";
