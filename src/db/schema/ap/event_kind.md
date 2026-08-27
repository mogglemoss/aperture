## event_kind.ts

**Purpose:** The `ap_event_kind` lookup table — the catalog of valid `ap_map_event.kind` values, grouped by category for admin-UI filtering.
**File:** `src/db/schema/ap/event_kind.ts`

---

### apEventKind
`pgTable('ap_event_kind', …)`:
- `kind` — `text` PK, e.g. `system.added`, `connection.create`, `signature.update`.
- `category` — `text`, required; groups kinds for the history UI (`system` | `connection` | `signature` | `note` | `chain` | `map` | `access`).

Seed rows are inserted by migrations (`0004_map_schema.sql` and the later kind-addition migrations 0014 / 0044 / 0057 / 0061 / 0073), not at runtime.
