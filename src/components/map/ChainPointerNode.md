## ChainPointerNode

**Purpose:** xyflow custom node rendering a chain-mode pointer-leaf pill — the terminal "continues in *Chain B*" / "loops to *X*" marker a cross-link renders instead of unfolding recursively.
**File:** `src/components/map/ChainPointerNode.tsx`

### Props
Receives xyflow `NodeProps` with `data: ChainPointerNodeData` — `{ memberId, targetChainId, targetChainName, isLoop, targetMapSystemId, targetSystemName }`. `targetChainName` is null when the target chain isn't visible to the viewer (rendered as "another chain").

### Renders
A small dashed rounded pill on the `bg-map-node` surface: a loop icon + "loops to *system*" when `isLoop`, else an outbound arrow + "continues in *chain*". A `title` tooltip carries the full sentence including the target system.

### Behaviour & Interactions
- Purely presentational: no xyflow handles (not connectable), and click navigation (switch to the target chain's tab focused on the target system) is handled by `MapCanvas`'s chain-mode node-click handler, not here.
- `MapCanvas` mounts it with `selectable: false` and `draggable: false` — a pointer-leaf is a navigation affordance, never a selection.

### Depends On
- `@xyflow/react` (`NodeProps`), `lucide-react` (`ArrowUpRight`, `Repeat2`)
