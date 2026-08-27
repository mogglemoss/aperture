import { sql } from 'drizzle-orm';
import { bigint, bigserial, check, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { apMap } from './map';
import { apCharacter } from './character';
import { chainKind } from './enums';

// nomadic-chains: a chain tab — the identity of one tree of occurrences over
// the map's canonical graph (see `map_chain_member.ts`). Chains are trees,
// never merged; a chain's root member is its anchor (typically the k-space
// entrance). `personal` chains belong to one character and render only for
// them; `shared` chains are director-created and render for every viewer.
export const apMapChain = pgTable(
  'ap_map_chain',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    mapId: bigint('map_id', { mode: 'bigint' })
      .notNull()
      .references(() => apMap.id, { onDelete: 'cascade' }),
    // ≤ 40 chars, enforced app-layer (Zod).
    name: text('name').notNull(),
    kind: chainKind('kind').notNull(),
    // The owning character of a `personal` chain — CASCADE: a personal tab is
    // presentation state of one account, not corp intel, so erasing the
    // character takes the tab (and its memberships) with it. NULL ⇔ `shared`.
    ownerCharacterId: bigint('owner_character_id', { mode: 'bigint' }).references(
      () => apCharacter.id,
      { onDelete: 'cascade' },
    ),
    // Audit only — who made a shared chain; never cascade-wipes it.
    createdByCharacterId: bigint('created_by_character_id', { mode: 'bigint' }).references(
      () => apCharacter.id,
      { onDelete: 'set null' },
    ),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('ap_map_chain_map_id_idx').on(t.mapId),
    check(
      'ap_map_chain_kind_owner_chk',
      sql`(${t.kind} = 'personal' and ${t.ownerCharacterId} is not null)
          or (${t.kind} = 'shared' and ${t.ownerCharacterId} is null)`,
    ),
  ],
);
