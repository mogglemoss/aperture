-- Manual rollback for 0073_chain_event_kinds.sql. Removes the chain event-kind
-- catalog rows.
--   psql "$DATABASE_URL" -f src/db/migrations/0073_chain_event_kinds.rollback.sql
DELETE FROM "ap_event_kind" WHERE "kind" IN ('chain.created', 'chain.renamed', 'chain.deleted', 'chain.member.added');
