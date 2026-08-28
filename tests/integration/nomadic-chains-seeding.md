## nomadic-chains-seeding.test.ts

**Purpose:** Integration coverage (real Postgres, `RUN_DB_TESTS=1`-gated) for nomadic-chains Stage 9 — seed on anchor + universal fan-out.
**File:** `tests/integration/nomadic-chains-seeding.test.ts`

Fixture id range claimed by this suite: universe `98052xxx`, corp/characters `99064xxx`. Fixtures: one corp, two characters (actor / ally), one map per case (`Chain Seed Test N` — cleaned up by name prefix), systems placed via `addSystem` and linked via raw `createConnection` (no fan-out) so each case controls its own membership starting state.

Cases:
1. **Wormhole-only traversal** — a chain anchored on a k-space system adopts the wh-linked subtree with parentage + via from the stored connections in creation order; a `stargate` link and a dormant (`confirmed_at NULL`) hole never traverse; a wh link *through* a k-space member still does (the stop rule is link scope, not system class). One `chain.created` + one `chain.member.added` per member, exact event count checked.
2. **Charting-order replay** — with links A→B, B→C, A→C (in that id order), seeding at A parents C under B (creation order) and turns A→C into a loop pointer-leaf hanging under the stored *source* (A).
3. **Cross-chain pointer terminal** — seeding a chain whose walk lands on a system real-membered in another chain accretes a pointer-leaf naming it (`pointerChainName` in the payload) and never unfolds the foreign subtree.
4. **First-root-add seeding** — an empty chain (`anchorMapSystemId: null` create) seeds the same walk when its root is added via `addSystemWithStargateLinks`.
5. **Anchor validation** — an anchor `ap_map_system` of another map is refused (`Anchor system not found on this map.`) and nothing commits.
6. **Connection-draw fan-out parity (Stage 2b)** — with a shared, an own-personal, and a foreign-personal chain all holding the source system, a `wh` draw grows the earliest (shared) chain with the real occurrence, the own personal chain with a pointer-leaf to it, and the foreign personal chain not at all; a repeat draw writes nothing; a `stargate` draw accretes no membership anywhere.
7. **Manual-add fan-out** — an add hinted at the actor's *personal* tab still gives the real occurrence to the earliest holder (the shared chain) and a pointer-leaf to the hinted tab — chain-id order, hint not privileged; foreign personal untouched.
8. **Event-batching bound** — a 30-member seed emits exactly 1 + 30 events, every payload under 8 KB serialized (the pg_notify ceiling), never one payload scaling with subtree size. (Generous per-test timeout — the fixture + replay run against a possibly remote DB.)
