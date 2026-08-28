## ChainBlobNode

**Purpose:** All-view LOD xyflow nodes (nomadic-chains) — a collapsed chain's labeled blob, plus the caption (`ChainLabelNode`) above an expanded chain block or the "Unassigned" grid.
**File:** `src/components/map/ChainBlobNode.tsx`

### ChainBlobNode

Receives xyflow `NodeProps` with `data: ChainBlobNodeData` — `{ content: ChainBlobContent, width, height, expandable, kind, distance?, onToggleExpand }`. `distance` (`ChainDistanceBadge | null`) is the chains-near-me figure, derived per render — deliberately not part of the `ChainBlobContent` contract; undefined hides the badge, null renders "—".

#### Renders
A dashed rounded container sized to the chain's block footprint on the `bg-map-node` surface: kind icon (Users = shared, User = personal) + chain name, the `formatChainBlobLine` summary (`34 systems · 5 HS · 2 LS`) with the "Nj" distance badge beside it (tooltip via `formatChainDistanceTooltip` names the nearest k-space exit), a rally flag icon when `content.hasRally` and an hourglass when `content.hasEolCritical`. A `title` tooltip carries name + summary. The selected state accents the border.

#### Behaviour & Interactions
- Click select (chain summary in the sidebar) and double-click (open the chain's tab) are handled by `MapCanvas`'s forest node handlers, not here.
- The expand affordance (Maximize2 button, shown only when `expandable` — the override does not apply below the zoom cutoff) stops propagation and calls `onToggleExpand(chainId)`, toggling the session-local expansion override.

### ChainLabelNode

Receives `data: ChainLabelNodeData` — `{ chainId, label, kind, collapsible, maxWidth, onToggleExpand }`. `chainId` null ⇔ the "Unassigned" caption.

#### Renders
A small muted caption (kind icon + name, truncated at `maxWidth` — the block footprint) above its block. When `collapsible` (the chain exceeds the threshold and is expanded only by the session override) it grows a Minimize2 button that re-collapses via `onToggleExpand`.

#### Behaviour & Interactions
- Mounted `selectable: false`; chain-caption click/double-click (select chain / open tab) route through `MapCanvas`'s forest node handlers. The Unassigned caption is inert.

### Depends On
- `@xyflow/react` (`NodeProps`), `lucide-react` (`Flag`, `Hourglass`, `Maximize2`, `Minimize2`, `User`, `Users`)
- `formatChainBlobLine` (`@/lib/map/chains/collapse`), `formatChainDistanceTooltip` (`@/lib/map/chains/distance`), `ChainBlobContent` / `ChainDistanceBadge` / `ChainKind` from `@/types`
