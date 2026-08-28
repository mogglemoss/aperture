## route.ts — POST /api/map/[mapId]/connections

**Purpose:** Create a wormhole/stargate/jumpbridge connection between two map systems.
**File:** `src/app/api/map/[mapId]/connections/route.ts`

### POST
Creates a new `ap_map_connection` row and emits `connection.create`. Returns `{ ok, data, eventId }` where `data` is the full edge body. On an auto-tagging `0121` map, after a successful create it calls `assignTagOnConnect`; if the new edge roots an untagged child, it emits a separate `system.updated` event with the assigned tag (best-effort — a tagging failure never fails the connection).

A `scope: 'wh'` create runs `createConnectionWithChainMembership`: the universal chain fan-out (nomadic-chains) commits in the same transaction — every chain holding a real occurrence of the SOURCE endpoint accretes the target (source→target = the charting direction; a real occurrence in the earliest holder, pointer-leaves elsewhere). No chain context rides the body. The response stays the `connection.create` payload; the `chain.member.added` events reach every client — the initiator included — over realtime. Non-`wh` scopes accrete no membership.

**Body:** `{ sourceMapSystemId: string, targetMapSystemId: string, scope, massStatus?, jumpMassClass?, eolStage?, preserveMass?, isRolling?, isStatic? }` — system ids are bigint strings; scope is required.

**Responses:** 200 ok, 400 mutation error / invalid ids, 401 unauthenticated, 404 map not found.
