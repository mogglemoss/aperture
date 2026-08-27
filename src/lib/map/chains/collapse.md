## collapse.ts (chains)

**Purpose:** Pure LOD collapse decision for chain mode — when a chain renders as a labeled blob instead of its full tree — plus the blob content contract the All-view renderer consumes.
**File:** `src/lib/map/chains/collapse.ts`

No `server-only`, no DB, no React. `ChainCollapseInput`, `ChainBlobExit`, and `ChainBlobContent` are re-exported from `@/types`.

---

### CHAIN_BLOB_ZOOM_CUTOFF
`0.35` — the canvas zoom below which every chain is a blob regardless of size or override.

---

### shouldCollapseChain(input: ChainCollapseInput): boolean
True ⇔ the chain renders as a blob. Precedence: `zoom < CHAIN_BLOB_ZOOM_CUTOFF` ⇒ blob (the expansion override does not apply); at or above the cutoff, blob when `systemCount > threshold` unless `expandedOverride` is set.

**Parameters (`ChainCollapseInput`):**
- `systemCount` — real occurrences in the chain (pointer-leaves excluded).
- `zoom` — current canvas zoom (1 = 100%).
- `threshold` — the viewer's `ap_user.chain_blob_threshold` (default 15).
- `expandedOverride` — session-local "keep this chain expanded" toggle (the blob's expand affordance).

---

### ChainBlobContent (type) + formatChainBlobLine(content): string
The blob render contract: `{ chainId, name, systemCount, exits, hasRally, hasEolCritical }` — chain name, real-occurrence count, k-space exit summary grouped by security class (`ChainBlobExit` = `{ securityClass, count }`), and whether any member system has a rally / any chain connection is EOL-critical. `formatChainBlobLine` renders the summary line, e.g. `34 systems · 5 HS · 2 LS` (singular `1 system`; exits omitted when empty).

Blob hit behavior (renderer contract): click selects the chain (summary in the sidebar), the expand affordance toggles the session override, double-click opens the chain's tab.
