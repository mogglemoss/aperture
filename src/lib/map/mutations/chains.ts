import { and, asc, eq, isNotNull, isNull, ne, or } from 'drizzle-orm';
import { db } from '@/db/client';
import { apMapChain, apMapChainMember, apMapConnection, apMapSystem, chainKind } from '@/db/schema';
import { commitMapEvent, enqueueWebhookDispatch, type ActionResult, type Tx } from './core';
import type { MapEventPatch, MapEventPayload } from '@/lib/realtime/protocol';

/**
 * Chain (nomadic-chains) mutations: tab lifecycle (create / rename / delete,
 * with seed-on-anchor), the membership write-through the charting mutations
 * call, and the universal fan-out helpers every charting pathway attaches
 * through — so occurrences accrete in EVERY chain holding the from-system as
 * charting happens. Every change lands as an ordinary `ap_map_event`
 * (`chain.*` kinds) via `commitMapEvent` — the WS task vocabulary is untouched.
 *
 * Authority model (settled design): `personal` chains are creatable / renamable
 * / deletable only by their owner — a foreign personal chain reads as "Chain
 * not found." so its existence never leaks through the write path. `shared`
 * chains require map-management authority (`canManageMap`), resolved by the
 * route and passed in as `canManage`. Charting *into* a chain follows the same
 * rule: anyone may grow a shared chain (content editing is view authority),
 * only the owner grows their personal chain — the fan-out therefore reaches
 * shared chains plus the ACTOR's own personal chains, never foreign ones.
 *
 * No `import 'server-only'`: like `core.ts`, this module is a seam for the
 * plain-Node graphile-worker fold path (`locationCommit.ts` fans a tracked jump
 * out to the chains holding the from-system), which crashes on the bare
 * `server-only` throw — and on the unresolvable `server-only` specifier under
 * `tsx`. That also forbids importing any sibling that carries the guard
 * (`connections.ts` et al.); the route-only orchestrator that joins
 * `createConnection` with the fan-out lives in `connections.ts` for this reason.
 */

type ChainKind = (typeof chainKind.enumValues)[number];

export type CreateChainInput = {
  mapId: bigint;
  characterId: bigint | null;
  name: string;
  kind: ChainKind;
  /** Resolved `canManageMap` for the actor — required to create a `shared` chain. */
  canManage: boolean;
  /** Optional outer transaction (joined by `createChainWithSeed`); failures throw when passed. */
  tx?: Tx;
};

/** The `chain.created` payload followed by the seeded `chain.member.added` payloads, in commit order. */
export type CreateChainResult = {
  payloads: MapEventPayload[];
};

export type RenameChainInput = {
  mapId: bigint;
  chainId: bigint;
  characterId: bigint | null;
  name: string;
  canManage: boolean;
};

export type DeleteChainInput = {
  mapId: bigint;
  chainId: bigint;
  characterId: bigint | null;
  canManage: boolean;
};

/**
 * Chain context a system-add carries: the active tab charted into + the member
 * charted from. A null parent makes the add the chain's root (seed on anchor);
 * a non-null parent is the guard + from-system source for the universal
 * fan-out — never a propagation limit.
 */
export type SystemAddChainContext = {
  chainId: bigint;
  parentMemberId: bigint | null;
};

type ChainRow = {
  id: bigint;
  name: string;
  kind: ChainKind;
  ownerCharacterId: bigint | null;
};

/**
 * Load a chain for a write, enforcing the ownership rule: a `personal` chain
 * belonging to someone else throws the same "Chain not found." as a missing
 * one, so foreign personal chains stay invisible through the write path.
 */
async function loadChainGuarded(
  tx: Tx,
  mapId: bigint,
  chainId: bigint,
  characterId: bigint | null,
): Promise<ChainRow> {
  const [chain] = await tx
    .select({
      id: apMapChain.id,
      name: apMapChain.name,
      kind: apMapChain.kind,
      ownerCharacterId: apMapChain.ownerCharacterId,
    })
    .from(apMapChain)
    .where(and(eq(apMapChain.id, chainId), eq(apMapChain.mapId, mapId)));
  if (!chain) throw new Error('Chain not found.');
  if (chain.kind === 'personal' && (characterId === null || chain.ownerCharacterId !== characterId)) {
    throw new Error('Chain not found.');
  }
  return chain;
}

/**
 * Create a chain tab. `personal` chains require an acting character (they are
 * owned); `shared` chains require map-management authority. Emits
 * `chain.created` with the full chain body.
 */
export function createChain(input: CreateChainInput): Promise<ActionResult<MapEventPayload>> {
  return commitMapEvent({
    mapId: input.mapId,
    characterId: input.characterId,
    kind: 'chain.created',
    tx: input.tx,
    mutate: async (tx) => {
      if (input.kind === 'personal' && input.characterId === null) {
        throw new Error('A personal chain needs an owning character.');
      }
      if (input.kind === 'shared' && !input.canManage) {
        throw new Error('Creating a shared chain requires map management rights.');
      }
      const [row] = await tx
        .insert(apMapChain)
        .values({
          mapId: input.mapId,
          name: input.name,
          kind: input.kind,
          ownerCharacterId: input.kind === 'personal' ? input.characterId : null,
          createdByCharacterId: input.characterId,
        })
        .returning();
      const chain = row!;
      return {
        id: chain.id.toString(),
        name: chain.name,
        chainKind: chain.kind,
        ownerCharacterId:
          chain.ownerCharacterId === null ? null : Number(chain.ownerCharacterId),
        createdAt: chain.createdAt.toISOString(),
        updatedAt: chain.updatedAt.toISOString(),
      } satisfies MapEventPatch<'chain.created'>;
    },
  });
}

/**
 * Create a chain and — when `anchorMapSystemId` is given — seed it in the same
 * transaction: the anchor becomes the root and its existing wormhole-connected
 * subtree is adopted (`attachChainMemberOnSystemAdd`'s root path runs the seed
 * walk). The anchor must be a visible system on the map. Returns the ordered
 * payloads (`chain.created` first, then each seeded `chain.member.added`) so
 * the initiating client folds them like a bulk paste (wrapper `eventId` is 0).
 */
export async function createChainWithSeed(
  input: Omit<CreateChainInput, 'tx'> & { anchorMapSystemId: bigint | null },
): Promise<ActionResult<CreateChainResult>> {
  try {
    const { payloads, chainEventId } = await db.transaction(async (tx) => {
      let anchor: { id: bigint } | undefined;
      if (input.anchorMapSystemId !== null) {
        [anchor] = await tx
          .select({ id: apMapSystem.id })
          .from(apMapSystem)
          .where(
            and(
              eq(apMapSystem.id, input.anchorMapSystemId),
              eq(apMapSystem.mapId, input.mapId),
              eq(apMapSystem.visible, true),
            ),
          );
        if (!anchor) throw new Error('Anchor system not found on this map.');
      }

      const created = await createChain({ ...input, tx });
      if (!created.ok) throw new Error(created.error);
      if (created.data.kind !== 'chain.created') throw new Error('Unexpected create payload.');
      const out: MapEventPayload[] = [created.data];

      if (anchor) {
        const members = await attachChainMemberOnSystemAdd(tx, {
          mapId: input.mapId,
          characterId: input.characterId,
          chainId: BigInt(created.data.id),
          parentMemberId: null,
          mapSystemId: anchor.id,
        });
        out.push(...members);
      }
      return { payloads: out, chainEventId: created.eventId };
    });

    // Preserve the standalone create's webhook behaviour (the joined
    // transaction skips the per-commit enqueue). Seeded member events are
    // structural and do not notify.
    await enqueueWebhookDispatch(input.mapId, chainEventId, new Date());

    return { ok: true, data: { payloads }, eventId: 0 };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Create chain failed.' };
  }
}

/** Rename a chain (owner for `personal`, map management for `shared`). Emits `chain.renamed`. */
export function renameChain(input: RenameChainInput): Promise<ActionResult<MapEventPayload>> {
  return commitMapEvent({
    mapId: input.mapId,
    characterId: input.characterId,
    kind: 'chain.renamed',
    mutate: async (tx) => {
      const chain = await loadChainGuarded(tx, input.mapId, input.chainId, input.characterId);
      if (chain.kind === 'shared' && !input.canManage) {
        throw new Error('Managing a shared chain requires map management rights.');
      }
      const [row] = await tx
        .update(apMapChain)
        .set({ name: input.name, updatedAt: new Date() })
        .where(eq(apMapChain.id, chain.id))
        .returning({ id: apMapChain.id, name: apMapChain.name, updatedAt: apMapChain.updatedAt });
      return {
        id: row!.id.toString(),
        name: row!.name,
        updatedAt: row!.updatedAt.toISOString(),
      } satisfies MapEventPatch<'chain.renamed'>;
    },
  });
}

/**
 * Delete a chain (owner for `personal`, map management for `shared`). Removes
 * the tab and its memberships (member rows cascade; pointer-leaves in other
 * chains degrade to plain leaves via `pointer_chain_id SET NULL`) — never the
 * canonical systems. Emits `chain.deleted` carrying the name for the audit.
 */
export function deleteChain(input: DeleteChainInput): Promise<ActionResult<MapEventPayload>> {
  return commitMapEvent({
    mapId: input.mapId,
    characterId: input.characterId,
    kind: 'chain.deleted',
    mutate: async (tx) => {
      const chain = await loadChainGuarded(tx, input.mapId, input.chainId, input.characterId);
      if (chain.kind === 'shared' && !input.canManage) {
        throw new Error('Managing a shared chain requires map management rights.');
      }
      await tx.delete(apMapChain).where(eq(apMapChain.id, chain.id));
      return { id: chain.id.toString(), name: chain.name } satisfies MapEventPatch<'chain.deleted'>;
    },
  });
}

type MemberRow = {
  id: bigint;
  chainId: bigint;
  mapSystemId: bigint;
  parentMemberId: bigint | null;
  viaConnectionId: bigint | null;
  pointerChainId: bigint | null;
};

const memberColumns = {
  id: apMapChainMember.id,
  chainId: apMapChainMember.chainId,
  mapSystemId: apMapChainMember.mapSystemId,
  parentMemberId: apMapChainMember.parentMemberId,
  viaConnectionId: apMapChainMember.viaConnectionId,
  pointerChainId: apMapChainMember.pointerChainId,
};

/** The chain's *real* occurrence of a system (pointer-leaves excluded), or null. */
async function realMemberInChain(
  tx: Tx,
  chainId: bigint,
  mapSystemId: bigint,
): Promise<MemberRow | null> {
  const [row] = await tx
    .select(memberColumns)
    .from(apMapChainMember)
    .where(
      and(
        eq(apMapChainMember.chainId, chainId),
        eq(apMapChainMember.mapSystemId, mapSystemId),
        isNull(apMapChainMember.pointerChainId),
      ),
    );
  return row ?? null;
}

function memberPatch(
  row: MemberRow,
  chainName: string,
  pointerChainName: string | null,
): MapEventPatch<'chain.member.added'> {
  return {
    id: row.id.toString(),
    chainId: row.chainId.toString(),
    mapSystemId: row.mapSystemId.toString(),
    parentMemberId: row.parentMemberId === null ? null : row.parentMemberId.toString(),
    viaConnectionId: row.viaConnectionId === null ? null : row.viaConnectionId.toString(),
    pointerChainId: row.pointerChainId === null ? null : row.pointerChainId.toString(),
    chainName,
    pointerChainName,
  };
}

/**
 * Membership write-through for a system add charted into a chain tab. Inserts
 * one *real* occurrence: a child of `parentMemberId`, or the chain's root when
 * `parentMemberId` is null (allowed only while the chain has no root — chains
 * are single-anchor trees). A root insert then runs the seed walk: the anchor's
 * existing wormhole-connected subtree is adopted as initial members
 * (`seedChainSubtree`), so the returned payloads are the root's
 * `chain.member.added` followed by each seeded member's. Idempotent: a system
 * that already really occurs in the chain is a no-op (returns `[]`, no event).
 * Joined to the caller's transaction; failures throw so the whole add rolls
 * back.
 */
export async function attachChainMemberOnSystemAdd(
  tx: Tx,
  args: {
    mapId: bigint;
    characterId: bigint | null;
    chainId: bigint;
    parentMemberId: bigint | null;
    mapSystemId: bigint;
  },
): Promise<MapEventPayload[]> {
  const chain = await loadChainGuarded(tx, args.mapId, args.chainId, args.characterId);

  if (await realMemberInChain(tx, chain.id, args.mapSystemId)) return [];

  if (args.parentMemberId === null) {
    const [root] = await tx
      .select({ id: apMapChainMember.id })
      .from(apMapChainMember)
      .where(
        and(
          eq(apMapChainMember.chainId, chain.id),
          isNull(apMapChainMember.parentMemberId),
          isNull(apMapChainMember.pointerChainId),
        ),
      );
    if (root) throw new Error('Chain already has an anchor. Chart from an existing member.');
  } else {
    await loadRealMember(tx, chain.id, args.parentMemberId, 'Parent member not found in chain.');
  }

  const result = await commitMapEvent({
    mapId: args.mapId,
    characterId: args.characterId,
    kind: 'chain.member.added',
    tx,
    mutate: async (t) => {
      const [row] = await t
        .insert(apMapChainMember)
        .values({
          chainId: chain.id,
          mapSystemId: args.mapSystemId,
          parentMemberId: args.parentMemberId,
        })
        .returning(memberColumns);
      return memberPatch(row!, chain.name, null);
    },
  });
  if (!result.ok) throw new Error(result.error);
  const payloads: MapEventPayload[] = [result.data];

  // The chain just gained its anchor: adopt the anchor's existing
  // wormhole-connected subtree as initial members (seed on anchor).
  if (args.parentMemberId === null && result.data.kind === 'chain.member.added') {
    const seeded = await seedChainSubtree(tx, {
      mapId: args.mapId,
      characterId: args.characterId,
      chainId: chain.id,
      rootMemberId: BigInt(result.data.id),
      rootMapSystemId: args.mapSystemId,
    });
    payloads.push(...seeded);
  }
  return payloads;
}

/**
 * Seed walk (seed on anchor): starting from a chain's just-inserted root,
 * adopt the subtree reachable over the map's existing **confirmed `wh`**
 * connections — the walk never traverses stargate/jumpbridge/abyssal links
 * (k-space may be the anchor or appear as exit leaves, but gates must not drag
 * known space into a tab), and never a dormant hole. Connections are consumed
 * in creation order (id asc, restarting after each attachment), so parentage
 * reproduces what live charting in that order would have built; when both
 * endpoints are already members, the stored source→target direction (= charting
 * direction) picks which member the resulting loop pointer-leaf hangs under.
 * Every attachment goes through `attachChainMemberOnConnection`, so
 * loop / cross-chain pointer-leaf semantics cannot diverge from live charting —
 * and a pointer-leaf is terminal (the walk never unfolds another chain's
 * subtree). Emits one `chain.member.added` per adopted member — N small events,
 * never one payload scaling with subtree size.
 */
async function seedChainSubtree(
  tx: Tx,
  args: {
    mapId: bigint;
    characterId: bigint | null;
    chainId: bigint;
    rootMemberId: bigint;
    rootMapSystemId: bigint;
  },
): Promise<MapEventPayload[]> {
  const connections = await tx
    .select({
      id: apMapConnection.id,
      source: apMapConnection.sourceMapSystemId,
      target: apMapConnection.targetMapSystemId,
    })
    .from(apMapConnection)
    .where(
      and(
        eq(apMapConnection.mapId, args.mapId),
        eq(apMapConnection.scope, 'wh'),
        isNotNull(apMapConnection.confirmedAt),
      ),
    )
    .orderBy(asc(apMapConnection.id));

  const payloads: MapEventPayload[] = [];
  // This chain's real members by map-system id, grown as the walk adopts.
  const memberBySystem = new Map<string, bigint>([
    [args.rootMapSystemId.toString(), args.rootMemberId],
  ]);
  const consumed = new Set<string>();

  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const conn of connections) {
      const key = conn.id.toString();
      if (consumed.has(key)) continue;
      const sourceMember = memberBySystem.get(conn.source.toString());
      const targetMember = memberBySystem.get(conn.target.toString());
      if (sourceMember === undefined && targetMember === undefined) continue;

      consumed.add(key);
      const payload = await attachChainMemberOnConnection(tx, {
        mapId: args.mapId,
        characterId: args.characterId,
        chainId: args.chainId,
        // Stored direction = charting direction: when both ends are already
        // members the source side is the one the link was charted from.
        sourceMemberId: sourceMember ?? targetMember!,
        connectionId: conn.id,
        sourceMapSystemId: conn.source,
        targetMapSystemId: conn.target,
      });
      if (payload) {
        payloads.push(payload);
        if (payload.kind === 'chain.member.added' && payload.pointerChainId === null) {
          memberBySystem.set(payload.mapSystemId, BigInt(payload.id));
        }
      }
      // Restart the scan: an earlier-id connection may now touch a member, and
      // creation order decides parentage.
      progressed = true;
      break;
    }
  }

  return payloads;
}

/** A member row that must exist, belong to the chain, and be real (not a pointer-leaf). */
async function loadRealMember(
  tx: Tx,
  chainId: bigint,
  memberId: bigint,
  errorMessage: string,
): Promise<MemberRow> {
  const [row] = await tx
    .select(memberColumns)
    .from(apMapChainMember)
    .where(and(eq(apMapChainMember.id, memberId), eq(apMapChainMember.chainId, chainId)));
  if (!row || row.pointerChainId !== null) throw new Error(errorMessage);
  return row;
}

/**
 * Membership write-through for a connection charted from a chain member. The
 * far endpoint (relative to `sourceMemberId`) decides what accretes:
 *
 * - already *really* occurs in this chain as the source member's tree
 *   neighbour (its parent or child) → the edge is already represented; the
 *   member's `via_connection_id` is backfilled if unset (re-broadcast as an
 *   upsert `chain.member.added`), else nothing happens.
 * - already really occurs elsewhere in this chain → a *loop* pointer-leaf
 *   ("loops to X") child of the source member.
 * - already really occurs in another chain of the map → a pointer-leaf
 *   ("continues in <chain>") naming the earliest such chain (stable pick).
 * - occurs nowhere → a real occurrence, child of the source member, reached
 *   via this connection.
 *
 * Duplicate pointer-leaves under the same parent are suppressed. Returns the
 * committed `chain.member.added` payload, or null when nothing changed.
 */
export async function attachChainMemberOnConnection(
  tx: Tx,
  args: {
    mapId: bigint;
    characterId: bigint | null;
    chainId: bigint;
    sourceMemberId: bigint;
    connectionId: bigint;
    sourceMapSystemId: bigint;
    targetMapSystemId: bigint;
  },
): Promise<MapEventPayload | null> {
  const chain = await loadChainGuarded(tx, args.mapId, args.chainId, args.characterId);
  const source = await loadRealMember(
    tx,
    chain.id,
    args.sourceMemberId,
    'Source member not found in chain.',
  );

  let farMapSystemId: bigint;
  if (source.mapSystemId === args.sourceMapSystemId) {
    farMapSystemId = args.targetMapSystemId;
  } else if (source.mapSystemId === args.targetMapSystemId) {
    farMapSystemId = args.sourceMapSystemId;
  } else {
    throw new Error('Source member is not an endpoint of the connection.');
  }

  const commitMember = async (
    values: {
      parentMemberId: bigint | null;
      viaConnectionId: bigint | null;
      pointerChainId: bigint | null;
    },
    pointerChainName: string | null,
  ): Promise<MapEventPayload> => {
    const result = await commitMapEvent({
      mapId: args.mapId,
      characterId: args.characterId,
      kind: 'chain.member.added',
      tx,
      mutate: async (t) => {
        const [row] = await t
          .insert(apMapChainMember)
          .values({ chainId: chain.id, mapSystemId: farMapSystemId, ...values })
          .returning(memberColumns);
        return memberPatch(row!, chain.name, pointerChainName);
      },
    });
    if (!result.ok) throw new Error(result.error);
    return result.data;
  };

  const inThisChain = await realMemberInChain(tx, chain.id, farMapSystemId);
  if (inThisChain) {
    const treeAdjacent =
      inThisChain.parentMemberId === source.id || source.parentMemberId === inThisChain.id;
    if (treeAdjacent) {
      // The tree edge already exists; record which connection realises it. The
      // via belongs to the *child* of the pair (via = how the member was
      // reached from its parent) — a traversal from the child toward its
      // parent must never stamp the parent's via (a root's stays null).
      const child = inThisChain.parentMemberId === source.id ? inThisChain : source;
      if (child.viaConnectionId !== null) return null;
      const result = await commitMapEvent({
        mapId: args.mapId,
        characterId: args.characterId,
        kind: 'chain.member.added',
        tx,
        mutate: async (t) => {
          const [row] = await t
            .update(apMapChainMember)
            .set({ viaConnectionId: args.connectionId })
            .where(eq(apMapChainMember.id, child.id))
            .returning(memberColumns);
          return memberPatch(row!, chain.name, null);
        },
      });
      if (!result.ok) throw new Error(result.error);
      return result.data;
    }
    // A revisit of a system elsewhere in this chain — a loop pointer-leaf.
    if (await pointerLeafExists(tx, chain.id, farMapSystemId, source.id)) return null;
    return commitMember(
      { parentMemberId: source.id, viaConnectionId: args.connectionId, pointerChainId: chain.id },
      chain.name,
    );
  }

  const other = await earliestRealMemberElsewhere(tx, args.mapId, chain.id, farMapSystemId);
  if (other) {
    if (await pointerLeafExists(tx, chain.id, farMapSystemId, source.id)) return null;
    return commitMember(
      {
        parentMemberId: source.id,
        viaConnectionId: args.connectionId,
        pointerChainId: other.chainId,
      },
      other.chainName,
    );
  }

  return commitMember(
    { parentMemberId: source.id, viaConnectionId: args.connectionId, pointerChainId: null },
    null,
  );
}

/** Whether a pointer-leaf for this system already hangs under this parent (dedupe). */
async function pointerLeafExists(
  tx: Tx,
  chainId: bigint,
  mapSystemId: bigint,
  parentMemberId: bigint,
): Promise<boolean> {
  const [row] = await tx
    .select({ id: apMapChainMember.id })
    .from(apMapChainMember)
    .where(
      and(
        eq(apMapChainMember.chainId, chainId),
        eq(apMapChainMember.mapSystemId, mapSystemId),
        eq(apMapChainMember.parentMemberId, parentMemberId),
      ),
    );
  return row !== undefined;
}

/**
 * The chains a charting action from `mapSystemId` grows (universal fan-out):
 * every chain on the map holding a *real* occurrence of the system — shared
 * chains plus the ACTOR's own personal chains (a foreign personal chain answers
 * only to its owner; a null actor grows shared chains only) — in chain-creation
 * order (chain id), so when several qualify the earliest accretes the real
 * occurrence of the destination and the rest accrete pointer-leaves to it.
 * Returns each chain with its real member of the system.
 */
export async function chainsHoldingSystem(
  tx: Tx,
  args: { mapId: bigint; mapSystemId: bigint; actorCharacterId: bigint | null },
): Promise<Array<{ chainId: bigint; memberId: bigint }>> {
  return tx
    .select({ chainId: apMapChain.id, memberId: apMapChainMember.id })
    .from(apMapChainMember)
    .innerJoin(apMapChain, eq(apMapChainMember.chainId, apMapChain.id))
    .where(
      and(
        eq(apMapChain.mapId, args.mapId),
        eq(apMapChainMember.mapSystemId, args.mapSystemId),
        isNull(apMapChainMember.pointerChainId),
        args.actorCharacterId === null
          ? eq(apMapChain.kind, 'shared')
          : or(
              eq(apMapChain.kind, 'shared'),
              eq(apMapChain.ownerCharacterId, args.actorCharacterId),
            ),
      ),
    )
    .orderBy(asc(apMapChain.id));
}

/**
 * Universal fan-out for a charted (or traversed) connection: apply the
 * connection-attach semantics to EVERY chain holding a real occurrence of the
 * from-system (`chainsHoldingSystem` — shared + the actor's own personal
 * chains, chain-id order). `fromMapSystemId`/`toMapSystemId` are the charting
 * direction as the caller observed it, independent of the stored row direction.
 * Idempotent per chain (the attach helper's own rules). Returns the committed
 * `chain.member.added` payloads in order.
 */
export async function fanOutChainMembershipsOnConnection(
  tx: Tx,
  args: {
    mapId: bigint;
    characterId: bigint | null;
    connectionId: bigint;
    fromMapSystemId: bigint;
    toMapSystemId: bigint;
  },
): Promise<MapEventPayload[]> {
  const holders = await chainsHoldingSystem(tx, {
    mapId: args.mapId,
    mapSystemId: args.fromMapSystemId,
    actorCharacterId: args.characterId,
  });
  const payloads: MapEventPayload[] = [];
  for (const holder of holders) {
    const payload = await attachChainMemberOnConnection(tx, {
      mapId: args.mapId,
      characterId: args.characterId,
      chainId: holder.chainId,
      sourceMemberId: holder.memberId,
      connectionId: args.connectionId,
      sourceMapSystemId: args.fromMapSystemId,
      targetMapSystemId: args.toMapSystemId,
    });
    if (payload) payloads.push(payload);
  }
  return payloads;
}

/**
 * Universal fan-out for a manual system add charted from a chain member. The
 * hint (`chainId` + `parentMemberId` — the active tab and the occurrence
 * charted from) is guard-loaded (a foreign personal chain throws "Chain not
 * found.", rolling the add back) and supplies the from-system; the new system
 * then joins EVERY chain holding a real occurrence of that from-system
 * (`chainsHoldingSystem`, chain-id order): the earliest chain without it
 * accretes the real child occurrence (no via — an add charts no connection; a
 * later drawn/jumped link backfills it), chains where it already really occurs
 * no-op, and chains that find it real elsewhere accrete a pointer-leaf under
 * their member of the from-system (deduped per parent). Returns the committed
 * payloads in chain order.
 */
export async function fanOutChainMembershipsOnSystemAdd(
  tx: Tx,
  args: {
    mapId: bigint;
    characterId: bigint | null;
    chainId: bigint;
    parentMemberId: bigint;
    newMapSystemId: bigint;
  },
): Promise<MapEventPayload[]> {
  const hintChain = await loadChainGuarded(tx, args.mapId, args.chainId, args.characterId);
  const hintParent = await loadRealMember(
    tx,
    hintChain.id,
    args.parentMemberId,
    'Parent member not found in chain.',
  );

  const holders = await chainsHoldingSystem(tx, {
    mapId: args.mapId,
    mapSystemId: hintParent.mapSystemId,
    actorCharacterId: args.characterId,
  });
  const payloads: MapEventPayload[] = [];
  for (const holder of holders) {
    const chain = await loadChainGuarded(tx, args.mapId, holder.chainId, args.characterId);
    if (await realMemberInChain(tx, chain.id, args.newMapSystemId)) continue;

    const elsewhere = await earliestRealMemberElsewhere(
      tx,
      args.mapId,
      chain.id,
      args.newMapSystemId,
    );
    if (elsewhere && (await pointerLeafExists(tx, chain.id, args.newMapSystemId, holder.memberId))) {
      continue;
    }
    const result = await commitMapEvent({
      mapId: args.mapId,
      characterId: args.characterId,
      kind: 'chain.member.added',
      tx,
      mutate: async (t) => {
        const [row] = await t
          .insert(apMapChainMember)
          .values({
            chainId: chain.id,
            mapSystemId: args.newMapSystemId,
            parentMemberId: holder.memberId,
            pointerChainId: elsewhere?.chainId ?? null,
          })
          .returning(memberColumns);
        return memberPatch(row!, chain.name, elsewhere?.chainName ?? null);
      },
    });
    if (!result.ok) throw new Error(result.error);
    payloads.push(result.data);
  }
  return payloads;
}

/**
 * The earliest (lowest member id — stable across re-reads) real occurrence of a
 * system in any *other* chain on the map, with that chain's name for the
 * pointer-leaf payload.
 */
async function earliestRealMemberElsewhere(
  tx: Tx,
  mapId: bigint,
  chainId: bigint,
  mapSystemId: bigint,
): Promise<{ chainId: bigint; chainName: string } | null> {
  const [row] = await tx
    .select({ chainId: apMapChainMember.chainId, chainName: apMapChain.name })
    .from(apMapChainMember)
    .innerJoin(apMapChain, eq(apMapChainMember.chainId, apMapChain.id))
    .where(
      and(
        eq(apMapChain.mapId, mapId),
        ne(apMapChainMember.chainId, chainId),
        eq(apMapChainMember.mapSystemId, mapSystemId),
        isNull(apMapChainMember.pointerChainId),
      ),
    )
    .orderBy(asc(apMapChainMember.id))
    .limit(1);
  return row ?? null;
}
