## route.ts — POST /api/map/[mapId]/systems

**Purpose:** Add a solar system to a map.
**File:** `src/app/api/map/[mapId]/systems/route.ts`

### POST
Adds a solar system to the map (via `addSystemWithStargateLinks`). Inserts a new `ap_map_system` row, or reactivates a hidden one (same `(mapId, systemId)` unique pair), then auto-creates a `stargate` connection to every system already on the map that shares an in-game stargate with it. Returns `{ ok, data: { payloads }, eventId: 0 }` where `data.payloads` is the ordered event list (`system.added` first, then each gate-link `connection.create`). Consumers fold `data.payloads` like a bulk paste; wormhole systems add with a single `system.added` payload (no gate edges).

`chainId` charts the add into a chain tab (nomadic-chains): a `chain.member.added` commits in the same transaction and rides `payloads` right after the `system.added`. `parentMemberId` is the member charted from — omit for the chain's root; requires `chainId`. A chain-guard failure (foreign personal chain, second anchor, bad parent) fails and rolls back the whole add.

**Body:** `{ systemId: number, positionX?: number, positionY?: number, chainId?: string, parentMemberId?: string }`

**Responses:** 200 ok, 400 mutation error, 401 unauthenticated, 404 map not found.
