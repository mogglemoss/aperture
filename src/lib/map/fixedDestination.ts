import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { apMapSignature, apMapSystem, universeWormhole } from '@/db/schema';
import { AUTO_SLOT, findOpenPosition } from './placement';
import { ensureSystemVisible, ensureWhConnection, tagOnConnect } from './ensureTopology';
import type { ActionResult } from './mutations/core';
import type { MapEventPayload } from '@/lib/realtime/protocol';

/**
 * Fixed-destination resolution: some wormhole types always exit to a specific
 * system (a J377 always leads to Turnur). This folds that known destination onto
 * the map from the signature side — placing the destination node + a `wh`
 * connection — so a user can resolve their own scanned hole without visiting the
 * far end. The destination is read from `universe_wormhole.target_system_id`
 * (never from the client), which keeps the guarantee one-directional: only the
 * pinned type resolves; the far-side K162 (null target) never does.
 */

export type ResolveDestinationResult = {
  payloads: MapEventPayload[];
  /** `ap_map_connection.id` (stringified) of the ensured/existing connection, for the client to link the sig to. */
  connectionId: string;
};

/**
 * Resolve the fixed destination of the wormhole signature `sigId` onto `mapId`.
 * Ensures the destination system is visible near the sig's own system and a `wh`
 * connection links them, idempotently (a repeat is a no-op; an existing node /
 * either-direction edge is reused). Returns the committed event payloads for the
 * client to fold + dedupe, plus the connection id so it can link the signature.
 *
 * Fails when the sig doesn't belong to `mapId`, isn't typed, or its type has no
 * `target_system_id` (the one-directional guard — a K162 never resolves).
 */
export async function resolveSignatureDestination(args: {
  mapId: bigint;
  sigId: bigint;
  characterId: bigint | null;
}): Promise<ActionResult<ResolveDestinationResult>> {
  const { mapId, sigId, characterId } = args;
  try {
    // Load the sig joined through its system so a forged id on another map 404s
    // (mirrors updateSignature's ownership check), and read the source system's
    // EVE id + position for placement.
    const [src] = await db
      .select({
        mapSystemId: apMapSystem.id,
        systemId: apMapSystem.systemId,
        positionX: apMapSystem.positionX,
        positionY: apMapSystem.positionY,
        typeId: apMapSignature.typeId,
      })
      .from(apMapSignature)
      .innerJoin(apMapSystem, eq(apMapSignature.mapSystemId, apMapSystem.id))
      .where(and(eq(apMapSignature.id, sigId), eq(apMapSystem.mapId, mapId)));
    if (!src) return { ok: false, error: 'Signature not found on this map.' };
    if (src.typeId === null) return { ok: false, error: 'This signature has no wormhole type.' };

    const [wh] = await db
      .select({ targetSystemId: universeWormhole.targetSystemId })
      .from(universeWormhole)
      .where(eq(universeWormhole.typeId, src.typeId));
    const destSystemId = wh?.targetSystemId ?? null;
    if (destSystemId === null) {
      return { ok: false, error: 'This wormhole type has no fixed destination.' };
    }
    if (destSystemId === src.systemId) {
      return { ok: false, error: 'The fixed destination is the signature’s own system.' };
    }

    // Place the destination just off the source, nudged clear of existing nodes.
    const occupied = await db
      .select({ x: apMapSystem.positionX, y: apMapSystem.positionY })
      .from(apMapSystem)
      .where(and(eq(apMapSystem.mapId, mapId), eq(apMapSystem.visible, true)));
    const pos = findOpenPosition(
      { x: src.positionX + AUTO_SLOT.x, y: src.positionY },
      occupied,
    );

    const result = await db.transaction(async (tx) => {
      const payloads: MapEventPayload[] = [];
      const dest = await ensureSystemVisible(tx, mapId, destSystemId, characterId, pos);
      if (dest.payload) payloads.push(dest.payload);
      const conn = await ensureWhConnection(
        tx,
        mapId,
        src.mapSystemId,
        dest.mapSystemId,
        characterId,
      );
      if (conn.payload) payloads.push(conn.payload);
      payloads.push(...conn.memberPayloads);
      return { payloads, destMapSystemId: dest.mapSystemId, connectionId: conn.mapConnectionId };
    });

    await tagOnConnect(mapId, src.mapSystemId, result.destMapSystemId, characterId, result.payloads);

    return {
      ok: true,
      data: { payloads: result.payloads, connectionId: result.connectionId.toString() },
      eventId: 0,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to resolve the destination.',
    };
  }
}
