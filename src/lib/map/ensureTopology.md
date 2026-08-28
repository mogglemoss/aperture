## ensureTopology.ts

**Purpose:** Shared idempotent "ensure a node is visible / ensure one `wh` edge between two nodes" primitives, driven through `commitMapEvent` (one `ap_map_event` per change). Reused by the Thera fold and the fixed-destination resolve.
**File:** `src/lib/map/ensureTopology.ts` (no `server-only` — worker-safe, like `mutations/core.ts`)

---

### ensureSystemVisible(tx, mapId, systemId, characterId, pos): Promise<EnsureSystemOutcome>
Ensure `(mapId, systemId)` exists and is visible on the caller's transaction. Upserts on the `(map_id, system_id)` unique index: a hidden row is flipped visible with alias/tag/status/intel/position preserved; a fresh row is inserted at `pos`. Runs `assignTagOnAdd` inside the same event so an ABC tag rides in `system.added`. Emits `system.added` only when the system was not already visible.

**Returns:** `{ mapSystemId, payload? }` — `payload` is the `system.added` event when newly added, undefined on an idempotent re-visit.

---

### ensureWhConnection(tx, mapId, sourceMapSystemId, targetMapSystemId, characterId): Promise<EnsureConnectionOutcome>
Ensure a single `wh`/`fresh` connection links the two `ap_map_system` ids. Skips creation when an edge already links the pair in either direction. Always returns the connection id (existing or freshly created), so callers can link a signature to it. Either way it then runs the nomadic-chains universal fan-out on the pair (`fanOutChainMembershipsOnConnection`; source→target = the charting direction as the caller observed it, independent of any stored row direction): every chain holding a real occurrence of the source system accretes the target, idempotently.

**Returns:** `{ mapConnectionId, payload, memberPayloads }` — `payload` is the `connection.create` event when newly created, `null` when the pair was already linked; `memberPayloads` are the committed `chain.member.added` events (possibly empty).

---

### tagOnConnect(mapId, sourceMapSystemId, targetMapSystemId, characterId, payloads): Promise<void>
Post-commit 0121 child-tag follow-up: roots the target under its source and emits the tag as a standalone `system.updated` (its own transaction — call only after the outer transaction commits), pushing that payload onto `payloads`. No-op for ABC / unschemed maps. Best-effort: a tag failure is logged at `warn` and never throws.

---

### Types
- `EnsureSystemOutcome` — `{ mapSystemId: bigint; payload?: MapEventPayload }`.
- `EnsureConnectionOutcome` — `{ mapConnectionId: bigint; payload: MapEventPayload | null; memberPayloads: MapEventPayload[] }`.

### Depends On
- `commitMapEvent`, `Tx` (`./mutations/core`); `fanOutChainMembershipsOnConnection` (`./mutations/chains`); `buildSystemNode`; `assignTagOnAdd` / `assignTagOnConnect` (`@/lib/tagging/service`); `apMapSystem` / `apMapConnection` (Drizzle schema).
