## route.ts — PATCH/DELETE /api/map/[mapId]/chains/[chainId]

**Purpose:** Rename or delete a chain tab (nomadic-chains).
**File:** `src/app/api/map/[mapId]/chains/[chainId]/route.ts`

`[chainId]` is `ap_map_chain.id`.

### PATCH
Renames the chain (via `renameChain`). **Body:** `{ name: string (1..MAP_CHAIN_NAME_MAX_LENGTH) }`. Returns `{ ok, data: <chain.renamed payload>, eventId }`.

### DELETE
Deletes the chain (via `deleteChain`) — memberships go with it (pointer-leaves in other chains degrade to plain leaves); canonical systems are untouched. Returns `{ ok, data: <chain.deleted payload>, eventId }`.

**Access (both):** `map_update` right, then per-kind in the mutation layer — a `personal` chain only by its owner (a foreign one fails with `Chain not found.`, never leaking existence), a `shared` chain only with `canManageMap` (resolved here and passed as `canManage`).

**Responses:** 200 ok, 400 invalid id/body or mutation-layer refusal (foreign personal chain, shared without management), 401 unauthenticated, 404 map not found.
