## view.ts (chains)

**Purpose:** Pure derivation of chain-mode canvas content — viewData slices in, positioned occurrence / pointer-leaf view-models + edges out, for one chain tab (`buildChainCanvas`) or the whole All-view forest with blob LOD (`buildForestCanvas`), for `MapCanvas` to map onto xyflow.
**File:** `src/lib/map/chains/view.ts`

No `server-only`, no DB, no React. The view-model types (`ChainOccurrenceNode`, `ChainPointerLeaf`, `ChainCanvasEdge`, `ChainCanvasModel`, `ChainForestBlob`, `ChainForestBlockLabel`, `ChainForestUnassignedTile`, `ChainForestCanvasModel`) are re-exported from `@/types`.

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

---

### buildChainBlobContent(args): ChainBlobContent
One chain's blob content from view data (also the chain-summary sidebar's data source).

**Parameters:** `{ chain, members, systems, criticalConnectionIds }` — `criticalConnectionIds` are the ids of connections currently EOL-critical in the view.

**Behaviour:**
- `systemCount` counts real members (pointer-leaves excluded); members of other chains are ignored.
- `exits` groups the chain's k-space member systems by display class — k-space = the non-`C*` security labels, mapped `H`→`HS`, `L`→`LS`, `0.0`→`NS`, others raw (`P`, `A`) — ordered `HS`, `LS`, `NS`, then the rest alphabetically.
- `hasRally` ⇔ some real member's system has an active rally point.
- `hasEolCritical` ⇔ some member's inbound `viaConnectionId` is in `criticalConnectionIds` — pointer-leaf inbound vias included (they are wormholes charted in this chain).

---

### buildForestCanvas(args): ChainForestCanvasModel
The All-view derivation: every visible chain side by side with per-chain blob collapse, plus the "Unassigned" grid of chainless systems. All output coordinates are absolute (block offsets applied).

**Parameters:** `{ chains, members, systems, liveConnectionIds, criticalConnectionIds, zoom, threshold, expandedChainIds, params, orientation, viewportWidth, blockGap? }` — `threshold` is the viewer's `ap_user.chain_blob_threshold`; `expandedChainIds` the session-local expansion overrides.

**Behaviour:**
- Geometry comes from `layoutForest` over the FULL tree footprints — collapse never re-packs the shelf, so zooming across the blob cutoff or toggling expansion keeps every block in place.
- Members are filtered to the given (viewer-visible) chains; a system with no real occurrence in any of them lands in the "Unassigned" block (`unassigned` tiles + an "Unassigned" caption).
- Per chain, `shouldCollapseChain` picks blob vs tree: a collapsed chain emits one `ChainForestBlob` (content + kind, spanning the block footprint floored at one tile; `expandable` false below the zoom cutoff) and no nodes/edges; an expanded chain emits its resolved occurrences/pointers/edges plus a `ChainForestBlockLabel` caption (`collapsible` ⇔ it exceeds the threshold, i.e. is expanded only by the override).
- A chain with no members renders nothing — its tab is the affordance.
- Forest tree edges ALWAYS key `chainedge:<childMemberId>` (never the raw connection id): one connection can back links in several chains at once, and xyflow edge ids must be unique. `connectionId` still resolves canonical selection; consumers read it from the edge data, not the id.

### Depends On
- `layoutChainTree`, `layoutForest` (`./layout`)
- `CHAIN_BLOB_ZOOM_CUTOFF`, `shouldCollapseChain`, blob content types (`./collapse`)
- `ChainKind`, `MapChain`, `MapChainMember`, `MapSystemNode` types from `@/types`
