## apply-event.test.ts

**Purpose:** Unit coverage for the pure `applyEvent` reducer across the core canvas event kinds — upsert/merge/remove semantics per kind, immutability of the input state, and no-op behaviour for unknown ids and canvas-less kinds.
**File:** `tests/unit/apply-event.test.ts`

No DB required (pure function). Builds minimal `MapViewData` fixtures (`makeState` + system/connection/signature fixtures).

Coverage by kind:
- `system.added` — append; replace-by-id on re-activation; input state not mutated; signatures untouched (they hydrate via fetch, not the event).
- `system.removed` — remove by id; no-op for an unknown id.
- `system.updated` — partial-patch merge (only provided fields), lock-attribution clear on unlock, position fields, `intelNotes` + `rallyAt`; no-op for an unknown id.
- `connection.create` — append; upsert on duplicate id (no duplicate edge / React key collision).
- `connection.update` — partial merge including `eolAt`; no-op for an unknown id.
- `connection.delete` — remove by id.
- `map.update` — name applies when present, no-op otherwise.
- `signature.create` / `signature.update` / `signature.delete` — append/upsert, field-merge (including null-to-clear), remove.
- No-op kinds (`map.create`, `map.delete`, `access.*`, `share.*`, …) — return the same state reference.

(The chain-event cases live in `tests/unit/chain-apply-event.test.ts`; the connection-delete signature cascade in `tests/unit/applyEvent.test.ts`.)
