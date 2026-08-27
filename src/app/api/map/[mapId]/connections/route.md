## route.ts — POST /api/map/[mapId]/connections

**Purpose:** Create a wormhole/stargate/jumpbridge connection between two map systems.
**File:** `src/app/api/map/[mapId]/connections/route.ts`

### POST
Creates a new `ap_map_connection` row and emits `connection.create`. Returns `{ ok, data, eventId }` where `data` is the full edge body. On an auto-tagging `0121` map, after a successful create it calls `assignTagOnConnect`; if the new edge roots an untagged child, it emits a separate `system.updated` event with the assigned tag (best-effort — a tagging failure never fails the connection).

`chainId` + `sourceMemberId` (passed together) chart the draw from a chain member (nomadic-chains): the route runs `createConnectionWithChainMembership` instead, committing the connection and the membership write-through (a real occurrence, or a pointer-leaf when the far side is already chained) in one transaction. The response stays the `connection.create` payload; the `chain.member.added` reaches every client — the initiator included — over realtime.

**Body:** `{ sourceMapSystemId: string, targetMapSystemId: string, scope, massStatus?, jumpMassClass?, isEol?, preserveMass?, isRolling?, chainId?, sourceMemberId? }` — system ids are bigint strings; scope is required.

**Responses:** 200 ok, 400 mutation error / invalid ids, 401 unauthenticated, 404 map not found.
