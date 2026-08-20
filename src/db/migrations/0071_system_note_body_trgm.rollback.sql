-- Manual rollback for 0071_system_note_body_trgm.sql. Drops the trigram index
-- backing the notes-browser body search. The pg_trgm extension is left in
-- place (other objects may come to depend on it).
--   psql "$DATABASE_URL" -f src/db/migrations/0071_system_note_body_trgm.rollback.sql
DROP INDEX IF EXISTS "ap_system_note_body_trgm_idx";
