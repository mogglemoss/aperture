## fixedDestination.ts

**Purpose:** Fold a wormhole type's fixed destination (e.g. J377 → Turnur) onto a map from the signature side — placing the destination node + a `wh` connection without visiting the far end.
**File:** `src/lib/map/fixedDestination.ts` (`server-only`)

---

### resolveSignatureDestination(args): Promise<ActionResult<ResolveDestinationResult>>
Resolve the fixed destination of the wormhole signature `sigId` onto `mapId`. Loads the sig joined through `ap_map_system` (a sig on another map isn't found — same ownership gate as `updateSignature`), reads its type's `universe_wormhole.target_system_id`, and — inside one `db.transaction` — ensures the destination system is visible near the sig's system (`ensureSystemVisible`, placed via `findOpenPosition` off the source) and a `wh` connection links them (`ensureWhConnection`). Idempotent: an already-visible node / either-direction edge is reused, so a repeat is a no-op. Emits `tagOnConnect` as a post-commit follow-up. The destination is read server-side, never from the client, keeping the guarantee one-directional (a K162 with a null target never resolves).

**Parameters:**
- `mapId` — target map.
- `sigId` — `ap_map_signature.id` of the wormhole sig to resolve.
- `characterId` — audit FK (null when actor erased).

**Returns:** `ActionResult<{ payloads, connectionId }>` — the committed event payloads for the client to fold + dedupe (wrapper-level `eventId` is `0`), and the ensured/existing `ap_map_connection.id` so the client can link the signature to it. `payloads` also carries any `chain.member.added` events from the universal chain fan-out (`ensureWhConnection` — chains holding the sig's system accrete the destination). Fails when the sig isn't on the map, is untyped, its type has no fixed destination, or the destination is the sig's own system.

---

### type ResolveDestinationResult
`{ payloads: MapEventPayload[]; connectionId: string }`.

### Depends On
- `ensureSystemVisible`, `ensureWhConnection`, `tagOnConnect` (`./ensureTopology`); `findOpenPosition` / `AUTO_SLOT` (`./placement`); `apMapSignature` / `apMapSystem` / `universeWormhole` (Drizzle schema).
