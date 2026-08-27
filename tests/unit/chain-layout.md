## chain-layout.test.ts

**Purpose:** Unit coverage for the pure chain-mode forest layout engine (`src/lib/map/chains/layout.ts`) and LOD collapse decision (`collapse.ts`).
**File:** `tests/unit/chain-layout.test.ts`

No DB required (pure functions). Fixtures are plain `ChainLayoutMemberRef` objects; params `{ nodeW: 100, nodeH: 50, gapX: 20, gapY: 30 }`.

Cases:
1. **Subtree breadth math** — a fan of children spans `Σ breadths + gaps` with the parent centered over it; nested subtrees compose; a linear chain stays one node wide; a parent wider than its children centers them under it; edges carry parent→child + `viaConnectionId`.
2. **Sibling stability** — siblings order by member id (numeric creation order, `'10'` after `'9'`), not input order; an added child appends without shuffling existing siblings.
3. **Orientation transpose** — `root-left` is the exact transpose of `root-top` (x↔y, width↔height, block dims swapped) node-for-node.
4. **Pointer-leaf sizing** — pills take `pointerW`/`pointerH` and contribute pill breadth to the span; dimensions default to the tile size.
5. **Shelf wrap** (`packShelves`) — rows wrap at the viewport width with row height = tallest block; an oversized block keeps its own row.
6. **Forest packing** (`layoutForest`) — block order is shared → personal by creation order with Unassigned last, never by size; the unassigned grid wraps at the viewport width ordered by system id; an empty chain yields a 0×0 block.
7. **Collapse precedence** (`shouldCollapseChain`) — every branch: below the zoom cutoff always blobs (override ignored); at/above it `systemCount > threshold` blobs; the override expands; at-or-under threshold stays expanded (boundary at `systemCount === threshold` and `zoom === CHAIN_BLOB_ZOOM_CUTOFF`).
8. **Blob line** (`formatChainBlobLine`) — `34 systems · 5 HS · 2 LS`; singular `1 system` with exits omitted.
