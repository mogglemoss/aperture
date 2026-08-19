import 'server-only';
import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { requireSystemNoteMutate } from '@/lib/system-notes/guard';
import {
  deleteSystemNote,
  SystemNoteLockedError,
  updateSystemNote,
} from '@/lib/system-notes/mutations';
import { withAuthorName } from '@/lib/system-notes/read';
import { parseBigInt } from '../../map/utils';
import { withApiMetrics } from '@/lib/metrics/httpInstrumentation';

/**
 * PATCH / DELETE /api/system-notes/[noteId] — edit or remove a global
 * system-note row. Any authenticated user may write; the mutation records an
 * `update` / `delete` row in `ap_system_note_event` for accountability. A
 * locked note rejects everything except the bare unlock patch with a 409.
 */

export const runtime = 'nodejs';

const updateSystemNoteBodySchema = z
  .object({
    body: z.string().min(1).max(2000).optional(),
    category: z.enum(['intel', 'journal', 'bounty', 'logistics', 'warning']).nullable().optional(),
    locked: z.boolean().optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, { message: 'Empty patch.' });

export const PATCH = withApiMetrics('/api/system-notes/:noteId', async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ noteId: string }> },
) {
  const session = await getSession();
  const guard = requireSystemNoteMutate(session);
  if (!guard.ok) {
    return Response.json({ ok: false, error: guard.error }, { status: guard.status });
  }

  const { noteId: rawId } = await params;
  const noteId = parseBigInt(rawId);
  if (!noteId) {
    return Response.json({ ok: false, error: 'Invalid note id.' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: 'Invalid JSON.' }, { status: 400 });
  }

  const parsed = updateSystemNoteBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' },
      { status: 400 },
    );
  }

  try {
    const row = await updateSystemNote({
      noteId,
      patch: parsed.data,
      characterId: guard.characterId,
    });
    if (!row) return Response.json({ ok: false, error: 'Note not found.' }, { status: 404 });
    const data = await withAuthorName(row);
    return Response.json({ ok: true, data });
  } catch (err) {
    if (err instanceof SystemNoteLockedError) {
      return Response.json(
        { ok: false, error: 'Note is locked — unlock it first.' },
        { status: 409 },
      );
    }
    throw err;
  }
});

export const DELETE = withApiMetrics('/api/system-notes/:noteId', async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ noteId: string }> },
) {
  const session = await getSession();
  const guard = requireSystemNoteMutate(session);
  if (!guard.ok) {
    return Response.json({ ok: false, error: guard.error }, { status: guard.status });
  }

  const { noteId: rawId } = await params;
  const noteId = parseBigInt(rawId);
  if (!noteId) {
    return Response.json({ ok: false, error: 'Invalid note id.' }, { status: 400 });
  }

  try {
    const row = await deleteSystemNote({ noteId, characterId: guard.characterId });
    if (!row) return Response.json({ ok: false, error: 'Note not found.' }, { status: 404 });
    return Response.json({ ok: true, data: { id: row.id.toString() } });
  } catch (err) {
    if (err instanceof SystemNoteLockedError) {
      return Response.json(
        { ok: false, error: 'Note is locked — unlock it first.' },
        { status: 409 },
      );
    }
    throw err;
  }
});
