## ChainTabStrip

**Purpose:** Wrapping chain tab strip (nomadic-chains) — "Canvas" + "All" plus one tab per visible chain, with chain create / rename / delete and the tree-orientation toggle. The tabs are the chain-mode toggle: "Canvas" shows the hand-arranged free canvas, "All" the forest render (the default active tab whenever the map has any visible chain), a chain tab swaps in the `ChainCanvas` tree.
**File:** `src/components/map/ChainTabStrip.tsx`

Exports `ALL_CHAINS_TAB` (`'all'`) — the sentinel tab id for the All forest, safe against bigserial chain ids; `null` stays the free canvas — and the `ChainAnchorOption` type (`{ id, name, alias }` — an on-map system offered as a create-dialog anchor).

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| chains | MapChain[] | yes | Visible chains in tab order (shared first, then personal, by creation — pre-sorted via `sortChainsForTabs`). |
| activeChainId | string \| null | yes | Active tab: a chain id, `ALL_CHAINS_TAB` for the forest, null for the free canvas. |
| canManage | boolean | yes | Offers the shared kind in the create dialog and rename/delete on shared-chain tabs. UI gating only; every call is re-checked server-side. |
| orientation | ChainLayoutOrientation | yes | Current tree orientation (toggle shown only while a chain tab is active). |
| distances | Record<string, ChainDistanceBadge \| null> | no | Chains-near-me gate jumps per chain id. Undefined ⇒ no badges (distances unknown); a null value ⇒ "—" (no gate-reachable k-space exit). |
| systems | ChainAnchorOption[] | yes | On-map systems the create dialog's anchor search filters over (client-side, by name/alias). |
| defaultAnchorId | string \| null | yes | The anchor pre-picked when the create dialog opens (the creator's current tracked location when it's on the map), or null. |
| onSelect | (chainId: string \| null) => void | yes | Tab click (null = Canvas). |
| onOrientationChange | (o: ChainLayoutOrientation) => void | yes | Orientation toggle. |
| onCreate | (name, kind, anchorMapSystemId: string \| null) => void | yes | Create-dialog submit (null anchor ⇒ empty chain). |
| onRename | (chainId: string, name: string) => void | yes | Rename-dialog submit (skipped when the name is unchanged). |
| onDelete | (chainId: string) => void | yes | Delete-dialog confirm. |

### Renders
A slim `flex-wrap` bar (wraps to multiple rows at corp scale) above the canvas: the "Canvas" tab, the "All" tab, chain tabs (Users icon = shared, User = personal, name truncated, plus — when `distances` is supplied — a small "Nj" badge whose tooltip names the nearest k-space exit via `formatChainDistanceTooltip`), a "+" new-chain button, and — right-aligned, while any tab but "Canvas" is active (the forest and the trees both orient) — the orientation toggle (root-top ⇄ root-left). Three mounted dialogs: create (anchor selector + name + kind picker, kind shown only to managers), rename, and a delete confirm ("Systems stay on the map").

### Behaviour & Interactions
- The active tab of a manageable chain (personal always; shared when `canManage`) grows a chevron `Menu` with Rename / Delete.
- **Create dialog (Tripwire-style):** opens with the anchor pre-picked from `defaultAnchorId` and the name pre-filled with that system's name. The anchor is optional — a picked anchor shows as a chip with a clear (X) button; with none picked, a search input filters `systems` by name/alias (top 8) and a click picks. An untouched name field follows the anchor pick (picking/clearing rewrites it); the first keystroke in it detaches that. Submit passes the anchor id (or null — a blank chain stays legal).
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
- `createAnchor` / `anchorQuery` / `createNameTouched` — the anchor pick, its search text, and whether the name field has been typed in (untouched follows the anchor).
- `renameTarget` / `renameName` — the rename dialog (`null` target ⇒ closed).
- `deleteTarget` — the delete confirm (`null` ⇒ closed).
