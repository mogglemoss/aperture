## route.ts — POST /api/map/[mapId]/chains

**Purpose:** Create a chain tab (nomadic-chains).
**File:** `src/app/api/map/[mapId]/chains/route.ts`

### POST
Creates a chain (via `createChain`) and returns `{ ok, data: <chain.created payload>, eventId }`.

**Body:** `{ name: string (1..MAP_CHAIN_NAME_MAX_LENGTH), kind: 'personal' | 'shared' }`.

**Access:** `map_update` right (view authority — any viewer) for `personal`; `shared` additionally requires `canManageMap` (403 otherwise; the mutation layer re-checks via the `canManage` flag).

**Responses:** 200 ok, 400 invalid body / mutation error, 401 unauthenticated, 403 shared without management, 404 map not found.
