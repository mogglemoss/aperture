## map_chain_member.ts

**Purpose:** The `ap_map_chain_member` table — one occurrence of a canonical system inside a chain's tree (nomadic-chains).
**File:** `src/db/schema/ap/map_chain_member.ts`

---

### apMapChainMember
`pgTable('ap_map_chain_member', …)`:
- `id` — `bigserial` PK.
- `chain_id` — `bigint` FK → `ap_map_chain.id` `ON DELETE CASCADE`.
- `map_system_id` — `bigint` FK → `ap_map_system.id` `ON DELETE CASCADE`. The canonical row keeps owning signatures/status/alias/lock/notes, shared across every occurrence of the system.
- `parent_member_id` — `bigint` self-FK `ON DELETE CASCADE`, nullable. NULL ⇔ the chain's root (its anchor). The parent records *how it was charted* — the member you came from — which an undirected graph cannot reproduce; membership is therefore written at charting time, never derived. CASCADE prunes a whole branch in one delete.
- `via_connection_id` — `bigint` FK → `ap_map_connection.id` `ON DELETE SET NULL`, nullable. The connection traversed to reach this member; SET NULL so a collapsed hole leaves the occurrence in place (the tree outlives its wormholes).
- `pointer_chain_id` — `bigint` FK → `ap_map_chain.id` `ON DELETE SET NULL`, nullable. Non-null ⇔ pointer-leaf: the branch terminates with a "continues in <chain> →" pill instead of recursively unfolding the other chain's subtree. SET NULL degrades the pill to a plain leaf when that chain is deleted.

**Indexes:** `chain_id`, `map_system_id`; **partial unique** `(chain_id, map_system_id) WHERE pointer_chain_id IS NULL` (`ap_map_chain_member_chain_system_uq`) — one *real* occurrence per system per chain, with pointer-leaves exempt because a loop pointer-leaf names a system that already occurs in the same chain.

### Notes
- Plan: `docs/plans/nomadic-chains.md`. Migration 0072.
