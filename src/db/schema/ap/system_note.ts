import {
  bigint,
  bigserial,
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
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
    // Null ⇒ uncategorized (no chip in the panel). Plain text, not a pgEnum:
    // the vocabulary is deployment config (`apertureConfig.SYSTEM_NOTE_CATEGORIES`),
    // validated at the API boundary; a value absent from the current config
    // renders as a neutral chip.
    category: text('category'),
    // A locked note refuses edit/delete server-side until unlocked. Any
    // authenticated user may unlock — a guard rail against accidents, not
    // malice; the audit log covers malice.
    locked: boolean('locked').notNull().default(false),
    // Audit only — erasing a character must not cascade-wipe gathered intel.
    createdByCharacterId: bigint('created_by_character_id', { mode: 'bigint' }).references(
      () => apCharacter.id,
      { onDelete: 'set null' },
    ),
    lastEditedByCharacterId: bigint('last_edited_by_character_id', { mode: 'bigint' }).references(
      () => apCharacter.id,
      { onDelete: 'set null' },
    ),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('ap_system_note_system_id_idx').on(t.systemId)],
);
