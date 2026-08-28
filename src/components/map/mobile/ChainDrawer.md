## ChainDrawer

**Purpose:** Mobile chain switcher — a bottom-sheet drawer of chain cards replacing the desktop tab strip at phone width, plus the reusable card list the All view renders full-screen.
**File:** `src/components/map/mobile/ChainDrawer.tsx`

### Exports

#### ChainCardList

One tappable card per visible chain: kind icon, name, chains-near-me `Nj` badge (tooltip via `formatChainDistanceTooltip`), rally / EOL-critical flags, and the blob summary line. Empty list renders a "No chains yet" hint (chain creation is desktop-only).

| Prop | Type | Required | Description |
|---|---|---|---|
| cards | MobileChainCard[] | yes | In tab order (shared first, then personal, by creation). |
| activeChainId | string \| null | yes | Highlights the open chain's card; the All sentinel or null highlights none. |
| distances | Record<string, ChainDistanceBadge \| null> | no | Undefined ⇒ unknown, every badge hidden; a null value ⇒ "—". |
| onSelect | (chainId: string) => void | yes | Card tap. |

#### ChainDrawer

The bottom sheet (`Sheet` `side="bottom"`, max 70dvh, scrollable). Above the card list sit two mode rows: **All chains** (`ALL_CHAINS_TAB` — the card-list view) and **Free canvas** (null — leaves the mobile chain view for the stacked dashboard). Every pick closes the sheet before firing `onSelect`.

| Prop | Type | Required | Description |
|---|---|---|---|
| open / onOpenChange | boolean / (open) => void | yes | Controlled sheet state (owned by `MobileChainView`). |
| cards | MobileChainCard[] | yes | As above. |
| activeChainId | string | yes | The open chain's id, or `ALL_CHAINS_TAB`. |
| distances | Record<string, ChainDistanceBadge \| null> | no | As above. |
| onSelect | (chainId: string \| null) => void | yes | null = Free canvas, `ALL_CHAINS_TAB` = All, else a chain id. |

### Behaviour & Interactions
- Purely presentational over the callbacks — no fetching, no chain lifecycle (create/rename/delete stay desktop, on the tab strip).

### Depends On
- `Sheet` / `SheetContent` / `SheetHeader` / `SheetTitle` (`@/components/ui/sheet`)
- `formatChainDistanceTooltip` (`@/lib/map/chains/distance`)
- `ALL_CHAINS_TAB` (`../ChainTabStrip`)
- `lucide-react` icons
- `ChainDistanceBadge`, `ChainKind`, `MobileChainCard` types from `@/types`
