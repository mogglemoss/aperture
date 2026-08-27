-- Manual rollback for 0072_nomadic_chains.sql. Drops the chain tables, the
-- chain_kind enum, and the per-user blob threshold.
--   psql "$DATABASE_URL" -f src/db/migrations/0072_nomadic_chains.rollback.sql
DROP TABLE IF EXISTS "ap_map_chain_member";
--> statement-breakpoint
DROP TABLE IF EXISTS "ap_map_chain";
--> statement-breakpoint
DROP TYPE IF EXISTS "chain_kind";
--> statement-breakpoint
ALTER TABLE "ap_user" DROP COLUMN IF EXISTS "chain_blob_threshold";
