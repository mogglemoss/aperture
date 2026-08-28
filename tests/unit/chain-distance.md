## chain-distance.test.ts

**Purpose:** Pure unit checks for the chains-near-me distance reducer (`src/lib/map/chains/distance.ts`) — plain adjacency maps in, per-chain minima out. No DB, no rendering.
**File:** `tests/unit/chain-distance.test.ts`

### Covers
- **isKspaceSecurity** — every non-`C*` security label counts (incl. `P`), `C*` and null don't.
- **multiSourceGateBfs** — single-origin distances, min-over-origins in one pass, unreachable systems absent, an origin outside the adjacency seeding at 0.
- **computeChainDistances** — min over a chain's exits with the argmin exit named; distance ties break to the first-listed exit; a chain with no exits, or only gate-unreachable exits, reduces to null (never 0).
- **resolveOriginSystemIds** — k-space pilot ⇒ own system; J-space pilot ⇒ the deduped exits of the containing chains; J-space outside every visible chain ⇒ empty (unknown).
- **J-space origin-set case end to end** — origin set from the containing chain's exits, own chain 0, other chains min over pairs, all-J chain null.
- **formatChainDistanceTooltip** — exit naming + pluralization, the unresolvable-exit fallback, and the "—" explanation.
