## chain-forest-view.test.ts

**Purpose:** Pure unit checks for the Stage 5 All-view forest derivation (`buildChainBlobContent` + `buildForestCanvas` in `src/lib/map/chains/view.ts`) and the 1000-system / 30-chain scale fixture. No DB, no rendering.
**File:** `tests/unit/chain-forest-view.test.ts`

### Covers
- **Blob content** — `systemCount` counts real occurrences only (pointer-leaves and foreign-chain members excluded); k-space exits grouped by display class (`H`→`HS`, `L`→`LS`, `0.0`→`NS`, `P` raw; `C*`/J-space never an exit) ordered HS/LS/NS then the rest; `hasRally` from member systems only; `hasEolCritical` from inbound vias including a pointer-leaf's via; `formatChainBlobLine` round-trip.
- **Forest blocks & offsets** — expanded-chain node coords = shelf block offset + block-local layout coords; one caption per expanded block plus the "Unassigned" caption; chainless systems ride the Unassigned block at its offset.
- **Collapse** — a chain past the threshold emits one blob at the block footprint (no tiles/edges, no caption — the blob carries the name) with `expandable` true at full zoom; the session override expands it (caption `collapsible` true); below the zoom cutoff everything blobs, the override is ignored, and `expandable` is false.
- **Edge-id uniqueness** — when one connection backs links in two chains, both forest edges key `chainedge:<memberId>` (unique) and both carry the canonical `connectionId`; an empty chain renders nothing.
- **Scale fixture** — 30 chains × 33 systems (root + 4 branches × depth 8) + 10 unassigned = 1000 systems: expanded mode yields 990 occurrences / 960 edges, blob mode 30 blobs / 0 tiles; blob positions equal the expanded block positions (zoom never re-packs the shelf); both derivations complete inside a loose interactive-time bound.
