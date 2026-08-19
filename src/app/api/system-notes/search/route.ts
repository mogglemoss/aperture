import 'server-only';
import { type NextRequest } from 'next/server';
import { getSession } from '@/lib/session';
import { requireSystemNoteMutate } from '@/lib/system-notes/guard';
import { searchSystemNotes } from '@/lib/system-notes/read';
import { withApiMetrics } from '@/lib/metrics/httpInstrumentation';

/**
 * GET /api/system-notes/search?q=<text> — deployment-wide note search for the
 * notes browser: substring match on note body or system name, newest first,
 * capped server-side. Read access follows write access (any signed-in
 * character); queries under 2 characters return `[]` without touching the DB.
 */

export const runtime = 'nodejs';

const SEARCH_MIN_CHARS = 2;
const SEARCH_MAX_CHARS = 100;

export const GET = withApiMetrics('/api/system-notes/search', async function GET(
  request: NextRequest,
) {
  const session = await getSession();
  const guard = requireSystemNoteMutate(session);
  if (!guard.ok) {
    return Response.json({ ok: false, error: guard.error }, { status: guard.status });
  }

  const q = (request.nextUrl.searchParams.get('q') ?? '').trim().slice(0, SEARCH_MAX_CHARS);
  if (q.length < SEARCH_MIN_CHARS) {
    return Response.json({ ok: true, data: [] });
  }

  const data = await searchSystemNotes(q);
  return Response.json({ ok: true, data });
});
