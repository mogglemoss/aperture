## chains.ts

**Purpose:** Nomadic-chains mutations — chain-tab lifecycle (create / rename / delete) and the membership write-through the charting mutations call, every change landing as one `ap_map_event` (`chain.*` kinds) via `commitMapEvent`.
**File:** `src/lib/map/mutations/chains.ts`

Authority model: `personal` chains answer only to their owner — a foreign personal chain (anyone else's, managers and admins included) throws the same `Chain not found.` as a missing one, so its existence never leaks through the write path. `shared` chains require map-management authority: the caller resolves `canManageMap` and passes it as `canManage`. Charting *into* a chain follows the same rule — any viewer grows a shared chain (content editing is view authority), only the owner grows their personal chain.

---

### createChain(input: CreateChainInput): Promise<ActionResult<MapEventPayload>>
Creates a chain tab. `personal` ⇒ `owner_character_id = characterId` (throws if `characterId` is null); `shared` ⇒ owner null, `created_by_character_id` audit column set, and `canManage` must be true (throws otherwise — the route also 403s before calling). Emits `chain.created` with the full chain body.

### renameChain(input: RenameChainInput): Promise<ActionResult<MapEventPayload>>
Renames a chain (owner for personal, `canManage` for shared), bumping `updated_at`. Emits `chain.renamed` → `{ id, name, updatedAt }`.

### deleteChain(input: DeleteChainInput): Promise<ActionResult<MapEventPayload>>
Deletes a chain row (same guard as rename). Member rows cascade; pointer-leaves in *other* chains that named it degrade to plain leaves (`pointer_chain_id SET NULL`); canonical `ap_map_system` rows are untouched. Emits `chain.deleted` → `{ id, name }` (name captured for the audit — the row is gone).

---

### attachChainMemberOnSystemAdd(tx, { mapId, characterId, chainId, parentMemberId, mapSystemId }): Promise<MapEventPayload | null>
Membership write-through for a system add charted into a chain tab, joined to the caller's transaction (`addSystemWithStargateLinks`); failures throw so the whole add rolls back. Inserts one *real* occurrence: a child of `parentMemberId` (which must be a real member of the chain), or the chain's root when null — refused with `Chain already has an anchor.` when a root already exists (chains are single-anchor trees). Idempotent: a system already really occurring in the chain returns null (no member, no event). Emits `chain.member.added` otherwise.

### attachChainMemberOnConnection(tx, { mapId, characterId, chainId, sourceMemberId, connectionId, sourceMapSystemId, targetMapSystemId }): Promise<MapEventPayload | null>
Membership write-through for a connection charted from a chain member. `sourceMemberId` must be a real member of the chain and one of the connection's endpoints must be its system; the *far* endpoint decides what accretes:
- far side is the source member's **tree neighbour** in this chain (its parent or child) — the edge is already represented: backfills the *child of the pair*'s `via_connection_id` when unset (via = how a member is reached from its parent; a root's stays null; re-broadcast as an upsert `chain.member.added`), else nothing.
- far side really occurs **elsewhere in this chain** — a *loop* pointer-leaf child of the source member (`pointer_chain_id` = this chain).
- far side really occurs **in another chain** of the map — a pointer-leaf naming the earliest such chain (lowest member id — a stable pick when several qualify); `pointerChainName` rides the payload.
- far side occurs **nowhere** — a real occurrence, child of the source member, `via` this connection.

Duplicate pointer-leaves under the same parent are suppressed (returns null). Returns the committed `chain.member.added` payload, or null when nothing changed.

### type CreateChainInput / RenameChainInput / DeleteChainInput / SystemAddChainContext / ConnectionChainContext
Input bags for the helpers plus the two chain-context shapes the charting mutations accept (`SystemAddChainContext` = `{ chainId, parentMemberId | null }`, `ConnectionChainContext` = `{ chainId, sourceMemberId }`). Re-exported from `src/types/index.ts`.

### Depends On
- `commitMapEvent` (`./core`) — the single commit primitive.
- `apMapChain`, `apMapChainMember`, `chainKind` (Drizzle schema).
- `mapEventPayloadSchema` variants `chain.*` (`@/lib/realtime/protocol`).

### Notes
- **No `import 'server-only'` — direct or transitive** — like `core.ts`, this module is the seam for the plain-Node graphile-worker fold path (`locationCommit.ts` calls `attachChainMemberOnConnection` for tracking-driven membership), which crashes on the `server-only` import. That forbids importing guarded siblings (`connections.ts`, `systems.ts`, …); route-only orchestration joining chains with those modules lives on their side (`createConnectionWithChainMembership` in `connections.ts`).
