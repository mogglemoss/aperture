## chain-distances.test.ts

**Purpose:** DB-gated integration checks for the chains-near-me endpoint (`GET /api/map/[mapId]/chain-distances`) — hand-checkable gate-jump counts over a seeded stargate line, the J-space origin-set case, chain visibility, and the guard paths. Calls the route handler directly with `@/lib/session` mocked (plain `getSession` factory — the route reads nothing else from that module).
**File:** `tests/integration/chain-distances.test.ts`

Run with `RUN_DB_TESTS=1` against a migrated Postgres (skipped otherwise). Fixture id range claimed: universe `98051xxx`, corp/characters `99063xxx`.

### Fixture
A gate line K1—K2—K3—K4 (`universe_stargate_edge`; the Jita → Perimeter = 1 idiom) plus J-space systems J1–J3; a corp map with J1/J2/K1/K3/K4 placed. Chains: shared A (J1 root → K1 exit), shared B (J2 root → K3 + K4 exits), the viewer's personal chain (J1 only — no k-space member), and a foreign personal chain owned by another account's character. The measured pilot is the session character (`ap_character.last_system_id`/`last_online` updated per test).

### Covers
- **K-space pilot** — at K1: chain A = 0 (sitting on the exit, never "—"), chain B = 2 with nearest exit K3 (beats K4 at 3), own personal chain = null, the foreign personal chain absent from the payload entirely; `originSystemId`/`characterId` echoed. One gate out (K2): A = 1.
- **J-space pilot inside a chain** — at J2 (member of B): origins are B's exits, so B = 0 and A = 2 (min over pairs).
- **Unknown responses** — a J-space pilot outside every visible chain, and an offline pilot, both return `originSystemId: null` with all-null distances.
- **Guards** — a character on another account 404s; missing/malformed `characterId` 400s; a session character outside the owning corp 404s via `requireMapView`.
