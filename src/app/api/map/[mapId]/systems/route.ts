import 'server-only';
import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { addSystemWithStargateLinks } from '@/lib/map/mutations/systems';
import { parseBigInt, requireMapMutate } from '../../utils';
import { withApiMetrics } from '@/lib/metrics/httpInstrumentation';

/**
 * POST /api/map/[mapId]/systems
 * Add a solar system to a map. Body:
 * { systemId, positionX?, positionY?, chainId?, parentMemberId? }.
 * Returns { ok, data: { payloads }, eventId: 0 } — the `system.added` event plus
 * any auto-created `stargate` connection events (gate links to systems already
 * on the map). Consumers fold `data.payloads` like a bulk paste.
 *
 * `chainId` charts the add into a chain tab (nomadic-chains): the
 * `chain.member.added` events commit in the same transaction and ride
 * `payloads` right after the `system.added`. `parentMemberId` is the member
 * charted from — the add then fans out to every chain holding that member's
 * system (universal fan-out); omit it for the chain's root, which seeds the
 * anchor's wormhole subtree. Requires `chainId`.
 *
 * Access: `map_update` right on the target map.
 */

const addSystemBodySchema = z
  .object({
    systemId: z.number().int().positive(),
    positionX: z.number().optional(),
    positionY: z.number().optional(),
    chainId: z.string().regex(/^\d+$/).optional(),
    parentMemberId: z.string().regex(/^\d+$/).optional(),
  })
  .refine((b) => b.parentMemberId === undefined || b.chainId !== undefined, {
    message: 'parentMemberId requires chainId.',
  });

export const runtime = 'nodejs';

export const POST = withApiMetrics('/api/map/:mapId/systems', async function POST(
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

  const parsed = addSystemBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' },
      { status: 400 },
    );
  }

  let chain: { chainId: bigint; parentMemberId: bigint | null } | undefined;
  if (parsed.data.chainId !== undefined) {
    const chainId = parseBigInt(parsed.data.chainId);
    const parentMemberId =
      parsed.data.parentMemberId === undefined ? null : parseBigInt(parsed.data.parentMemberId);
    if (!chainId || (parsed.data.parentMemberId !== undefined && !parentMemberId)) {
      return Response.json({ ok: false, error: 'Invalid chain context.' }, { status: 400 });
    }
    chain = { chainId, parentMemberId };
  }

  const result = await addSystemWithStargateLinks({
    mapId: guard.mapId,
    characterId: guard.characterId,
    systemId: parsed.data.systemId,
    positionX: parsed.data.positionX,
    positionY: parsed.data.positionY,
    chain,
  });

  return Response.json(result, { status: result.ok ? 200 : 400 });
});
