## chains.ts

**Purpose:** Nomadic-chains mutations — chain-tab lifecycle (create / rename / delete, with seed-on-anchor), the membership write-through the charting mutations call, and the universal fan-out helpers every charting pathway attaches through — every change landing as one `ap_map_event` (`chain.*` kinds) via `commitMapEvent`.
**File:** `src/lib/map/mutations/chains.ts`

Authority model: `personal` chains answer only to their owner — a foreign personal chain (anyone else's, managers and admins included) throws the same `Chain not found.` as a missing one, so its existence never leaks through the write path. `shared` chains require map-management authority: the caller resolves `canManageMap` and passes it as `canManage`. Charting *into* a chain follows the same rule — any viewer grows a shared chain (content editing is view authority), only the owner grows their personal chain. Fan-out mirrors it: a charting action grows shared chains plus the ACTOR's own personal chains; foreign personal chains are excluded.

---

### createChain(input: CreateChainInput): Promise<ActionResult<MapEventPayload>>
Creates a chain tab. `personal` ⇒ `owner_character_id = characterId` (throws if `characterId` is null); `shared` ⇒ owner null, `created_by_character_id` audit column set, and `canManage` must be true (throws otherwise — the route also 403s before calling). Accepts an optional outer `tx` (joined by `createChainWithSeed`; failures then throw). Emits `chain.created` with the full chain body.

### createChainWithSeed(input: CreateChainInput & { anchorMapSystemId: bigint | null }): Promise<ActionResult<CreateChainResult>>
The chain-create orchestrator the POST route calls: one `db.transaction` running `createChain` and — when `anchorMapSystemId` is non-null — the root attach + seed walk (`attachChainMemberOnSystemAdd` with a null parent). The anchor must be a visible `ap_map_system` row of this map (`Anchor system not found on this map.` otherwise, rolling everything back). Returns `{ payloads }`: `chain.created` first, then each seeded `chain.member.added` — the client folds them like a bulk paste (wrapper `eventId` is `0`). Re-fires the webhook enqueue for the `chain.created` event after commit; member events are structural and do not notify.

### renameChain(input: RenameChainInput): Promise<ActionResult<MapEventPayload>>
Renames a chain (owner for personal, `canManage` for shared), bumping `updated_at`. Emits `chain.renamed` → `{ id, name, updatedAt }`.

### deleteChain(input: DeleteChainInput): Promise<ActionResult<MapEventPayload>>
Deletes a chain row (same guard as rename). Member rows cascade; pointer-leaves in *other* chains that named it degrade to plain leaves (`pointer_chain_id SET NULL`); canonical `ap_map_system` rows are untouched. Emits `chain.deleted` → `{ id, name }` (name captured for the audit — the row is gone).

---

### attachChainMemberOnSystemAdd(tx, { mapId, characterId, chainId, parentMemberId, mapSystemId }): Promise<MapEventPayload[]>
Membership write-through for a system charted into a chain tab, joined to the caller's transaction; failures throw so the whole operation rolls back. Inserts one *real* occurrence: a child of `parentMemberId` (which must be a real member of the chain), or the chain's root when null — refused with `Chain already has an anchor.` when a root already exists (chains are single-anchor trees). **A root insert then runs the seed walk** (seed on anchor): the anchor's existing subtree over the map's confirmed `scope='wh'` connections is adopted as initial members. The walk consumes connections in creation order (id asc, restarting after each attachment) so parentage reproduces what live charting in that order would have built; every attachment goes through `attachChainMemberOnConnection`, so loop / cross-chain pointer-leaf semantics cannot diverge — and a pointer-leaf is terminal (another chain's subtree is never unfolded). When both endpoints of a connection are already members, the stored source→target direction (= charting direction) picks which member a loop pointer-leaf hangs under. Gates / jumpbridges / abyssal links and dormant holes (`confirmed_at IS NULL`) are never traversed — k-space may be the anchor or appear as members reached over a wh link, but a gate never drags known space into a tab. Idempotent: a system already really occurring in the chain returns `[]` (no member, no event). Returns the committed `chain.member.added` payloads (the root's first) — N small per-member events, never one payload scaling with subtree size.

### attachChainMemberOnConnection(tx, { mapId, characterId, chainId, sourceMemberId, connectionId, sourceMapSystemId, targetMapSystemId }): Promise<MapEventPayload | null>
Membership write-through for a connection charted from a chain member. `sourceMemberId` must be a real member of the chain and one of the connection's endpoints must be its system; the *far* endpoint decides what accretes:
- far side is the source member's **tree neighbour** in this chain (its parent or child) — the edge is already represented: backfills the *child of the pair*'s `via_connection_id` when unset (via = how a member is reached from its parent; a root's stays null; re-broadcast as an upsert `chain.member.added`), else nothing.
- far side really occurs **elsewhere in this chain** — a *loop* pointer-leaf child of the source member (`pointer_chain_id` = this chain).
- far side really occurs **in another chain** of the map — a pointer-leaf naming the earliest such chain (lowest member id — a stable pick when several qualify); `pointerChainName` rides the payload.
- far side occurs **nowhere** — a real occurrence, child of the source member, `via` this connection.

Duplicate pointer-leaves under the same parent are suppressed (returns null). Returns the committed `chain.member.added` payload, or null when nothing changed.

---

### chainsHoldingSystem(tx, { mapId, mapSystemId, actorCharacterId }): Promise<{ chainId, memberId }[]>
The holder set a charting action from `mapSystemId` fans out to: every chain holding a *real* occurrence of the system — shared chains plus the actor's own personal chains (a null actor ⇒ shared only) — in chain-creation order (chain id), each with its real member of the system. Shared by the tracked-jump fold (`locationCommit.ts`) and both fan-out helpers below, so the holder rule cannot fork.

### fanOutChainMembershipsOnConnection(tx, { mapId, characterId, connectionId, fromMapSystemId, toMapSystemId }): Promise<MapEventPayload[]>
Universal fan-out for a charted (or traversed / re-confirmed) connection: applies `attachChainMemberOnConnection` to every holder of the **from**-system, in chain-id order — the earliest chain accretes the real occurrence of the destination and later ones accrete pointer-leaves to it. `from`/`to` are the charting direction as the caller observed it (jump direction, draw source→target, sig-system→destination), independent of the stored row direction. Idempotent per chain. Callers: the connections POST orchestrator (`createConnectionWithChainMembership`, `wh` only), `ensureWhConnection` (Thera / fixed-destination folds), `restoreConnection`.

### fanOutChainMembershipsOnSystemAdd(tx, { mapId, characterId, chainId, parentMemberId, newMapSystemId }): Promise<MapEventPayload[]>
Universal fan-out for a manual system add charted from a chain member. The hint (`chainId` + `parentMemberId` — the active tab and the occurrence charted from) is guard-loaded (foreign personal ⇒ `Chain not found.`, bad parent ⇒ `Parent member not found in chain.` — either rolls the add back) and supplies the from-system; the new system then joins every holder of that from-system in chain-id order: the earliest chain without it accretes the real child occurrence (via null — an add charts no connection; a later drawn/jumped link backfills it), chains already really holding it no-op, chains finding it real elsewhere accrete a pointer-leaf under their member of the from-system (deduped per parent). The hinted tab is the guard + from-system source, never a propagation limit or a priority.

### type CreateChainInput / CreateChainResult / RenameChainInput / DeleteChainInput / SystemAddChainContext
Input bags for the helpers, the create-orchestrator result (`{ payloads }`), and the chain-context shape a system-add carries (`SystemAddChainContext` = `{ chainId, parentMemberId | null }` — null parent ⇒ root + seed). Re-exported from `src/types/index.ts`.

### Depends On
- `commitMapEvent`, `enqueueWebhookDispatch` (`./core`) — the single commit primitive + the post-commit enqueue for the seeded create.
- `db` (`@/db/client`) — opens the create-orchestrator transaction.
- `apMapChain`, `apMapChainMember`, `apMapConnection`, `apMapSystem`, `chainKind` (Drizzle schema).
- `mapEventPayloadSchema` variants `chain.*` (`@/lib/realtime/protocol`).

### Notes
- **No `import 'server-only'` — direct or transitive** — like `core.ts`, this module is the seam for the plain-Node graphile-worker fold path (`locationCommit.ts` calls `chainsHoldingSystem` + `attachChainMemberOnConnection` for tracking-driven membership), which crashes on the `server-only` import. That forbids importing guarded siblings (`connections.ts`, `systems.ts`, …); route-only orchestration joining chains with those modules lives on their side (`createConnectionWithChainMembership` in `connections.ts`). Verify with `pnpm exec tsx -e "import('./src/lib/map/mutations/chains.ts')"`.
