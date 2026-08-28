## mobile.ts (chains)

**Purpose:** Pure mobile chain-view support — the phone-breakpoint gate decision, touch-sized layout params, and the chain-card derivation the mobile drawer / All card list render.
**File:** `src/lib/map/chains/mobile.ts`

No `server-only`, no DB, no React. `MobileChainCard` is re-exported from `@/types`.

---

### MOBILE_CHAIN_TILE_PARAMS
`ChainLayoutParams` for the phone-width single-chain tree, in the same logical (breadth × depth) terms as `CHAIN_TILE_PARAMS` (the layout transposes; never pre-swap). Tiles keep the `SystemNode` footprint; gaps are widened for touch separation and the pointer pill's depth extent meets the 44px touch-target floor.

---

### isMobileChainView(activeChainId: string | null, isPhoneViewport: boolean): boolean
The mobile-view gate: true ⇔ phone-width viewport AND chain-land (a chain tab or the All sentinel). `activeChainId === null` (free canvas) never gates mobile — free-canvas mode at phone width keeps the stacked dashboard untouched. Callers pass the *resolved* tab, so a stored id naming a vanished chain falls back to the dashboard.

---

### buildMobileChainCards(args): MobileChainCard[]
One card per given chain, in the given (tab) order, via `buildChainBlobContent` + `formatChainBlobLine` — so the card summary matches the forest blob exactly. Empty chains keep their card ("0 systems"): the card is the open-affordance, as the tab is on desktop. Distance badges are not part of the card; they join at render from the shared `chainDistanceBadges` record.

**Parameters:** `{ chains, members, systems, criticalConnectionIds }` — `chains` pre-sorted in tab order (`sortChainsForTabs`); `criticalConnectionIds` the ids of connections currently EOL-critical in the view.

### MobileChainCard (type)
`{ chainId, name, kind, systemCount, summaryLine, hasRally, hasEolCritical }` — `systemCount` counts real occurrences (pointer-leaves excluded).

### Depends On
- `buildChainBlobContent` (`./view`), `formatChainBlobLine` (`./collapse`)
- `ChainKind`, `ChainLayoutParams`, `MapChain`, `MapChainMember`, `MapSystemNode` types from `@/types`
