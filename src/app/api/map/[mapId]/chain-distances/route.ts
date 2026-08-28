import 'server-only';
import { type NextRequest } from 'next/server';
import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  apCharacter,
  apMapChain,
  apMapChainMember,
  apMapSystem,
  universeSystem,
} from '@/db/schema';
import { getSession } from '@/lib/session';
import { getGateGraph } from '@/lib/map/routePlanner';
import {
  computeChainDistances,
  isKspaceSecurity,
  resolveOriginSystemIds,
  type ChainDistances,
  type ChainExitSet,
} from '@/lib/map/chains/distance';
import { requireMapView } from '../../utils';
import { withApiMetrics } from '@/lib/metrics/httpInstrumentation';

/**
 * GET /api/map/[mapId]/chain-distances?characterId=N
 * Chains-near-me (nomadic-chains): unweighted gate jumps from the viewer's
 * pilot to each visible chain's nearest k-space exit, for the tab / blob /
 * inspector badges. Orientation only — the route-plan endpoint owns real
 * routing.
 *
 * Read-only: one multi-source BFS over the memoized gate adjacency per
 * request; no DB writes, no `ap_map_event`, no cache beyond the gate graph.
 * Access: view-only on the map. `characterId` must be one of the viewer's own
 * account characters (the client passes its active-character pick — the same
 * source the route planner uses); a foreign character 404s so the endpoint
 * can't be used to probe other pilots' locations.
 *
 * Origin set: a k-space pilot is their own system; a J-space pilot is the
 * k-space exits of whichever visible chains hold their current system as a
 * real occurrence. An unlocated pilot — or a J-space pilot outside every
 * visible chain — returns `originSystemId: null` with all-null distances
 * (client hides the badges). Chains follow `loadMapForView`'s visibility:
 * every shared chain plus the session character's own personal chains.
 */

export const runtime = 'nodejs';

export const GET = withApiMetrics('/api/map/:mapId/chain-distances', async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ mapId: string }> },
) {
  const session = await getSession();
  const { mapId: rawMapId } = await params;
  const guard = await requireMapView(rawMapId, session);
  if (!guard.ok) {
    return Response.json({ ok: false, error: guard.error }, { status: guard.status });
  }

  const rawCharacterId = request.nextUrl.searchParams.get('characterId');
  if (!rawCharacterId || !/^\d+$/.test(rawCharacterId)) {
    return Response.json({ ok: false, error: 'Invalid character id.' }, { status: 400 });
  }
  const pilotCharacterId = BigInt(rawCharacterId);

  const [pilot] = await db
    .select({
      userId: apCharacter.userId,
      status: apCharacter.status,
      lastSystemId: apCharacter.lastSystemId,
      lastOnline: apCharacter.lastOnline,
    })
    .from(apCharacter)
    .where(eq(apCharacter.id, pilotCharacterId));
  if (!pilot || !session || pilot.userId !== session.userId) {
    return Response.json({ ok: false, error: 'Character not found.' }, { status: 404 });
  }

  const chainRows = await db
    .select({ id: apMapChain.id })
    .from(apMapChain)
    .where(
      and(
        eq(apMapChain.mapId, guard.mapId),
        or(eq(apMapChain.kind, 'shared'), eq(apMapChain.ownerCharacterId, guard.characterId)),
      ),
    )
    .orderBy(apMapChain.id);
  const chainIds = chainRows.map((c) => c.id);

  // Real k-space occurrences per chain: member → visible canonical system →
  // universe security label. Member-id order keeps the nearest-exit tie-break
  // deterministic (creation order).
  const memberRows = chainIds.length
    ? await db
        .select({
          chainId: apMapChainMember.chainId,
          solarSystemId: apMapSystem.systemId,
          security: universeSystem.security,
        })
        .from(apMapChainMember)
        .innerJoin(apMapSystem, eq(apMapSystem.id, apMapChainMember.mapSystemId))
        .innerJoin(universeSystem, eq(universeSystem.id, apMapSystem.systemId))
        .where(
          and(
            inArray(apMapChainMember.chainId, chainIds),
            isNull(apMapChainMember.pointerChainId),
            eq(apMapSystem.visible, true),
          ),
        )
        .orderBy(apMapChainMember.id)
    : [];

  const exitsByChain = new Map<string, number[]>(chainIds.map((id) => [id.toString(), []]));
  const containingChainIds = new Set<string>();
  const located =
    pilot.status === 'active' && pilot.lastOnline === true && pilot.lastSystemId != null;
  for (const row of memberRows) {
    const chainId = row.chainId.toString();
    if (located && row.solarSystemId === pilot.lastSystemId) containingChainIds.add(chainId);
    if (!isKspaceSecurity(row.security)) continue;
    const exits = exitsByChain.get(chainId);
    if (exits && !exits.includes(row.solarSystemId)) exits.push(row.solarSystemId);
  }
  const chains: ChainExitSet[] = [...exitsByChain.entries()].map(([chainId, exitSystemIds]) => ({
    chainId,
    exitSystemIds,
  }));

  const characterId = Number(pilotCharacterId);
  const allNull = (): ChainDistances => ({
    characterId,
    originSystemId: null,
    distances: Object.fromEntries(chains.map((c) => [c.chainId, null])),
    nearestExits: Object.fromEntries(chains.map((c) => [c.chainId, null])),
  });
  if (!located) return Response.json({ ok: true, data: allNull() });

  const [pilotSystem] = await db
    .select({ security: universeSystem.security })
    .from(universeSystem)
    .where(eq(universeSystem.id, pilot.lastSystemId!));
  const originSystemIds = resolveOriginSystemIds({
    pilotSystemId: pilot.lastSystemId!,
    pilotIsKspace: isKspaceSecurity(pilotSystem?.security ?? null),
    containingChainIds,
    chains,
  });
  if (originSystemIds.length === 0) return Response.json({ ok: true, data: allNull() });

  const { adjacency } = await getGateGraph();
  const { distances, nearestExits } = computeChainDistances({
    adjacency,
    originSystemIds,
    chains,
  });
  const data: ChainDistances = {
    characterId,
    originSystemId: pilot.lastSystemId!,
    distances,
    nearestExits,
  };
  return Response.json({ ok: true, data });
});
