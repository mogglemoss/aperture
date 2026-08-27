import { and, asc, eq, isNull, ne } from 'drizzle-orm';
import { db } from '@/db/client';
import { apMapChain, apMapChainMember, chainKind } from '@/db/schema';
import { commitMapEvent, enqueueWebhookDispatch, type ActionResult, type Tx } from './core';
import { createConnection, type CreateConnectionInput } from './connections';
import type { MapEventPatch, MapEventPayload } from '@/lib/realtime/protocol';

/**
 * Chain (nomadic-chains) mutations: tab lifecycle (create / rename / delete)
 * plus the membership write-through the charting mutations call so occurrences
 * accrete as charting happens. Every change lands as an ordinary `ap_map_event`
 * (`chain.*` kinds) via `commitMapEvent` — the WS task vocabulary is untouched.
 *
 * Authority model (settled design): `personal` chains are creatable / renamable
 * / deletable only by their owner — a foreign personal chain reads as "Chain
 * not found." so its existence never leaks through the write path. `shared`
 * chains require map-management authority (`canManageMap`), resolved by the
 * route and passed in as `canManage`. Charting *into* a chain follows the same
 * rule: anyone may grow a shared chain (content editing is view authority),
 * only the owner grows their personal chain.
 *
 * No `import 'server-only'`: like `core.ts`, this module is a seam for the
 * plain-Node graphile-worker fold path (tracking-driven membership), which
 * crashes on the bare `server-only` throw. All current callers are server-side.
 */

type ChainKind = (typeof chainKind.enumValues)[number];

export type CreateChainInput = {
  mapId: bigint;
  characterId: bigint | null;
  name: string;
  kind: ChainKind;
  /** Resolved `canManageMap` for the actor — required to create a `shared` chain. */
  canManage: boolean;
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

/** Chain context a system-add carries: the tab charted into + the member charted from (null ⇒ the chain's root). */
export type SystemAddChainContext = {
  chainId: bigint;
  parentMemberId: bigint | null;
};

/** Chain context a connection-create carries: the tab charted into + the member on the near end. */
export type ConnectionChainContext = {
  chainId: bigint;
  sourceMemberId: bigint;
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
 * are single-anchor trees). Idempotent: a system that already really occurs in
 * the chain is a no-op (returns null, no event). Joined to the caller's
 * transaction; failures throw so the whole add rolls back.
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
): Promise<MapEventPayload | null> {
  const chain = await loadChainGuarded(tx, args.mapId, args.chainId, args.characterId);

  if (await realMemberInChain(tx, chain.id, args.mapSystemId)) return null;

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
  return result.data;
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
      // The tree edge already exists; record which connection realises it.
      if (inThisChain.viaConnectionId !== null) return null;
      const result = await commitMapEvent({
        mapId: args.mapId,
        characterId: args.characterId,
        kind: 'chain.member.added',
        tx,
        mutate: async (t) => {
          const [row] = await t
            .update(apMapChainMember)
            .set({ viaConnectionId: args.connectionId })
            .where(eq(apMapChainMember.id, inThisChain.id))
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

/**
 * Create a connection and its chain-membership write-through atomically: one
 * transaction, one `connection.create` + at most one `chain.member.added`
 * event. The returned payload is the connection's (the route's response shape
 * is unchanged); the member event reaches every client — the initiator
 * included — over realtime. Re-fires the webhook enqueue for the connection
 * event after commit (joined-tx mode skips the per-commit enqueue); the
 * membership event is structural and does not notify.
 */
export async function createConnectionWithChainMembership(
  input: Omit<CreateConnectionInput, 'tx'>,
  chain: ConnectionChainContext,
): Promise<ActionResult<MapEventPayload>> {
  try {
    const { payload, eventId } = await db.transaction(async (tx) => {
      const created = await createConnection({ ...input, tx });
      if (!created.ok) throw new Error(created.error);
      if (created.data.kind !== 'connection.create') throw new Error('Unexpected create payload.');
      await attachChainMemberOnConnection(tx, {
        mapId: input.mapId,
        characterId: input.characterId,
        chainId: chain.chainId,
        sourceMemberId: chain.sourceMemberId,
        connectionId: BigInt(created.data.id),
        sourceMapSystemId: input.sourceMapSystemId,
        targetMapSystemId: input.targetMapSystemId,
      });
      return { payload: created.data, eventId: created.eventId };
    });

    await enqueueWebhookDispatch(input.mapId, eventId, new Date());
    return { ok: true, data: payload, eventId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Create connection failed.' };
  }
}
