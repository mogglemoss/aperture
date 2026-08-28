## MobileChainView

**Purpose:** Phone-width chain mode — a full-screen single-chain tree with a bottom-sheet chain drawer, swapped in for the whole dashboard while chain-land is active at the `sm` breakpoint.
**File:** `src/components/map/mobile/MobileChainView.tsx`

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| activeChainId | string | yes | The open chain's id, or `ALL_CHAINS_TAB` (never null — null is the dashboard, gated off in `MapCanvas`). |
| chainName | string \| null | yes | Resolved name of the open chain; null on the All tab. |
| cards | MobileChainCard[] | yes | Drawer / All-list cards, in tab order. |
| distances | Record<string, ChainDistanceBadge \| null> | no | Chains-near-me badges (header + drawer); undefined ⇒ unknown, hidden. |
| nodes | ChainCanvasNode[] | yes | Pre-built xyflow nodes for the open chain (empty on the All tab) — the same `buildChainCanvas` derivation as the desktop tab, built by `MapCanvas` with `MOBILE_CHAIN_TILE_PARAMS` and root-top forced. |
| edges | Edge[] | yes | Pre-built tree edges (live `connection`-typed / dashed fallback). |
| onSelectChain | (chainId: string \| null) => void | yes | Drawer/card pick: null = Free canvas (back to the dashboard), `ALL_CHAINS_TAB` = All, else a chain id. |
| onNodeClick / onEdgeClick / onPaneClick | handlers | yes | `MapCanvas`'s chain-mode selection handlers (occurrence → canonical system, pointer pill → chain switch). |
| selectedSystem | MapSystemNode \| null | yes | The selected canonical system — a tree tap opens the `NodeActionSheet` on it. |
| sheetContext | KeyboardActionContext | yes | Action context for the sheet: `selectedConnection` is the occurrence's inbound connection (resolved by `MapCanvas`). |
| selectedSystemNotes | SystemNote[] | yes | Global system notes for the selected system, newest first. |
| onAddNote | (values: SystemNoteFormValues) => void | yes | Add a note to the selected system. |
| onClearSelection | () => void | yes | Clear the canonical selection (sheet dismissed). |

### Renders
A `fixed inset-0` full-screen column over everything (nav included): a slim header (kind icon + chain name — or "All chains" — with the `Nj` badge, and a "Chains" button opening the drawer), then either the tree's `ReactFlow` or, on the All tab, a scrollable `ChainCardList` (a card list, never a rendered forest — no 1000-node canvas on a phone). The `ChainDrawer` bottom sheet is mounted closed, and a `NodeActionSheet` is mounted open ⇔ a system is selected on a chain tab (gated off on the All card list — a selection lingering from a previous tab must not open a sheet over the cards).

### Behaviour & Interactions
- The `ReactFlow` is keyed by chain id so switching chains refits the new tree (`fitView`); `minZoom` 0.1 so a large chain can fit a phone screen.
- Touch pan/pinch are xyflow defaults (`panOnDrag` / `zoomOnPinch`); unlike the desktop canvases, page scrolling is suppressed over the pane — the view is full-screen, there is no page to scroll.
- Not draggable, not connectable, no delete keybind — full charting and layout stay desktop concerns; light edits (status/rally/lock, inbound EOL/mass, notes) go through the `NodeActionSheet`.
- Orientation preference does not apply here (root-top is forced upstream in `MapCanvas`'s derivation).

### Depends On
- `@xyflow/react`, `../SystemNode`, `../ChainPointerNode`, `../ConnectionEdge`
- `./ChainDrawer` (`ChainDrawer`, `ChainCardList`), `./NodeActionSheet` (`NodeActionSheet`)
- `ALL_CHAINS_TAB` (`../ChainTabStrip`), `ChainCanvasNode` type (`../ChainCanvas`)
- `formatChainDistanceTooltip` (`@/lib/map/chains/distance`)
- `@/components/ui/button`, `lucide-react` icons
- `SystemNoteFormValues` type (`@/components/sidebar/SystemNotesModule`), `KeyboardActionContext` type (`@/lib/map/keyboardActions`)
- `ChainDistanceBadge`, `MapSystemNode`, `MobileChainCard`, `SystemNote` types from `@/types`

### Local State
- `drawerOpen: boolean` — whether the chain drawer sheet is open.
