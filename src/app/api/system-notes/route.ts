import 'server-only';
import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { requireSystemNoteMutate } from '@/lib/system-notes/guard';
import { createSystemNote } from '@/lib/system-notes/mutations';
import { withAuthorName } from '@/lib/system-notes/read';
import { withApiMetrics } from '@/lib/metrics/httpInstrumentation';

/**
 * POST /api/system-notes — create a global system-note row.
 *
 * System notes are deployment-global (no `map_id`), so this is a plain REST
 * resource: it does NOT emit a map event and any authenticated user may write.
 * The create is recorded in `ap_system_note_event` (inside the mutation) for
 * accountability. See `src/lib/system-notes/*`.
 */

export const runtime = 'nodejs';

const createSystemNoteBodySchema = z.object({
  systemId: z.number().int().positive(),
  body: z.string().min(1).max(2000),
  category: z.enum(['intel', 'journal', 'pve', 'logistics', 'warning']).nullable().optional(),
  locked: z.boolean().optional(),
});

export const POST = withApiMetrics('/api/system-notes', async function POST(request: NextRequest) {
  const session = await getSession();
  const guard = requireSystemNoteMutate(session);
  if (!guard.ok) {
    return Response.json({ ok: false, error: guard.error }, { status: guard.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: 'Invalid JSON.' }, { status: 400 });
  }

  const parsed = createSystemNoteBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' },
      { status: 400 },
    );
  }

  try {
    const row = await createSystemNote({ ...parsed.data, characterId: guard.characterId });
    const data = await withAuthorName(row);
    return Response.json({ ok: true, data });
  } catch {
    // FK RESTRICT violation (unknown system) or other write error.
    return Response.json(
      { ok: false, error: 'Could not save note — unknown system.' },
      { status: 400 },
    );
  }
});
