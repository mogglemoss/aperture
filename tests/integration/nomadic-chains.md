## nomadic-chains.test.ts

**Purpose:** Integration coverage (real Postgres, `RUN_DB_TESTS=1`-gated) for nomadic-chains Stage 2 — chain lifecycle guards, membership write-through, pruning, and the viewer-filtered chain load.
**File:** `tests/integration/nomadic-chains.test.ts`

Fixture id range claimed by this suite: universe `98048xxx`, corp/characters `99061xxx`. Fixtures: one corp map, three same-corp characters (owner / other member / director), five J-space systems. Cleans up after itself.

Cases:
1. **Lifecycle guards** — any viewer creates a personal chain; shared creation requires `canManage`; a foreign personal chain (other member *and* manager) fails rename with `Chain not found.`; shared rename requires `canManage`.
2. **System-add write-through** — root then child memberships via `addSystemWithStargateLinks`'s chain context (payload order `system.added` → `chain.member.added`, exactly two events); a second parentless add is refused (single-anchor) and rolls the add back; re-adding an in-chain system is a membership no-op.
3. **Foreign-personal charting** — charting into someone else's personal chain fails and rolls back the whole system add.
4. **Connection write-through** — tree-adjacent draw backfills `via_connection_id` (one extra `chain.member.added`, no new row); a draw to an unchained system inserts a real child member `via` the connection; a revisit elsewhere in the chain inserts one loop pointer-leaf, deduped on a repeat draw; a shared chain accepts charting from a non-manager, and a draw landing on a system chained elsewhere inserts a cross-chain pointer-leaf.
5. **`loadMapForView` privacy** — the owner sees both chains + all members; the other member sees only the shared chain and its members.
6. **Prune on removal** — `removeSystem` deletes the system's members in every chain and the parent-FK CASCADE takes their subtrees (loop pointer-leaf included); chain rows survive.
7. **Chain delete** — members go, a pointer-leaf naming the deleted chain degrades to `pointer_chain_id NULL`, visible systems are untouched.
8. **Parent-membership guard** — `attachChainMemberOnSystemAdd` rejects a parent member belonging to a different chain.
