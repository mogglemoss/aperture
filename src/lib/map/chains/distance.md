## distance.ts (chains)

**Purpose:** Pure chains-near-me distance math (nomadic-chains) — multi-source gate-jump BFS + per-chain min-over-exits reducer, plus the shared badge types/formatting. Distance is unweighted gate jumps for orientation; the route module owns safety-weighted routing.
**File:** `src/lib/map/chains/distance.ts`

No `server-only`, no DB, no React — the chain-distances API route supplies the memoized gate adjacency; client components import only the types + display helper. `ChainExitSet`, `ChainDistances`, and `ChainDistanceBadge` are re-exported from `@/types`.

---

### isKspaceSecurity(security: string | null): boolean
K-space test on the `universe_system.security` label: everything but the `C*` J-space classes counts (the same rule as the blob's exit summary). Null ⇒ false.

---

### multiSourceGateBfs(adjacency, origins): Map<number, number>
Gate-jump distance from the nearest of `origins` to every reachable system — every origin seeds the queue at distance 0, so one O(V+E) pass answers min-over-pairs for every chain at once. Unreachable systems are absent; an origin outside the adjacency still seeds at 0 (an exit equal to an origin is always distance 0).

---

### resolveOriginSystemIds(args): number[]
The pilot's origin set. K-space pilot ⇒ `[pilotSystemId]`. J-space pilot ⇒ the deduped k-space exits of every chain in `containingChainIds` (the visible chains holding the pilot's system as a real occurrence). Empty ⇔ distances are unknown (badges hide).

**Parameters:** `{ pilotSystemId, pilotIsKspace, containingChainIds: ReadonlySet<string>, chains: ChainExitSet[] }`.

---

### computeChainDistances(args): { distances, nearestExits }
The reducer: one BFS, then per chain the min over its `exitSystemIds`. A chain with no exits — or none gate-reachable — reduces to null (rendered "—", never 0). `nearestExits` carries the argmin exit's solar-system id (ties break to the first-listed exit, i.e. member creation order); null exactly where `distances` is null. Both keyed by chain id.

**Parameters:** `{ adjacency, originSystemIds, chains: ChainExitSet[] }`.

---

### formatChainDistanceTooltip(badge: ChainDistanceBadge | null): string
"N jumps to <exit> via gates" (falling back to "the nearest k-space exit" when the name is unresolvable), or the no-exit explanation for a "—" badge.

---

### Types
- `ChainExitSet` — `{ chainId, exitSystemIds }`: one chain reduced to its k-space member systems (EVE solar-system ids, member order).
- `ChainDistances` — the endpoint payload `{ characterId, originSystemId, distances, nearestExits }`. `originSystemId` null ⇔ distances unknown (badges hide); a `distances` value of null ⇔ no gate-reachable k-space exit ("—").
- `ChainDistanceBadge` — `{ jumps, exitName }`: the display slice one badge renders.
