-- Manual rollback for 0067_system_note.sql. Drops the global system-notes
-- table and its accountability log.
--   psql "$DATABASE_URL" -f src/db/migrations/0067_system_note.rollback.sql
DROP TABLE IF EXISTS "ap_system_note_event";
--> statement-breakpoint
DROP TABLE IF EXISTS "ap_system_note";
--> statement-breakpoint
DROP TYPE IF EXISTS "system_note_event_kind";
