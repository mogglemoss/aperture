## nomadic-chains-tracking.test.ts

**Purpose:** Integration coverage (real Postgres, `RUN_DB_TESTS=1`-gated) for nomadic-chains Stage 2b — tracking-driven chain membership through `foldWormholeJumpOntoMap`.
**File:** `tests/integration/nomadic-chains-tracking.test.ts`

Fixture id range claimed by this suite: universe `98049xxx`, corp/characters `99062xxx`. Fixtures: one corp map, two same-corp characters (the jumping pilot / a second member), five J-space systems, three seeded chains (the pilot's personal, a foreign personal, a shared) — the pilot's and the foreign chain both root the same system. Cleans up after itself.

Cases:
1. **Child accretion + foreign-personal exclusion** — a jump from a chained system adds the destination as a real child member (parent = the from-member, `via` = the fold's connection) and emits one `chain.member.added`; the foreign personal chain rooting the same from-system does not grow.
2. **Shuttle no-op** — the return jump and a repeat of the original jump write no events and no members; the root's `via_connection_id` stays null (a shuttle toward the root must not stamp it).
3. **Cross-chain pointer-leaf** — a jump from the shared chain landing on a system really occurring in both personal chains accretes exactly one pointer-leaf naming the earliest real member's chain, `via` the traversed connection; a repeat jump dedupes.
4. **Presence gate** — `addNewSystems = false` between two on-map systems records the connection but no membership; with an endpoint off-map the whole jump is suppressed (no map-system row, `connectionId` null). Total member rows and member events are unchanged.
