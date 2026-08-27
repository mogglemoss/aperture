## layout.ts (chains)

**Purpose:** Pure forest layout engine for chain mode (nomadic-chains) — memberships in, positioned occurrence nodes + edges out, for one tree (a chain tab) or the whole shelf-packed forest (the All view).
**File:** `src/lib/map/chains/layout.ts`

No `server-only`, no DB, no React — the same code runs client-side in the canvas and in unit tests. Node/gap dimensions are parameters; the module never imports UI constants. Chain mode is not draggable: the generated layout owns positions (manual drag belongs to free-canvas mode only).

Coordinates are computed in logical (breadth × depth) space and transposed at the end per the orientation: `ChainLayoutParams.nodeW`/`gapX` are breadth-axis extents, `nodeH`/`gapY` depth-axis extents; under `root-left` the plane is transposed, so `nodeW` becomes the rendered height. Depth spacing is always `depth × (nodeH + gapY)`.

Shared types (`ChainLayoutOrientation`, `ChainLayoutParams`, `ChainLayoutMemberRef`, `ChainLayoutNode`, `ChainLayoutEdge`, `ChainTreeLayout`, `ChainRef`, `UnassignedSystemNode`, `ChainForestBlock`, `ChainForestLayout`, `ShelfBlock`, `ShelfPosition`) are re-exported from `@/types`. `MapChainMember` is structurally assignable to `ChainLayoutMemberRef`, and `MapChain` to `ChainRef`.

---

### layoutChainTree(chainId: string, members: readonly ChainLayoutMemberRef[], params: ChainLayoutParams, orientation: ChainLayoutOrientation): ChainTreeLayout
Lays out one chain's tree at origin (0,0). Filters `members` to `chainId`, builds the tree from `parentMemberId`, and runs a recursive tidy-tree: a subtree's breadth is `max(nodeW, Σ children breadths + gaps)`, each parent centered over its children's span, siblings ordered by member id (creation order) so growth never shuffles them — an added child appends after its existing siblings. O(n) over members.

- Pointer-leaves (`pointerChainId` non-null) lay out as fixed-size pills (`pointerW`/`pointerH`, defaulting to `nodeW`/`nodeH`) and contribute pill breadth to their parent's span.
- A member whose parent is absent from the set is treated as an additional root; multiple roots lay side by side along the breadth axis. Members trapped in a parent cycle are unreachable and omitted.
- Edges are the parent→child tree links (`id` = the child member id — each member has at most one inbound edge), carrying `viaConnectionId`.

**Returns:** `{ chainId, nodes, edges, width, height }` — node coords are block-local top-left in oriented (post-transpose) space; `width`/`height` is the bounding block.

---

### packShelves(blocks: readonly ShelfBlock[], viewportWidth: number, gapX: number, gapY: number): ShelfPosition[]
Shelf-packs block footprints into rows in the caller's order, wrapping at `viewportWidth`; row height = tallest block in the row. A block wider than the viewport gets its own row at natural width (horizontal scroll accepted). Order never keys on size, so growth doesn't teleport blocks.

**Returns:** One top-left position per input block, same order.

---

### layoutForest(args): ChainForestLayout
The All view: lays out every chain via `layoutChainTree`, shelf-packs the blocks via `packShelves` (block/row gaps from `blockGap`, defaulting to `params.gapX`/`gapY`). Block order is shared chains then personal, each by creation (id) order, with the "Unassigned" pseudo-chain last — never by size. A chain with no members contributes an empty 0×0 block. Re-flow on viewport resize is accepted.

**Parameters:** `{ chains: ChainRef[], members: ChainLayoutMemberRef[], unassignedSystemIds: string[], params, orientation, viewportWidth, blockGap? }` — `unassignedSystemIds` are the chainless `ap_map_system.id`s, laid as a plain grid wrapping at `viewportWidth`, ordered by system id; `blockGap` (`{ x, y }`) spaces shelf blocks/rows wider than the intra-tree gaps for visual chain separation.

**Returns:** `{ blocks, width, height }` — each `ChainForestBlock` is `{ kind: 'chain', chainId, nodes, edges, … }` or `{ kind: 'unassigned', systems, … }` with its shelf position `x`/`y`; node coords stay block-local (add the block offset for canvas coords). `width`/`height` bound the whole forest.
