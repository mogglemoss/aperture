## system_note.ts

**Purpose:** The `ap_system_note` table — global system notes: free-text intel entries on a universe system, deployment-global (shared across maps).
**File:** `src/db/schema/ap/system_note.ts`

---

### apSystemNote
`pgTable('ap_system_note', …)`:
- `id` — `bigserial` PK.
- `system_id` — `integer` FK → `universe_system.id` `ON DELETE RESTRICT` (a static system in use must not be deletable).
- `body` — `text`, not null. The free-text note.
- `created_by_character_id` — `bigint` FK → `ap_character.id` `ON DELETE SET NULL` (audit; never cascade-wipe intel when a character is erased).
- `created_at` / `updated_at` — `timestamptz`, default `now()`.

**Index:** `system_id` (`ap_system_note_system_id_idx`) for the per-system module read.

### Notes
- Keyed on the static system alone (no `map_id`): a note written from any map is readable from every map, whenever the system is encountered again. Contrast `ap_map_system.intel_notes`, which is per-map.
- A journal of entries, each with its own author and timestamps — not a single per-system blob.
- Every mutation is recorded in `ap_system_note_event` (see `system_note_event.ts`).
