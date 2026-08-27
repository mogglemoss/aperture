import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  index,
  pgTable,
  uniqueIndex,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { apMapChain } from './map_chain';
import { apMapSystem } from './map_system';
import { apMapConnection } from './map_connection';

// nomadic-chains: one occurrence of a canonical system inside a chain's tree.
// The parent link records *how it was charted* (the member you came from) —
// information an undirected graph cannot reproduce, which is why membership is
// written at charting time, not derived. The canvas in chain mode renders one
// node per member; the canonical `ap_map_system` row keeps owning signatures,
// status, alias, lock, and notes, shared across every occurrence.
//
// A member with `pointer_chain_id` set is a pointer-leaf: the connection's far
// side already belongs to that other chain (or re-enters this one — a loop),
// so the tree terminates here with a "continues in …" pill instead of
// recursively unfolding the other chain's subtree.
export const apMapChainMember = pgTable(
  'ap_map_chain_member',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    chainId: bigint('chain_id', { mode: 'bigint' })
      .notNull()
      .references(() => apMapChain.id, { onDelete: 'cascade' }),
    mapSystemId: bigint('map_system_id', { mode: 'bigint' })
      .notNull()
      .references(() => apMapSystem.id, { onDelete: 'cascade' }),
    // NULL ⇔ the chain's root (its anchor). CASCADE: removing a member takes
    // its whole subtree — pruning a branch is one delete.
    parentMemberId: bigint('parent_member_id', { mode: 'bigint' }).references(
      (): AnyPgColumn => apMapChainMember.id,
      { onDelete: 'cascade' },
    ),
    // The connection traversed to reach this member; SET NULL so a collapsed
    // hole leaves the occurrence in place (the tree outlives its wormholes).
    viaConnectionId: bigint('via_connection_id', { mode: 'bigint' }).references(
      () => apMapConnection.id,
      { onDelete: 'set null' },
    ),
    // Non-null ⇔ pointer-leaf: the chain this branch continues in. SET NULL so
    // deleting that chain degrades the pill to a plain leaf rather than
    // deleting this chain's member.
    pointerChainId: bigint('pointer_chain_id', { mode: 'bigint' }).references(
      () => apMapChain.id,
      { onDelete: 'set null' },
    ),
  },
  (t) => [
    index('ap_map_chain_member_chain_id_idx').on(t.chainId),
    index('ap_map_chain_member_map_system_id_idx').on(t.mapSystemId),
    // One *real* occurrence per system per chain. Partial: pointer-leaves are
    // exempt, because a loop pointer-leaf names a system that already occurs
    // in this very chain — a full UNIQUE would forbid the loop pill.
    uniqueIndex('ap_map_chain_member_chain_system_uq')
      .on(t.chainId, t.mapSystemId)
      .where(sql`${t.pointerChainId} is null`),
  ],
);
