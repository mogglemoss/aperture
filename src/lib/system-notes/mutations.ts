import 'server-only';
import { eq, type InferInsertModel } from 'drizzle-orm';
import { db } from '@/db/client';
import { apSystemNote, apSystemNoteEvent } from '@/db/schema';
import type { ApSystemNote, SystemNoteCategory } from '@/types';

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
 *
 * Locking: a locked note rejects every change except the unlock itself
 * (`{ locked: false }` alone), and rejects delete. Any authenticated user may
 * toggle the lock — it is a guard rail against accidents, not an ownership
 * claim; the audit log covers malice.
 */

export type CreateSystemNoteInput = {
  systemId: number;
  body: string;
  category?: SystemNoteCategory | null;
  locked?: boolean;
  characterId: bigint | null;
};

export type UpdateSystemNotePatch = {
  body?: string;
  category?: SystemNoteCategory | null;
  locked?: boolean;
};

export type UpdateSystemNoteInput = {
  noteId: bigint;
  patch: UpdateSystemNotePatch;
  characterId: bigint | null;
};

export type DeleteSystemNoteInput = {
  noteId: bigint;
  characterId: bigint | null;
};

/** Thrown when a mutation is rejected because the note is locked. */
export class SystemNoteLockedError extends Error {
  constructor() {
    super('Note is locked.');
    this.name = 'SystemNoteLockedError';
  }
}

/** Plain JSON snapshot of a note row for the audit `payload` (no bigints/Dates). */
function snapshot(row: ApSystemNote) {
  return {
    id: row.id.toString(),
    systemId: row.systemId,
    body: row.body,
    category: row.category,
    locked: row.locked,
    createdByCharacterId: row.createdByCharacterId?.toString() ?? null,
    lastEditedByCharacterId: row.lastEditedByCharacterId?.toString() ?? null,
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
        category: input.category ?? null,
        locked: input.locked ?? false,
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
 * Patch a note (only present keys change; `updated_at` and the last-editor
 * stamp bump on every accepted patch) + an `update` audit event carrying the
 * patch. Returns the updated row, or null if the id does not exist (no event
 * written). Throws `SystemNoteLockedError` when the note is locked and the
 * patch is anything other than the bare unlock.
 */
export function updateSystemNote(input: UpdateSystemNoteInput): Promise<ApSystemNote | null> {
  const { patch } = input;
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ locked: apSystemNote.locked })
      .from(apSystemNote)
      .where(eq(apSystemNote.id, input.noteId))
      .for('update');
    if (!existing) return null;
    const isBareUnlock =
      patch.locked === false && !('body' in patch) && !('category' in patch);
    if (existing.locked && !isBareUnlock) throw new SystemNoteLockedError();

    const set: Partial<InferInsertModel<typeof apSystemNote>> = {
      updatedAt: new Date(),
      lastEditedByCharacterId: input.characterId,
    };
    if ('body' in patch) set.body = patch.body;
    if ('category' in patch) set.category = patch.category ?? null;
    if ('locked' in patch) set.locked = patch.locked;

    const [row] = await tx
      .update(apSystemNote)
      .set(set)
      .where(eq(apSystemNote.id, input.noteId))
      .returning();
    if (!row) return null;

    await tx.insert(apSystemNoteEvent).values({
      noteId: row.id,
      systemId: row.systemId,
      characterId: input.characterId,
      kind: 'update',
      payload: patch,
    });
    return row;
  });
}

/**
 * Hard-delete a note + a `delete` audit event holding the full pre-delete
 * snapshot. Returns the deleted row, or null if the id did not exist. Throws
 * `SystemNoteLockedError` when the note is locked.
 */
export function deleteSystemNote(input: DeleteSystemNoteInput): Promise<ApSystemNote | null> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ locked: apSystemNote.locked })
      .from(apSystemNote)
      .where(eq(apSystemNote.id, input.noteId))
      .for('update');
    if (!existing) return null;
    if (existing.locked) throw new SystemNoteLockedError();

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
