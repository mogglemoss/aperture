import 'server-only';
import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { createChain } from '@/lib/map/mutations/chains';
import { canManageMap } from '@/lib/auth/rights';
import { chainKind } from '@/db/schema/ap/enums';
import { requireMapMutate } from '../../utils';
import { apertureConfig } from '../../../../../../aperture.config';
import { withApiMetrics } from '@/lib/metrics/httpInstrumentation';

/**
 * POST /api/map/[mapId]/chains
 * Create a chain tab (nomadic-chains). Body: { name, kind }.
 * Returns { ok, data: chain.created payload, eventId }.
 *
 * Access: `map_update` right (any viewer) for a `personal` chain;
 * a `shared` chain additionally requires map management (`canManageMap`).
 */

const createChainBodySchema = z.object({
  name: z.string().min(1).max(apertureConfig.MAP_CHAIN_NAME_MAX_LENGTH),
  kind: z.enum(chainKind.enumValues),
});

export const runtime = 'nodejs';

export const POST = withApiMetrics('/api/map/:mapId/chains', async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ mapId: string }> },
) {
  const session = await getSession();
  const { mapId: rawMapId } = await params;
  const guard = await requireMapMutate(rawMapId, session, 'map_update');
  if (!guard.ok) {
    return Response.json({ ok: false, error: guard.error }, { status: guard.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: 'Invalid JSON.' }, { status: 400 });
  }

  const parsed = createChainBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' },
      { status: 400 },
    );
  }

  const canManage = await canManageMap(guard.characterId, guard.mapId);
  if (parsed.data.kind === 'shared' && !canManage) {
    return Response.json(
      { ok: false, error: 'Creating a shared chain requires map management rights.' },
      { status: 403 },
    );
  }

  const result = await createChain({
    mapId: guard.mapId,
    characterId: guard.characterId,
    name: parsed.data.name,
    kind: parsed.data.kind,
    canManage,
  });

  return Response.json(result, { status: result.ok ? 200 : 400 });
});
