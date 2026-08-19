-- Manual rollback for 0069_system_note_category_bounty.sql. Restores the
-- `pve` category value (renaming any `bounty` rows back).
--   psql "$DATABASE_URL" -f src/db/migrations/0069_system_note_category_bounty.rollback.sql
ALTER TABLE "ap_system_note" ALTER COLUMN "category" SET DATA TYPE text;
--> statement-breakpoint
UPDATE "ap_system_note" SET "category" = 'pve' WHERE "category" = 'bounty';
--> statement-breakpoint
DROP TYPE IF EXISTS "system_note_category";
--> statement-breakpoint
CREATE TYPE "system_note_category" AS ENUM('intel', 'journal', 'pve', 'logistics', 'warning');
--> statement-breakpoint
ALTER TABLE "ap_system_note" ALTER COLUMN "category" SET DATA TYPE "system_note_category" USING "category"::"system_note_category";
