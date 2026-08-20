-- The notes browser runs an unanchored ILIKE '%term%' over every note body;
-- without a trigram index that is a full scan per debounce tick. pg_trgm ships
-- in contrib on the deployment image. DDL-only (like the effective-dogma view),
-- so the index is not modeled in the Drizzle schema.
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ap_system_note_body_trgm_idx" ON "ap_system_note" USING gin ("body" gin_trgm_ops);
