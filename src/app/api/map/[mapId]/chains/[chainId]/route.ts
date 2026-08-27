import 'server-only';
import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { deleteChain, renameChain } from '@/lib/map/mutations/chains';
import { canManageMap } from '@/lib/auth/rights';
import { parseBigInt, requireMapMutate } from '../../../utils';
import { apertureConfig } from '../../../../../../../aperture.config';
import { withApiMetrics } from '@/lib/metrics/httpInstrumentation';

/**
 * PATCH /api/map/[mapId]/chains/[chainId]  — rename a chain. Body: { name }.
 * DELETE /api/map/[mapId]/chains/[chainId] — delete a chain (memberships go
 * with it; canonical systems are untouched).
 *
 * [chainId] is `ap_map_chain.id`.
 *
 * Access: `map_update` right, then per-kind in the mutation layer — a
 * `personal` chain only by its owner (a foreign one reads "Chain not found.",
 * never leaking existence), a `shared` chain only with map management.
 */

const renameChainBodySchema = z.object({
  name: z.string().min(1).max(apertureConfig.MAP_CHAIN_NAME_MAX_LENGTH),
});

export const runtime = 'nodejs';

export const PATCH = withApiMetrics('/api/map/:mapId/chains/:chainId', async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ mapId: string; chainId: string }> },
) {
  const session = await getSession();
  const { mapId: rawMapId, chainId: rawChainId } = await params;
  const guard = await requireMapMutate(rawMapId, session, 'map_update');
  if (!guard.ok) {
    return Response.json({ ok: false, error: guard.error }, { status: guard.status });
  }

  const chainId = parseBigInt(rawChainId);
  if (!chainId) return Response.json({ ok: false, error: 'Invalid chain id.' }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: 'Invalid JSON.' }, { status: 400 });
  }

  const parsed = renameChainBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' },
      { status: 400 },
    );
  }

  const result = await renameChain({
    mapId: guard.mapId,
    chainId,
    characterId: guard.characterId,
    name: parsed.data.name,
    canManage: await canManageMap(guard.characterId, guard.mapId),
  });

  return Response.json(result, { status: result.ok ? 200 : 400 });
});

export const DELETE = withApiMetrics('/api/map/:mapId/chains/:chainId', async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ mapId: string; chainId: string }> },
) {
  const session = await getSession();
  const { mapId: rawMapId, chainId: rawChainId } = await params;
  const guard = await requireMapMutate(rawMapId, session, 'map_update');
  if (!guard.ok) {
    return Response.json({ ok: false, error: guard.error }, { status: guard.status });
  }

  const chainId = parseBigInt(rawChainId);
  if (!chainId) return Response.json({ ok: false, error: 'Invalid chain id.' }, { status: 400 });

  const result = await deleteChain({
    mapId: guard.mapId,
    chainId,
    characterId: guard.characterId,
    canManage: await canManageMap(guard.characterId, guard.mapId),
  });

  return Response.json(result, { status: result.ok ? 200 : 400 });
});
