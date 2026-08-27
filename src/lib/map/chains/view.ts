/**
 * Pure derivation of one chain tab's canvas content (nomadic-chains chain
 * mode): viewData slices in, positioned occurrence / pointer-leaf view-models
 * + edges out. No `server-only`, no DB, no React — `MapCanvas` maps the result
 * onto xyflow nodes/edges, and unit tests exercise it directly.
 */

import type { MapChain, MapChainMember, MapSystemNode } from '@/types';
import {
  layoutChainTree,
  type ChainLayoutOrientation,
  type ChainLayoutParams,
} from './layout';

/** xyflow id of a real occurrence: one node per membership, keyed `chainId:mapSystemId`. */
export function chainOccurrenceNodeId(chainId: string, mapSystemId: string): string {
  return `${chainId}:${mapSystemId}`;
}

/**
 * xyflow id of a pointer-leaf pill. Keyed on the member id: a *loop* pointer
 * names a system that already really occurs in the same chain, so the
 * occurrence id scheme would collide.
 */
export function chainPointerNodeId(memberId: string): string {
  return `chainptr:${memberId}`;
}

const chainFallbackEdgeId = (childMemberId: string) => `chainedge:${childMemberId}`;

/** One real occurrence tile, positioned by the tree layout. */
export type ChainOccurrenceNode = {
  /** xyflow node id (`chainId:mapSystemId`). */
  id: string;
  memberId: string;
  mapSystemId: string;
  /** 0 = the chain's root. */
  depth: number;
  x: number;
  y: number;
  /** Canonical system row the occurrence presents (status/sigs/alias live there). */
  system: MapSystemNode;
};

/** One terminal pointer-leaf pill ("continues in …" / "loops to …"). */
export type ChainPointerLeaf = {
  /** xyflow node id (`chainptr:<memberId>`). */
  id: string;
  memberId: string;
  targetChainId: string;
  /** Resolved against the visible chains; null when the chain isn't visible to the viewer. */
  targetChainName: string | null;
  /** True ⇔ the pointer loops back into its own chain. */
  isLoop: boolean;
  targetMapSystemId: string;
  /** Alias-or-name of the target system; falls back to the raw id when the system is hidden. */
  targetSystemName: string;
  x: number;
  y: number;
};

/** One parent→child tree edge between chain-canvas nodes. */
export type ChainCanvasEdge = {
  /**
   * The backing connection id when one is live in the view — so edge selection
   * maps straight onto the canonical inspector selection — else
   * `chainedge:<childMemberId>` (via collapsed / unknown).
   */
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  /** Backing `ap_map_connection.id`, non-null only while the connection is live in the view. */
  connectionId: string | null;
};

/** One chain tab's derived canvas: positioned nodes + edges + bounding extent. */
export type ChainCanvasModel = {
  chainId: string;
  occurrences: ChainOccurrenceNode[];
  pointers: ChainPointerLeaf[];
  edges: ChainCanvasEdge[];
  width: number;
  height: number;
};

/** Numeric-string id order (bigserial ids: shorter is smaller, then lexicographic). */
function compareIdAsc(a: string, b: string): number {
  if (a.length !== b.length) return a.length - b.length;
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Tab order for the strip: shared chains first, then personal, each by
 * creation (id) order — mirroring the forest block order so the tabs and the
 * All view never disagree. Order never keys on size or name.
 */
export function sortChainsForTabs(chains: readonly MapChain[]): MapChain[] {
  return [...chains].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'shared' ? -1 : 1;
    return compareIdAsc(a.id, b.id);
  });
}

/**
 * Derive one chain's canvas model from view data. Runs `layoutChainTree` and
 * resolves each member against the canonical rows:
 *
 * - A real occurrence whose system is missing from `systems` is skipped (and
 *   its incident edges dropped) — members always reference visible systems, so
 *   this is defensive only.
 * - A pointer-leaf keeps its pill even when the target system or chain is
 *   unresolvable (falling back to the raw id / a null chain name — the
 *   renderer says "another chain" for a foreign personal chain).
 * - An edge keys on its live backing connection id when `viaConnectionId` is in
 *   `liveConnectionIds` (a connection backs at most one link per chain), else
 *   on the child member.
 */
export function buildChainCanvas(args: {
  chainId: string;
  /** Chains visible to the viewer — pointer-name resolution only. */
  chains: readonly MapChain[];
  members: readonly MapChainMember[];
  systems: readonly MapSystemNode[];
  /** Ids of connections currently live in the view. */
  liveConnectionIds: ReadonlySet<string>;
  params: ChainLayoutParams;
  orientation: ChainLayoutOrientation;
}): ChainCanvasModel {
  const { chainId, chains, members, systems, liveConnectionIds, params, orientation } = args;
  const layout = layoutChainTree(chainId, members, params, orientation);

  const systemsById = new Map(systems.map((s) => [s.id, s]));
  const chainsById = new Map(chains.map((c) => [c.id, c]));
  const nodeIdByMemberId = new Map<string, string>();

  const occurrences: ChainOccurrenceNode[] = [];
  const pointers: ChainPointerLeaf[] = [];
  for (const n of layout.nodes) {
    if (n.pointerChainId != null) {
      const target = systemsById.get(n.mapSystemId);
      const id = chainPointerNodeId(n.memberId);
      nodeIdByMemberId.set(n.memberId, id);
      pointers.push({
        id,
        memberId: n.memberId,
        targetChainId: n.pointerChainId,
        targetChainName: chainsById.get(n.pointerChainId)?.name ?? null,
        isLoop: n.pointerChainId === chainId,
        targetMapSystemId: n.mapSystemId,
        targetSystemName: target ? target.alias?.trim() || target.name : n.mapSystemId,
        x: n.x,
        y: n.y,
      });
      continue;
    }
    const system = systemsById.get(n.mapSystemId);
    if (!system) continue;
    const id = chainOccurrenceNodeId(chainId, n.mapSystemId);
    nodeIdByMemberId.set(n.memberId, id);
    occurrences.push({
      id,
      memberId: n.memberId,
      mapSystemId: n.mapSystemId,
      depth: n.depth,
      x: n.x,
      y: n.y,
      system,
    });
  }

  const edges: ChainCanvasEdge[] = [];
  for (const e of layout.edges) {
    const sourceNodeId = nodeIdByMemberId.get(e.sourceMemberId);
    const targetNodeId = nodeIdByMemberId.get(e.targetMemberId);
    if (!sourceNodeId || !targetNodeId) continue;
    const live = e.viaConnectionId != null && liveConnectionIds.has(e.viaConnectionId);
    edges.push({
      id: live ? e.viaConnectionId! : chainFallbackEdgeId(e.targetMemberId),
      sourceNodeId,
      targetNodeId,
      connectionId: live ? e.viaConnectionId : null,
    });
  }

  return {
    chainId,
    occurrences,
    pointers,
    edges,
    width: layout.width,
    height: layout.height,
  };
}
