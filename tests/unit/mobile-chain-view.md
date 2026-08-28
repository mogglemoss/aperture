## mobile-chain-view.test.ts

**Purpose:** Pure unit checks for the mobile chain view's support module (`src/lib/map/chains/mobile.ts`) — the phone-breakpoint gate, the touch-sized layout params, the drawer card derivation, and the node action sheet's action set + inbound-connection resolution. No DB, no rendering.
**File:** `tests/unit/mobile-chain-view.test.ts`

### Covers
- **isMobileChainView** — never gates on the free canvas (`null`) even at phone width (the stacked-dashboard invariant); gates on a chain id and the `'all'` sentinel at phone width; never gates at desktop width.
- **MOBILE_CHAIN_TILE_PARAMS** — gaps and the pointer pill's depth extent meet the 44px touch floor.
- **buildMobileChainCards** — one card per chain in the given order (never re-sorted); the summary line equals `formatChainBlobLine(buildChainBlobContent(...))` so cards and forest blobs agree; pointer-leaves and foreign-chain members are excluded from `systemCount`; an empty chain keeps its card ("0 systems"); rally / EOL-critical flags carry through.
- **resolveInboundConnectionId** — over a real `buildChainCanvas` model: a child occurrence resolves to its live inbound connection; null for the root, a dashed (non-live) via, a system with no occurrence, a null selection, and a null model.
- **buildMobileSheetActions** — offers the status/lock/rally set plus inbound EOL/mass; excludes every `MOBILE_SHEET_EXCLUDED_ACTION_IDS` entry and every Map / jump-to-system action; no Connection group without an inbound connection; dispatches the exact registry callbacks (`onSystemPatch` / `onConnectionPatch`).
