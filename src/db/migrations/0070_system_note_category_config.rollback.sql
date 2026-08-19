-- Manual rollback for 0070_system_note_category_config.sql. Restores the
-- system_note_category enum over the text column. Fails if any row holds a
-- value outside the enum (i.e. a custom config key) — clear those first.
--   psql "$DATABASE_URL" -f src/db/migrations/0070_system_note_category_config.rollback.sql
CREATE TYPE "system_note_category" AS ENUM('intel', 'journal', 'bounty', 'logistics', 'warning');
--> statement-breakpoint
ALTER TABLE "ap_system_note" ALTER COLUMN "category" SET DATA TYPE "system_note_category" USING "category"::"system_note_category";
