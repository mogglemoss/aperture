import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { apSystemNote, apSystemNoteEvent } from '@/db/schema';
import type { ApSystemNote } from '@/types';

/**
 * Global system-note mutations. Notes are deployment-global manual intel with
 * no `map_id`, so they do NOT go through `commitMapEvent` / `ap_map_event` and
 * emit no realtime event — they are a plain REST resource.
 *
 * Every mutation writes the `ap_system_note` row AND one `ap_system_note_event`
 * audit row in the same transaction, stamped with the acting character, so that
 * — since any authenticated user may edit any note — griefers remain
 * identifiable. Deletes are hard deletes; the audit row carries the full
 * pre-delete snapshot so the intel stays recoverable.
 */

export type CreateSystemNoteInput = {
  systemId: number;
  body: string;
  characterId: bigint | null;
};

export type UpdateSystemNoteInput = {
  noteId: bigint;
  body: string;
  characterId: bigint | null;
};

export type DeleteSystemNoteInput = {
  noteId: bigint;
  characterId: bigint | null;
};

/** Plain JSON snapshot of a note row for the audit `payload` (no bigints/Dates). */
function snapshot(row: ApSystemNote) {
  return {
    id: row.id.toString(),
    systemId: row.systemId,
    body: row.body,
    createdByCharacterId: row.createdByCharacterId?.toString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Insert a note + a `create` audit event. Returns the new row. */
export function createSystemNote(input: CreateSystemNoteInput): Promise<ApSystemNote> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(apSystemNote)
      .values({
        systemId: input.systemId,
        body: input.body,
        createdByCharacterId: input.characterId,
      })
      .returning();
    await tx.insert(apSystemNoteEvent).values({
      noteId: row!.id,
      systemId: row!.systemId,
      characterId: input.characterId,
      kind: 'create',
      payload: snapshot(row!),
    });
    return row!;
  });
}

/**
 * Replace a note's body (`updated_at` bumps) + an `update` audit event carrying
 * the new body. Returns the updated row, or null if the id does not exist (no
 * event written).
 */
export function updateSystemNote(input: UpdateSystemNoteInput): Promise<ApSystemNote | null> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(apSystemNote)
      .set({ body: input.body, updatedAt: new Date() })
      .where(eq(apSystemNote.id, input.noteId))
      .returning();
    if (!row) return null;

    await tx.insert(apSystemNoteEvent).values({
      noteId: row.id,
      systemId: row.systemId,
      characterId: input.characterId,
      kind: 'update',
      payload: { body: input.body },
    });
    return row;
  });
}

/**
 * Hard-delete a note + a `delete` audit event holding the full pre-delete
 * snapshot. Returns the deleted row, or null if the id did not exist.
 */
export function deleteSystemNote(input: DeleteSystemNoteInput): Promise<ApSystemNote | null> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .delete(apSystemNote)
      .where(eq(apSystemNote.id, input.noteId))
      .returning();
    if (!row) return null;

    await tx.insert(apSystemNoteEvent).values({
      noteId: row.id,
      systemId: row.systemId,
      characterId: input.characterId,
      kind: 'delete',
      payload: snapshot(row),
    });
    return row;
  });
}
