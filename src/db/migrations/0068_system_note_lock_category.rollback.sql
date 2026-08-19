-- Manual rollback for 0068_system_note_lock_category.sql. Drops the lock,
-- category, and last-editor columns from global system notes.
--   psql "$DATABASE_URL" -f src/db/migrations/0068_system_note_lock_category.rollback.sql
ALTER TABLE "ap_system_note" DROP COLUMN IF EXISTS "last_edited_by_character_id";
--> statement-breakpoint
ALTER TABLE "ap_system_note" DROP COLUMN IF EXISTS "locked";
--> statement-breakpoint
ALTER TABLE "ap_system_note" DROP COLUMN IF EXISTS "category";
--> statement-breakpoint
DROP TYPE IF EXISTS "system_note_category";
