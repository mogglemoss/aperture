## route.ts — POST /api/map/[mapId]/chains

**Purpose:** Create a chain tab (nomadic-chains).
**File:** `src/app/api/map/[mapId]/chains/route.ts`

### POST
Creates a chain (via `createChainWithSeed`) and returns `{ ok, data: { payloads }, eventId: 0 }` — the `chain.created` payload first, then, when `anchorMapSystemId` rides the call, the seeded `chain.member.added` payloads: the anchor (a visible `ap_map_system` of this map) becomes the root and its existing wormhole-connected subtree is adopted in the same transaction. Consumers fold `data.payloads` like a bulk paste. Omitting the anchor creates an empty chain (single payload).

**Body:** `{ name: string (1..MAP_CHAIN_NAME_MAX_LENGTH), kind: 'personal' | 'shared', anchorMapSystemId?: string }`.

**Access:** `map_update` right (view authority — any viewer) for `personal`; `shared` additionally requires `canManageMap` (403 otherwise; the mutation layer re-checks via the `canManage` flag).

**Responses:** 200 ok, 400 invalid body / bad anchor / mutation error, 401 unauthenticated, 403 shared without management, 404 map not found.
