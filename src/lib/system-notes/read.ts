import 'server-only';
import { alias } from 'drizzle-orm/pg-core';
import { asc, desc, eq, ilike, inArray, or } from 'drizzle-orm';
import { db } from '@/db/client';
import { apCharacter, apSystemNote, universeSystem } from '@/db/schema';
import type { ApSystemNote } from '@/types';

/** A global system-note row shaped for the sidebar (ids as strings, names resolved). */
export type SystemNote = {
  id: string;
  systemId: number;
  body: string;
  /** Organizational chip; null ⇒ uncategorized. */
  category: string | null;
  /** A locked note refuses edit/delete server-side until unlocked. */
  locked: boolean;
  /** `ap_character.name` of the author — light at-a-glance accountability. Null if erased. */
  createdByName: string | null;
  /** `ap_character.name` of the last editor. Null when never edited (or editor erased). */
  lastEditedByName: string | null;
  createdAt: string;
  updatedAt: string;
};

/** A search hit in the deployment-wide notes browser: a note plus its system's name. */
export type SystemNoteSearchResult = SystemNote & { systemName: string };

const editor = alias(apCharacter, 'editor');

const noteSelection = {
  id: apSystemNote.id,
  systemId: apSystemNote.systemId,
  body: apSystemNote.body,
  category: apSystemNote.category,
  locked: apSystemNote.locked,
  createdByName: apCharacter.name,
  lastEditedByName: editor.name,
  createdAt: apSystemNote.createdAt,
  updatedAt: apSystemNote.updatedAt,
};

type NoteRow = {
  id: bigint;
  systemId: number;
  body: string;
  category: string | null;
  locked: boolean;
  createdByName: string | null;
  lastEditedByName: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function shape(r: NoteRow): SystemNote {
  return {
    id: r.id.toString(),
    systemId: r.systemId,
    body: r.body,
    category: r.category,
    locked: r.locked,
    createdByName: r.createdByName,
    lastEditedByName: r.lastEditedByName,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/**
 * Global system notes for the given universe systems, keyed by `system_id`,
 * newest first within each system. One batched query joins `ap_character`
 * (twice — author and last editor) for names. Systems with no notes are absent
 * from the record.
 *
 * NOTE: system notes have no realtime channel (they are deployment-global, not
 * map-scoped — see `ap_system_note`). This snapshot is load-time only: a note
 * another user adds appears here on the next page load, not live.
 */
export async function systemNotesForSystems(
  systemIds: number[],
): Promise<Record<number, SystemNote[]>> {
  if (systemIds.length === 0) return {};
  const rows = await db
    .select(noteSelection)
    .from(apSystemNote)
    .leftJoin(apCharacter, eq(apSystemNote.createdByCharacterId, apCharacter.id))
    .leftJoin(editor, eq(apSystemNote.lastEditedByCharacterId, editor.id))
    .where(inArray(apSystemNote.systemId, systemIds))
    .orderBy(asc(apSystemNote.systemId), desc(apSystemNote.createdAt));

  const out: Record<number, SystemNote[]> = {};
  for (const r of rows) {
    (out[r.systemId] ??= []).push(shape(r));
  }
  return out;
}

/** Search-result cap: enough for a useful browse, small enough to stay snappy. */
export const NOTE_SEARCH_LIMIT = 50;

/**
 * Deployment-wide note search for the notes browser: case-insensitive substring
 * match on the note body OR the system's name, newest first, capped at
 * `NOTE_SEARCH_LIMIT`. Joins `universe_system` for the display name.
 */
export async function searchSystemNotes(query: string): Promise<SystemNoteSearchResult[]> {
  const q = `%${query.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
  const rows = await db
    .select({ ...noteSelection, systemName: universeSystem.name })
    .from(apSystemNote)
    .innerJoin(universeSystem, eq(apSystemNote.systemId, universeSystem.id))
    .leftJoin(apCharacter, eq(apSystemNote.createdByCharacterId, apCharacter.id))
    .leftJoin(editor, eq(apSystemNote.lastEditedByCharacterId, editor.id))
    .where(or(ilike(apSystemNote.body, q), ilike(universeSystem.name, q)))
    .orderBy(desc(apSystemNote.createdAt))
    .limit(NOTE_SEARCH_LIMIT);
  return rows.map((r) => ({ ...shape(r), systemName: r.systemName }));
}

/**
 * Shape a freshly written `ap_system_note` row into a `SystemNote` for the
 * client, resolving author and last-editor names. Used by the create/update
 * routes so the client always receives a complete row to splice into local state.
 */
export async function withAuthorName(row: ApSystemNote): Promise<SystemNote> {
  async function nameOf(characterId: bigint | null): Promise<string | null> {
    if (characterId === null) return null;
    const [charRow] = await db
      .select({ name: apCharacter.name })
      .from(apCharacter)
      .where(eq(apCharacter.id, characterId));
    return charRow?.name ?? null;
  }
  return {
    id: row.id.toString(),
    systemId: row.systemId,
    body: row.body,
    category: row.category,
    locked: row.locked,
    createdByName: await nameOf(row.createdByCharacterId),
    lastEditedByName: await nameOf(row.lastEditedByCharacterId),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
