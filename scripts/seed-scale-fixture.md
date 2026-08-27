## seed-scale-fixture.ts

**Purpose:** Seeds one WDS-scale map ("Scale Fixture") — 1000 systems, 30 chains with memberships, ~5000 signatures, one `wh` connection per tree edge — for load-path measurements and real-browser scale checks of the nomadic-chains views.
**File:** `scripts/seed-scale-fixture.ts`

Run with `pnpm seed:scale-fixture` (optionally `-- --owner <characterId>`); `DATABASE_URL` selects the target database.

### Fixture shape
Mirrors the in-memory forest fixture in `tests/unit/chain-forest-view.test.ts`: 30 chains (10 shared, 20 personal, all owned/created by the fixture owner) of 33 systems each — an HS root fanning into 4 branches of depth 8 — plus 10 unassigned systems, totalling 1000. Every tree edge is a confirmed `wh` connection (every 25th EOL-flagged); every system carries 4 generic signatures and the near side of each edge carries a wormhole signature linked to its connection. Membership rows are inserted root-first then depth by depth, so bigserial member ids follow creation order (the chain layout's sibling sort key).

### Behaviour
- **Self-contained:** seeds its own synthetic `universe_region`/`universe_constellation`/`universe_system` rows in the reserved id range `98090001–98091000` — no SDE ingest required. No statics catalog rows, so node static labels are empty.
- **Idempotent:** deletes the map by name, the synthetic universe rows, and the synthetic viewer before seeding.
- **Owner:** `--owner <characterId>` makes an existing character own the (private) map — pass your own id to open it in a browser. Without it, a synthetic viewer user + character (id `98099999`, constant `VIEWER_ID`) is created and owns the map.

### Depends On
- `db`, `pool` (`@/db/client`); the `ap_map*`, `ap_map_chain*`, `ap_user`/`ap_character`, and `universe_*` geography tables (`@/db/schema`).
