## mobile.ts (chains)

**Purpose:** Pure mobile chain-view support — the phone-breakpoint gate decision, touch-sized layout params, the chain-card derivation the mobile drawer / All card list render, and the node action sheet's action set.
**File:** `src/lib/map/chains/mobile.ts`

No `server-only`, no DB, no React. `MobileChainCard` is re-exported from `@/types`.

---

### MOBILE_CHAIN_TILE_PARAMS
`ChainLayoutParams` for the phone-width single-chain tree, in the same logical (breadth × depth) terms as `CHAIN_TILE_PARAMS` (the layout transposes; never pre-swap). Tiles keep the `SystemNode` footprint; gaps are widened for touch separation and the pointer pill's depth extent meets the 44px touch-target floor.

---

### isMobileChainView(activeChainId: string | null, isPhoneViewport: boolean): boolean
The mobile-view gate: true ⇔ phone-width viewport AND chain-land (a chain tab or the All sentinel). `activeChainId === null` (free canvas) never gates mobile — free-canvas mode at phone width keeps the stacked dashboard untouched. Callers pass the *resolved* tab, so a stored id naming a vanished chain falls back to the dashboard.

---

### resolveInboundConnectionId(model, selectedMapSystemId): string | null
The inbound connection of a selected occurrence in the open chain: the live backing connection of the `ChainCanvasModel` edge targeting the selected member. Null when the selection is the chain's root, has no occurrence in the chain, or the inbound via is collapsed/unknown (a dashed fallback edge carries no live connection to act on).

**Parameters:** `model` — `Pick<ChainCanvasModel, 'chainId' | 'edges'>` (or null); `selectedMapSystemId` — the canonical selected `ap_map_system.id` (or null).

---

### MOBILE_SHEET_EXCLUDED_ACTION_IDS
The registry action ids the node action sheet never offers: `system-remove`, `conn-delete`. A phone tap sheet is exactly where a mis-tap wipes a system, so removal stays a desktop concern — the same reasoning as the no-bare-delete-key invariant.

---

### buildMobileSheetActions(ctx: KeyboardActionContext): PaletteAction[]
The mobile node action sheet's light-edit set: `buildPaletteActions` (the sheet is a third invocation surface beside buttons/palette/keys — same callbacks, same server calls) filtered to the System group plus the Connection group, minus the excluded destructive ids. Callers build the context with `selectedConnection` = the selected occurrence's inbound connection (`resolveInboundConnectionId`), not an edge selection. Map-level and jump-to-system actions are out of the sheet's scope.

---

### buildMobileChainCards(args): MobileChainCard[]
One card per given chain, in the given (tab) order, via `buildChainBlobContent` + `formatChainBlobLine` — so the card summary matches the forest blob exactly. Empty chains keep their card ("0 systems"): the card is the open-affordance, as the tab is on desktop. Distance badges are not part of the card; they join at render from the shared `chainDistanceBadges` record.

**Parameters:** `{ chains, members, systems, criticalConnectionIds }` — `chains` pre-sorted in tab order (`sortChainsForTabs`); `criticalConnectionIds` the ids of connections currently EOL-critical in the view.

### MobileChainCard (type)
`{ chainId, name, kind, systemCount, summaryLine, hasRally, hasEolCritical }` — `systemCount` counts real occurrences (pointer-leaves excluded).

### Depends On
- `buildChainBlobContent`, `chainOccurrenceNodeId` (`./view`), `formatChainBlobLine` (`./collapse`)
- `buildPaletteActions`, `KeyboardActionContext`, `PaletteAction` (`@/lib/map/keyboardActions`)
- `ChainCanvasModel`, `ChainKind`, `ChainLayoutParams`, `MapChain`, `MapChainMember`, `MapSystemNode` types from `@/types`
