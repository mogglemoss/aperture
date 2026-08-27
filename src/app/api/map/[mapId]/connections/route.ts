import 'server-only';
import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { createConnection } from '@/lib/map/mutations/connections';
import { createConnectionWithChainMembership } from '@/lib/map/mutations/chains';
import { updateSystem } from '@/lib/map/mutations/systems';
import { assignTagOnConnect } from '@/lib/tagging/service';
import { logger } from '@/lib/log/logger';
import { connectionScope, eolStage, whJumpMass, whMass } from '@/db/schema/ap/enums';
import { parseBigInt, requireMapMutate } from '../../utils';
import { withApiMetrics } from '@/lib/metrics/httpInstrumentation';

/**
 * POST /api/map/[mapId]/connections
 * Create a connection between two map systems.
 * Returns { ok, data, eventId } — always the `connection.create` payload.
 *
 * `chainId` + `sourceMemberId` chart the draw from a chain member
 * (nomadic-chains): the membership write-through (a real occurrence, or a
 * pointer-leaf when the far side is already chained) commits in the same
 * transaction; its `chain.member.added` reaches every client — the initiator
 * included — over realtime rather than riding this response.
 *
 * Access: `map_update` right on the target map.
 */

const createConnectionBodySchema = z
  .object({
    sourceMapSystemId: z.string().regex(/^\d+$/),
    targetMapSystemId: z.string().regex(/^\d+$/),
    scope: z.enum(connectionScope.enumValues),
    massStatus: z.enum(whMass.enumValues).optional(),
    jumpMassClass: z.enum(whJumpMass.enumValues).nullable().optional(),
    eolStage: z.enum(eolStage.enumValues).optional(),
    preserveMass: z.boolean().optional(),
    isRolling: z.boolean().optional(),
    isStatic: z.boolean().optional(),
    chainId: z.string().regex(/^\d+$/).optional(),
    sourceMemberId: z.string().regex(/^\d+$/).optional(),
  })
  .refine((b) => (b.chainId === undefined) === (b.sourceMemberId === undefined), {
    message: 'chainId and sourceMemberId must be passed together.',
  });

export const runtime = 'nodejs';

export const POST = withApiMetrics('/api/map/:mapId/connections', async function POST(
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

  const parsed = createConnectionBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' },
      { status: 400 },
    );
  }

  const sourceId = parseBigInt(parsed.data.sourceMapSystemId);
  const targetId = parseBigInt(parsed.data.targetMapSystemId);
  if (!sourceId || !targetId) {
    return Response.json({ ok: false, error: 'Invalid system id.' }, { status: 400 });
  }

  let chain: { chainId: bigint; sourceMemberId: bigint } | undefined;
  if (parsed.data.chainId !== undefined && parsed.data.sourceMemberId !== undefined) {
    const chainId = parseBigInt(parsed.data.chainId);
    const sourceMemberId = parseBigInt(parsed.data.sourceMemberId);
    if (!chainId || !sourceMemberId) {
      return Response.json({ ok: false, error: 'Invalid chain context.' }, { status: 400 });
    }
    chain = { chainId, sourceMemberId };
  }

  const input = {
    mapId: guard.mapId,
    characterId: guard.characterId,
    sourceMapSystemId: sourceId,
    targetMapSystemId: targetId,
    scope: parsed.data.scope,
    massStatus: parsed.data.massStatus,
    jumpMassClass: parsed.data.jumpMassClass,
    eolStage: parsed.data.eolStage,
    preserveMass: parsed.data.preserveMass,
    isRolling: parsed.data.isRolling,
    isStatic: parsed.data.isStatic,
  };
  const result = chain
    ? await createConnectionWithChainMembership(input, chain)
    : await createConnection(input);

  // Auto-tagging: on a 0121 map a new edge may root an untagged
  // child to its now-known parent. Emit the tag as a separate `system.updated`
  // event (the WS echo folds it onto every client). No-op for ABC / unscheme'd
  // maps. Tagging failures never fail the connection itself.
  if (result.ok) {
    try {
      const tagged = await assignTagOnConnect(guard.mapId, sourceId, targetId);
      if (tagged) {
        await updateSystem({
          mapId: guard.mapId,
          mapSystemId: tagged.mapSystemId,
          characterId: guard.characterId,
          patch: { tag: tagged.tag },
        });
      }
    } catch (err) {
      logger.warn('auto-tag on connect failed', { mapId: guard.mapId.toString(), err });
    }
  }

  return Response.json(result, { status: result.ok ? 200 : 400 });
});
