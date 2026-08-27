## map_chain.ts

**Purpose:** The `ap_map_chain` table — a chain tab: the identity of one tree of occurrences over the map's canonical graph (nomadic-chains).
**File:** `src/db/schema/ap/map_chain.ts`

---

### apMapChain
`pgTable('ap_map_chain', …)`:
- `id` — `bigserial` PK.
- `map_id` — `bigint` FK → `ap_map.id` `ON DELETE CASCADE`.
- `name` — `text`, not null; ≤40 chars enforced app-layer (Zod).
- `kind` — `chain_kind` enum (`personal` | `shared`). `personal` chains belong to one character and render only for them; `shared` chains are director-created and render for every viewer.
- `owner_character_id` — `bigint` FK → `ap_character.id` `ON DELETE CASCADE`, nullable. Non-null ⇔ `personal` (CHECK `ap_map_chain_kind_owner_chk`). CASCADE because a personal tab is presentation state of one account, not corp intel — erasing the character takes the tab and its memberships.
- `created_by_character_id` — `bigint` FK → `ap_character.id` `ON DELETE SET NULL` (audit; who made a shared chain; never cascade-wipes it).
- `created_at` / `updated_at` — `timestamptz`, default `now()`.

**Index:** `map_id` (`ap_map_chain_map_id_idx`).

### Notes
- Chains are trees, never merged; the root member (see `map_chain_member.ts`) is the chain's anchor.
- Plan: `docs/plans/nomadic-chains.md`. Migration 0072.
