import { bigint, bigserial, index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { universeSystem } from '../universe/geography';
import { apCharacter } from './character';

// Global system notes: free-text intel entries on a universe system.
// System-scoped and deployment-global (shared across maps) — unlike
// `ap_map_system.intel_notes`, a note here is keyed on the static system alone,
// so intel written once is readable from any map, any time the system is
// encountered again. A journal, not a single blob: each entry keeps its own
// author and timestamps.
export const apSystemNote = pgTable(
  'ap_system_note',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    systemId: integer('system_id')
      .notNull()
      .references(() => universeSystem.id, { onDelete: 'restrict' }),
    body: text('body').notNull(),
    // Audit only — erasing a character must not cascade-wipe gathered intel.
    createdByCharacterId: bigint('created_by_character_id', { mode: 'bigint' }).references(
      () => apCharacter.id,
      { onDelete: 'set null' },
    ),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('ap_system_note_system_id_idx').on(t.systemId)],
);
