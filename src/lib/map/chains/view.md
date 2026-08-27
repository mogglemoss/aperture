## view.ts (chains)

**Purpose:** Pure derivation of one chain tab's canvas content (chain mode) — viewData slices in, positioned occurrence / pointer-leaf view-models + edges out, for `MapCanvas` to map onto xyflow.
**File:** `src/lib/map/chains/view.ts`

No `server-only`, no DB, no React. The view-model types (`ChainOccurrenceNode`, `ChainPointerLeaf`, `ChainCanvasEdge`, `ChainCanvasModel`) are re-exported from `@/types`.

---

### chainOccurrenceNodeId(chainId, mapSystemId): string
The xyflow id of a real occurrence node: `chainId:mapSystemId` (one node per membership, keyed canonically — the settled design).

### chainPointerNodeId(memberId): string
The xyflow id of a pointer-leaf pill: `chainptr:<memberId>`. Keyed on the member because a *loop* pointer names a system that already really occurs in the same chain, so the occurrence scheme would collide.

---

### sortChainsForTabs(chains: readonly MapChain[]): MapChain[]
Tab order for the strip: shared chains first, then personal, each by creation (id) order — mirrors the forest block order so tabs and the All view never disagree. Never keys on size or name.

---

### buildChainCanvas(args): ChainCanvasModel
Derives one chain's canvas model: runs `layoutChainTree` over `members` and resolves each member against the canonical rows.

**Parameters:** `{ chainId, chains, members, systems, liveConnectionIds, params, orientation }` — `chains` are the viewer-visible chains (pointer-name resolution only); `liveConnectionIds` the ids of connections currently in the view.

**Behaviour:**
- A real occurrence becomes a `ChainOccurrenceNode` carrying the canonical `MapSystemNode` (`system`); one whose system is missing from `systems` is skipped, with its incident edges (defensive — members always reference visible systems).
- A pointer-leaf becomes a `ChainPointerLeaf` (`isLoop` ⇔ it points back into its own chain) and keeps its pill even when the target system or chain is unresolvable (`targetSystemName` falls back to the raw id; `targetChainName` null for a chain invisible to the viewer, rendered as "another chain").
- Each tree edge keys on its live backing connection id when `viaConnectionId` is in `liveConnectionIds` (`connectionId` set — edge selection then maps straight onto the canonical inspector selection; a connection backs at most one link per chain), else `chainedge:<childMemberId>` with `connectionId: null`.

**Returns:** `{ chainId, occurrences, pointers, edges, width, height }` — node coords are block-local top-left in oriented space (from `layoutChainTree`).

### Depends On
- `layoutChainTree` (`./layout`)
- `MapChain`, `MapChainMember`, `MapSystemNode` types from `@/types`
