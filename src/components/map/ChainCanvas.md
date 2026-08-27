## ChainCanvas

**Purpose:** Chain-mode xyflow canvas — renders ONE chain's generated tree (occurrence tiles + pointer-leaf pills + tree edges) with layout-owned positions; the parallel render path a chain tab swaps in for the free canvas.
**File:** `src/components/map/ChainCanvas.tsx`

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| nodes | ChainCanvasNode[] | yes | Pre-built xyflow nodes (`system` occurrence tiles + `chainPointer` pills), positioned by the layout engine. |
| edges | Edge[] | yes | Pre-built edges: `connection`-typed where a live connection backs the link, default dashed edges otherwise. |
| focus | ChainFocusRequest \| null | yes | One-shot "center on this system's occurrence" request; a new `token` re-triggers (pointer navigation, jump-to-system). |
| onNodeClick / onEdgeClick / onPaneClick | handlers | yes | Chain-mode selection handlers from `MapCanvas` (occurrence → canonical system selection; pointer → tab navigation). |
| onConnect | (params: Connection) => void | yes | Charts a wormhole draw with the active chain's context. |
| onNodeContextMenu / onEdgeContextMenu / onPaneContextMenu | handlers | yes | Right-click handlers (suppress the native menu; occurrence/edge open the canonical context menu). |

### Exports
- `CHAIN_TILE_PARAMS: ChainLayoutParams` — tile/gap dimensions fed to the layout engine, in logical (breadth × depth) terms (never pre-swapped per orientation; the layout transposes). Consumed by `MapCanvas`'s `buildChainCanvas` memo.
- `ChainCanvasNode` — `Node<SystemNodeData> | Node<ChainPointerNodeData>`.
- `ChainFocusRequest` — `{ token, mapSystemId }`.

### Renders
A `ReactFlow` with `nodeTypes { system: SystemNode, chainPointer: ChainPointerNode }` and `edgeTypes { connection: ConnectionEdge }`, plus `Background` and `Controls`.

### Behaviour & Interactions
- **Not draggable**: `nodesDraggable={false}` canvas-wide — the generated layout owns positions; manual drag belongs to the free canvas only.
- Connectable (`ConnectionMode.Loose`): dragging between two occurrence tiles charts a connection through `onConnect`; pointer pills have no handles.
- No viewport persistence: `fitView` on mount (`MapCanvas` keys the component by chain id, so every tab open refits). A `focus` request pending at mount wins over the initial fit; subsequent requests center via `setCenter` at zoom 1 (token-gated effect + `onInit`, since the instance isn't ready before init).
- Wheel scrolls the page, not the zoom (`zoomOnScroll={false}`, `preventScrolling={false}`) — matching the free canvas.
- `deleteKeyCode={null}` — no delete keybind, same rule as the free canvas.
- Holds its own `ReactFlowInstance` ref; it never touches `MapCanvas`'s free-canvas `flowInstance`.

### Depends On
- `@xyflow/react`, `./SystemNode`, `./ChainPointerNode`, `./ConnectionEdge`
- `ChainLayoutParams` from `@/types`
