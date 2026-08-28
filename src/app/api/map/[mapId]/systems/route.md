## route.ts — POST /api/map/[mapId]/systems

**Purpose:** Add a solar system to a map.
**File:** `src/app/api/map/[mapId]/systems/route.ts`

### POST
Adds a solar system to the map (via `addSystemWithStargateLinks`). Inserts a new `ap_map_system` row, or reactivates a hidden one (same `(mapId, systemId)` unique pair), then auto-creates a `stargate` connection to every system already on the map that shares an in-game stargate with it. Returns `{ ok, data: { payloads }, eventId: 0 }` where `data.payloads` is the ordered event list (`system.added` first, then each gate-link `connection.create`). Consumers fold `data.payloads` like a bulk paste; wormhole systems add with a single `system.added` payload (no gate edges).

`chainId` charts the add into a chain tab (nomadic-chains): the `chain.member.added` events commit in the same transaction and ride `payloads` right after the `system.added`. `parentMemberId` is the member charted from — the add fans out to every chain holding that member's system (universal fan-out: earliest chain gets the real occurrence, later holders pointer-leaves; the hinted chain is guard + from-system, not a propagation limit). Omit `parentMemberId` for the chain's root — the chain gains its anchor and the seed walk adopts the anchor's existing wormhole subtree (one member payload each). Requires `chainId`. A chain-guard failure (foreign personal chain, second anchor, bad parent) fails and rolls back the whole add.

**Body:** `{ systemId: number, positionX?: number, positionY?: number, chainId?: string, parentMemberId?: string }`

**Responses:** 200 ok, 400 mutation error, 401 unauthenticated, 404 map not found.
