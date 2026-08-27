-- Catalog the nomadic-chains audit events in `ap_event_kind`.
--
-- Chain-tab lifecycle (create / rename / delete) and membership accretion each
-- land as one `ap_map_event` (kinds `chain.*`). `ap_map_event.kind` is not
-- FK-constrained to this catalog, so the inserts work without these rows; they
-- exist so the admin history filter lists the new `chain` category.
--
-- Rollback: src/db/migrations/0073_chain_event_kinds.rollback.sql.

INSERT INTO "ap_event_kind" ("kind", "category") VALUES
  ('chain.created', 'chain'),
  ('chain.renamed', 'chain'),
  ('chain.deleted', 'chain'),
  ('chain.member.added', 'chain')
ON CONFLICT ("kind") DO NOTHING;
