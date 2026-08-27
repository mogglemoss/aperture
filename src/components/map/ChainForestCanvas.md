## ChainForestCanvas

**Purpose:** All-tab forest xyflow canvas (nomadic-chains) — every visible chain side by side as shelf-packed generated trees with per-chain blob LOD, plus the "Unassigned" grid; the read-mostly render path the All tab swaps in.
**File:** `src/components/map/ChainForestCanvas.tsx`

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| nodes | ChainForestCanvasNode[] | yes | Pre-built xyflow nodes (`system` tiles, `chainPointer` pills, `chainBlob` blobs, `chainLabel` captions), positioned by the layout engine. |
| edges | Edge[] | yes | Pre-built edges: `connection`-typed where a live connection backs the link, dashed defaults otherwise. Member-keyed ids (`chainedge:<memberId>`), the canonical connection rides in `data`. |
| focus | ChainFocusRequest \| null | yes | One-shot "center on this system's occurrence or unassigned tile" request; a new `token` re-triggers. |
| onNodeClick / onEdgeClick / onPaneClick | handlers | yes | Forest selection handlers from `MapCanvas` (occurrence → canonical system; blob/caption → chain; pointer → tab navigation). |
| onNodeDoubleClick | handler | yes | Blob / chain-caption double-click opens that chain's tab. |
| onNodeContextMenu / onEdgeContextMenu / onPaneContextMenu | handlers | yes | Right-click handlers (system/edge open the canonical context menu; pane suppresses the native menu). |
| onZoom | (zoom: number) => void | yes | Reports the live canvas zoom on every move and once at init — feeds the blob-collapse decision. |

### Exports
- `CHAIN_FOREST_BLOCK_GAP` — the inter-block shelf gap (wider than the sibling gaps so chains read as separate blocks); fed to `buildForestCanvas` as `blockGap`.
- `CHAIN_FOREST_LABEL_OFFSET` — vertical offset of a block caption above its block origin.
- `ChainForestCanvasNode` — the node union (`system` | `chainPointer` | `chainBlob` | `chainLabel`).

### Renders
A `ReactFlow` with `nodeTypes { system, chainPointer, chainBlob, chainLabel }` and `edgeTypes { connection }`, plus `Background` and `Controls`.

### Behaviour & Interactions
- **Not draggable, not connectable** — the generated layout owns positions, and charting belongs to the chain tabs / free canvas.
- `zoomOnDoubleClick={false}` so blob/caption double-click opens the tab instead of zooming; `minZoom={0.05}` so a WDS-scale forest can fit and zoom below the blob cutoff.
- No viewport persistence: `fitView` on mount; a `focus` request pending at mount wins over the initial fit (same token-gated pattern as `ChainCanvas`), subsequent requests center at zoom 1.
- Wheel scrolls the page, not the zoom; `deleteKeyCode={null}` — same rules as the other canvases.
- Holds its own `ReactFlowInstance` ref; never touches the free-canvas or chain-tab instances.

### Depends On
- `@xyflow/react`, `./SystemNode`, `./ChainPointerNode`, `./ChainBlobNode`, `./ConnectionEdge`
- `CHAIN_TILE_PARAMS`, `ChainFocusRequest` (`./ChainCanvas`)
