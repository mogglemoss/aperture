## ChainTabStrip

**Purpose:** Wrapping chain tab strip (nomadic-chains) — "Free" + "All" plus one tab per visible chain, with chain create / rename / delete and the tree-orientation toggle. The tabs are the chain-mode toggle: "Free" (the default) shows the free canvas, "All" the forest render, a chain tab swaps in the `ChainCanvas` tree.
**File:** `src/components/map/ChainTabStrip.tsx`

Exports `ALL_CHAINS_TAB` (`'all'`) — the sentinel tab id for the All forest, safe against bigserial chain ids; `null` stays the free canvas.

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| chains | MapChain[] | yes | Visible chains in tab order (shared first, then personal, by creation — pre-sorted via `sortChainsForTabs`). |
| activeChainId | string \| null | yes | Active tab: a chain id, `ALL_CHAINS_TAB` for the forest, null for the free canvas. |
| canManage | boolean | yes | Offers the shared kind in the create dialog and rename/delete on shared-chain tabs. UI gating only; every call is re-checked server-side. |
| orientation | ChainLayoutOrientation | yes | Current tree orientation (toggle shown only while a chain tab is active). |
| distances | Record<string, ChainDistanceBadge \| null> | no | Chains-near-me gate jumps per chain id. Undefined ⇒ no badges (distances unknown); a null value ⇒ "—" (no gate-reachable k-space exit). |
| onSelect | (chainId: string \| null) => void | yes | Tab click (null = All). |
| onOrientationChange | (o: ChainLayoutOrientation) => void | yes | Orientation toggle. |
| onCreate | (name: string, kind: ChainKind) => void | yes | Create-dialog submit. |
| onRename | (chainId: string, name: string) => void | yes | Rename-dialog submit (skipped when the name is unchanged). |
| onDelete | (chainId: string) => void | yes | Delete-dialog confirm. |

### Renders
A slim `flex-wrap` bar (wraps to multiple rows at corp scale) above the canvas: the "Free" tab, the "All" tab, chain tabs (Users icon = shared, User = personal, name truncated, plus — when `distances` is supplied — a small "Nj" badge whose tooltip names the nearest k-space exit via `formatChainDistanceTooltip`), a "+" new-chain button, and — right-aligned, while any tab but "Free" is active (the forest and the trees both orient) — the orientation toggle (root-top ⇄ root-left). Three mounted dialogs: create (name + kind picker, kind shown only to managers), rename, and a delete confirm ("Systems stay on the map").

### Behaviour & Interactions
- The active tab of a manageable chain (personal always; shared when `canManage`) grows a chevron `Menu` with Rename / Delete.
- Create defaults to `personal`; non-managers never see the kind picker and always create personal chains.
- Name inputs cap at `apertureConfig.MAP_CHAIN_NAME_MAX_LENGTH`; empty names disable submit.
- Purely presentational over the callbacks — no fetching, no optimistic state (that lives in `MapCanvas`).

### Depends On
- `@/components/ui/button`, `input`, `dialog`, `menu`
- `apertureConfig` (`MAP_CHAIN_NAME_MAX_LENGTH`)
- `lucide-react` icons
- `formatChainDistanceTooltip` (`@/lib/map/chains/distance`)
- `ChainDistanceBadge`, `ChainKind`, `ChainLayoutOrientation`, `MapChain` types from `@/types`

### Local State
- `createOpen` / `createName` / `createKind` — the create dialog.
- `renameTarget` / `renameName` — the rename dialog (`null` target ⇒ closed).
- `deleteTarget` — the delete confirm (`null` ⇒ closed).
