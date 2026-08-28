import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { apMapSystem, universeSystem } from '@/db/schema';
import { fetchEveScoutConnections } from '@/lib/integrations/evescout';
import { type ActionResult, type Tx } from './mutations/core';
import { ensureSystemVisible, ensureWhConnection, tagOnConnect } from './ensureTopology';
import type { MapEventPayload } from '@/lib/realtime/protocol';

/**
 * Thera module backend.
 *
 * `loadTheraConnections` reads EVE-Scout's public Thera/Turnur signature feed
 * (via the EVE-Scout client), orients each row so the shattered hub is the
 * "source" and the connected system is the "target", and enriches the target
 * with its `universe_system.security` class label. A short module-level TTL
 * cache fronts the EVE-Scout fetch so many open maps/tabs don't hammer the
 * public API (no Redis — in-process per CLAUDE.md).
 *
 * `syncTheraConnections` folds chosen connections onto a map. It reuses the
 * `importMapData` shape (one `db.transaction`, N `commitMapEvent` calls sharing
 * the `tx`, returning `MapEventPayload[]` for the initiating client to fold +
 * dedupe) and the `locationCommit` idempotency rules (ensure-visible system,
 * skip the edge if one already links the pair in either direction). Auto-tagging
 * is wired in the same way as the other add/connect pathways: ABC
 * tags ride in `system.added` (via `assignTagOnAdd`), and the 0121 child tag is
 * emitted as a follow-up `system.updated` after the transaction commits (so
 * `assignTagOnConnect` reads the committed topology).
 */

export type TheraHub = 'Thera' | 'Turnur';

export type TheraConnection = {
  hub: TheraHub;
  /** EVE solar-system id of the shattered hub (Thera or Turnur). */
  hubSystemId: number;
  hubName: string;
  /** EVE solar-system id of the connected system. */
  targetSystemId: number;
  targetName: string;
  /** `universe_system.security` label for the target (H/L/0.0/C1–C6/P/A), or null if unseeded. */
  securityClass: string | null;
  signatureId: string | null;
  expiresAt: string | null;
};

const SCOUT_CACHE_TTL_MS = 60_000;
const HUB_GROUP_SPACING = 600;
const TARGET_FAN_RADIUS = 220;

let scoutCache: { at: number; rows: Awaited<ReturnType<typeof fetchEveScoutConnections>> } | null =
  null;

async function cachedScoutRows(): Promise<Awaited<ReturnType<typeof fetchEveScoutConnections>>> {
  if (scoutCache && Date.now() - scoutCache.at < SCOUT_CACHE_TTL_MS) return scoutCache.rows;
  const rows = await fetchEveScoutConnections();
  scoutCache = { at: Date.now(), rows };
  return rows;
}

const HUB_NAME = /thera|turnur/i;

/**
 * Fetch the current EVE-Scout Thera + Turnur connections, oriented + enriched.
 * Throws `EveScoutError` on an EVE-Scout failure (the route maps it to a 502).
 * Rows missing either system id (rare; EVE-Scout occasionally omits an id for an
 * unresolved system) are dropped — they can't be synced to a real `universe_system`.
 */
export async function loadTheraConnections(): Promise<TheraConnection[]> {
  const rows = await cachedScoutRows();

  const oriented = rows
    .filter((r) => r.hub === 'Thera' || r.hub === 'Turnur')
    .map((r) => {
      const sourceIsHub = HUB_NAME.test(r.sourceName);
      const hubSystemId = sourceIsHub ? r.sourceSystemId : r.targetSystemId;
      const targetSystemId = sourceIsHub ? r.targetSystemId : r.sourceSystemId;
      if (hubSystemId == null || targetSystemId == null) return null;
      return {
        hub: r.hub as TheraHub,
        hubSystemId,
        hubName: sourceIsHub ? r.sourceName : r.targetName,
        targetSystemId,
        targetName: sourceIsHub ? r.targetName : r.sourceName,
        signatureId: r.signatureId,
        expiresAt: r.expiresAt,
      };
    })
    .filter((r): r is Omit<TheraConnection, 'securityClass'> => r !== null);

  const targetIds = [...new Set(oriented.map((o) => o.targetSystemId))];
  const securityById = new Map<number, string | null>();
  if (targetIds.length > 0) {
    const secRows = await db
      .select({ id: universeSystem.id, security: universeSystem.security })
      .from(universeSystem)
      .where(inArray(universeSystem.id, targetIds));
    for (const s of secRows) securityById.set(s.id, s.security);
  }

  return oriented.map((o) => ({ ...o, securityClass: securityById.get(o.targetSystemId) ?? null }));
}

export type TheraSyncInput = {
  hubSystemId: number;
  hubName: string;
  targetSystemId: number;
  signatureId?: string | null;
};

export type TheraSyncResult = {
  summary: { systems: number; connections: number };
  payloads: MapEventPayload[];
};

/**
 * Fold the chosen Thera/Turnur connections onto `mapId`. Adds the hub + each
 * target system (if not already visible) and a `wh`/`fresh` connection per pair
 * (if not already present in either direction). Returns the committed event
 * payloads so the initiating client folds them and dedupes its own realtime echo.
 */
export async function syncTheraConnections(args: {
  mapId: bigint;
  characterId: bigint | null;
  connections: TheraSyncInput[];
}): Promise<ActionResult<TheraSyncResult>> {
  const { mapId, characterId } = args;
  try {
    // Group targets by hub so each hub system is ensured once and its targets
    // fan around it.
    const byHub = new Map<number, TheraSyncInput[]>();
    for (const c of args.connections) {
      if (c.hubSystemId === c.targetSystemId) continue;
      const targets = byHub.get(c.hubSystemId) ?? [];
      targets.push(c);
      byHub.set(c.hubSystemId, targets);
    }

    const result = await db.transaction(async (tx) => {
      const payloads: MapEventPayload[] = [];
      const edges: Array<{ source: bigint; target: bigint }> = [];
      let systems = 0;
      let connections = 0;

      let hubIndex = 0;
      for (const [hubSystemId, targets] of byHub) {
        const hubBase = await hubBasePosition(tx, mapId, hubSystemId, hubIndex);
        hubIndex += 1;

        const hub = await ensureSystemVisible(tx, mapId, hubSystemId, characterId, hubBase);
        if (hub.payload) {
          payloads.push(hub.payload);
          systems += 1;
        }

        for (let i = 0; i < targets.length; i += 1) {
          const angle = (2 * Math.PI * i) / targets.length;
          const pos = {
            x: Math.round(hubBase.x + TARGET_FAN_RADIUS * Math.cos(angle)),
            y: Math.round(hubBase.y + TARGET_FAN_RADIUS * Math.sin(angle)),
          };
          const target = await ensureSystemVisible(
            tx,
            mapId,
            targets[i]!.targetSystemId,
            characterId,
            pos,
          );
          if (target.payload) {
            payloads.push(target.payload);
            systems += 1;
          }

          const conn = await ensureWhConnection(
            tx,
            mapId,
            hub.mapSystemId,
            target.mapSystemId,
            characterId,
          );
          if (conn.payload) {
            payloads.push(conn.payload);
            connections += 1;
          }
          payloads.push(...conn.memberPayloads);
          edges.push({ source: hub.mapSystemId, target: target.mapSystemId });
        }
      }

      return { payloads, edges, systems, connections };
    });

    // 0121 follow-up: now that endpoints + edges are committed, root each target
    // as a child of its hub and emit the tag as its own `system.updated`. No-op
    // for ABC / unscheme'd maps. Best-effort — never fail the sync.
    for (const edge of result.edges) {
      await tagOnConnect(mapId, edge.source, edge.target, characterId, result.payloads);
    }

    return {
      ok: true,
      data: {
        summary: { systems: result.systems, connections: result.connections },
        payloads: result.payloads,
      },
      eventId: 0,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Thera sync failed.' };
  }
}

/** Anchor the target fan on the hub's real position if it's already placed, else stagger hub groups. */
async function hubBasePosition(
  tx: Tx,
  mapId: bigint,
  hubSystemId: number,
  hubIndex: number,
): Promise<{ x: number; y: number }> {
  const [row] = await tx
    .select({ x: apMapSystem.positionX, y: apMapSystem.positionY, visible: apMapSystem.visible })
    .from(apMapSystem)
    .where(and(eq(apMapSystem.mapId, mapId), eq(apMapSystem.systemId, hubSystemId)));
  if (row?.visible) return { x: row.x, y: row.y };
  return { x: hubIndex * HUB_GROUP_SPACING, y: 0 };
}
