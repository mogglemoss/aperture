## chain-view.test.ts

**Purpose:** Pure unit checks for the chain-canvas derivation (`src/lib/map/chains/view.ts`) — viewData slices → occurrence/pointer view-models + edges. No DB, no rendering.
**File:** `tests/unit/chain-view.test.ts`

### Covers
- **Occurrence derivation** — one node per real member with `chainId:mapSystemId` ids, positions/extent taken verbatim from `layoutChainTree`, the canonical `MapSystemNode` riding on each occurrence; members of other chains are filtered; an occurrence whose canonical system is missing is skipped along with its incident edges.
- **Edges** — keyed on the live backing connection id (`connectionId` set) when `viaConnectionId` is in `liveConnectionIds`, else `chainedge:<childMemberId>` with `connectionId: null` (dead or unknown via).
- **Pointer leaves** — a loop pointer gets a `chainptr:<memberId>` id that cannot collide with the real occurrence of the same system, `isLoop` set, alias-over-name target naming (trimmed); a cross-chain pointer resolves its chain name from the visible chains and yields `null` for a foreign (invisible) chain; hidden target systems fall back to the raw id and keep the pill.
- **Orientation passthrough** — `root-left` output is the exact transpose of `root-top` (x↔y, width↔height).
- **sortChainsForTabs** — shared before personal, each by creation (id) order, never by name.
