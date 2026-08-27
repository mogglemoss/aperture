## chain-apply-event.test.ts

**Purpose:** Unit coverage for the pure `applyEvent` reducer's nomadic-chains handling — the `chain.*` events plus the two server-side prunes the reducer mirrors without an event of their own.
**File:** `tests/unit/chain-apply-event.test.ts`

No DB required (pure function). Builds minimal `MapViewData` fixtures with `chains` / `chainMembers`.

Cases:
1. **chain.created** — appends the chain (payload `chainKind` → `MapChain.kind`); re-delivery replaces by id, never duplicates.
2. **chain.renamed** — merges `name` + `updatedAt` into the matching chain only.
3. **chain.deleted** — drops the chain and its members, and nulls `pointerChainId` on other chains' pointer-leaves that named it (mirrors the member CASCADE + pointer SET NULL).
4. **chain.member.added** — upserts by id: append on first delivery, replace on the via-connection backfill re-broadcast.
5. **system.removed** — prunes the removed system's members plus their whole descendant closure (child, grandchild, pointer-leaf under the branch) across every chain, leaving unrelated members; mirrors the server's delete + parent-FK CASCADE.
6. **connection.delete** — nulls `viaConnectionId` on members that traversed the deleted connection; the members themselves survive (the tree outlives its wormholes).
