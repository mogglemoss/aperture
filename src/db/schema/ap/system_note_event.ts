import { bigint, bigserial, index, integer, jsonb, pgTable, timestamp } from 'drizzle-orm/pg-core';
import { apCharacter } from './character';
import { systemNoteEventKind } from './enums';

// Append-only accountability log for global system notes (`ap_system_note`).
// Notes are deployment-global and any authenticated user may create/edit/delete
// them, so every mutation is recorded here stamped with the acting character —
// that's how griefers are identified.
//
// Deliberately FK-less on `note_id` / `system_id`: a `delete` record must
// survive the hard-delete of its `ap_system_note` row (the row is gone, but the
// audit trail — including the full pre-delete snapshot in `payload` — must
// remain). Only `character_id` is a real FK, SET NULL on erase, matching the
// audit convention of `ap_map_event` and `ap_system_note.created_by_character_id`.
export const apSystemNoteEvent = pgTable(
  'ap_system_note_event',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    noteId: bigint('note_id', { mode: 'bigint' }).notNull(),
    systemId: integer('system_id').notNull(),
    characterId: bigint('character_id', { mode: 'bigint' }).references(() => apCharacter.id, {
      onDelete: 'set null',
    }),
    kind: systemNoteEventKind('kind').notNull(),
    // The values written (create/update) or the full pre-delete row (delete).
    payload: jsonb('payload'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('ap_system_note_event_note_id_idx').on(t.noteId),
    index('ap_system_note_event_character_id_idx').on(t.characterId),
  ],
);
