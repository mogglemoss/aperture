import 'server-only';
import { asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { apCharacter, apSystemNote } from '@/db/schema';
import type { ApSystemNote } from '@/types';

/** A global system-note row shaped for the sidebar (ids as strings, author resolved). */
export type SystemNote = {
  id: string;
  systemId: number;
  body: string;
  /** `ap_character.name` of the author — light at-a-glance accountability. Null if erased. */
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * Global system notes for the given universe systems, keyed by `system_id`,
 * newest first within each system. One batched query joins `ap_character` for
 * the author name. Systems with no notes are absent from the record.
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
    .select({
      id: apSystemNote.id,
      systemId: apSystemNote.systemId,
      body: apSystemNote.body,
      createdByName: apCharacter.name,
      createdAt: apSystemNote.createdAt,
      updatedAt: apSystemNote.updatedAt,
    })
    .from(apSystemNote)
    .leftJoin(apCharacter, eq(apSystemNote.createdByCharacterId, apCharacter.id))
    .where(inArray(apSystemNote.systemId, systemIds))
    .orderBy(asc(apSystemNote.systemId), desc(apSystemNote.createdAt));

  const out: Record<number, SystemNote[]> = {};
  for (const r of rows) {
    (out[r.systemId] ??= []).push({
      id: r.id.toString(),
      systemId: r.systemId,
      body: r.body,
      createdByName: r.createdByName,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    });
  }
  return out;
}

/**
 * Shape a freshly written `ap_system_note` row into a `SystemNote` for the
 * client, resolving `createdByName`. Used by the create/update routes so the
 * client always receives a complete row to splice into local state.
 */
export async function withAuthorName(row: ApSystemNote): Promise<SystemNote> {
  let createdByName: string | null = null;
  if (row.createdByCharacterId !== null) {
    const [charRow] = await db
      .select({ name: apCharacter.name })
      .from(apCharacter)
      .where(eq(apCharacter.id, row.createdByCharacterId));
    createdByName = charRow?.name ?? null;
  }
  return {
    id: row.id.toString(),
    systemId: row.systemId,
    body: row.body,
    createdByName,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
