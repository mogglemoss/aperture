/**
 * Pure derivation of one chain tab's canvas content (nomadic-chains chain
 * mode): viewData slices in, positioned occurrence / pointer-leaf view-models
 * + edges out. No `server-only`, no DB, no React — `MapCanvas` maps the result
 * onto xyflow nodes/edges, and unit tests exercise it directly.
 */

import type { ChainKind, MapChain, MapChainMember, MapSystemNode } from '@/types';
import {
  layoutChainTree,
  layoutForest,
  type ChainLayoutNode,
  type ChainLayoutOrientation,
  type ChainLayoutParams,
} from './layout';
import {
  CHAIN_BLOB_ZOOM_CUTOFF,
  shouldCollapseChain,
  type ChainBlobContent,
  type ChainBlobExit,
} from './collapse';

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
 * Resolve one chain's positioned layout nodes against the canonical rows,
 * shifted by the block offset: real occurrences carry their `MapSystemNode`,
 * pointer-leaves resolve target names with fallbacks. Shared by the single-tab
 * and forest derivations.
 */
function resolveLayoutNodes(args: {
  chainId: string;
  layoutNodes: readonly ChainLayoutNode[];
  systemsById: ReadonlyMap<string, MapSystemNode>;
  chainsById: ReadonlyMap<string, MapChain>;
  offsetX: number;
  offsetY: number;
}): {
  occurrences: ChainOccurrenceNode[];
  pointers: ChainPointerLeaf[];
  nodeIdByMemberId: Map<string, string>;
} {
  const { chainId, layoutNodes, systemsById, chainsById, offsetX, offsetY } = args;
  const nodeIdByMemberId = new Map<string, string>();
  const occurrences: ChainOccurrenceNode[] = [];
  const pointers: ChainPointerLeaf[] = [];
  for (const n of layoutNodes) {
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
        x: n.x + offsetX,
        y: n.y + offsetY,
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
      x: n.x + offsetX,
      y: n.y + offsetY,
      system,
    });
  }
  return { occurrences, pointers, nodeIdByMemberId };
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
  const { occurrences, pointers, nodeIdByMemberId } = resolveLayoutNodes({
    chainId,
    layoutNodes: layout.nodes,
    systemsById,
    chainsById,
    offsetX: 0,
    offsetY: 0,
  });

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

// ---------------------------------------------------------------------------
// All-view forest (blob LOD)
// ---------------------------------------------------------------------------

/** Display class per k-space security label; labels outside the map pass through raw (`P`, `A`). */
const KSPACE_EXIT_DISPLAY: Record<string, string> = { H: 'HS', L: 'LS', '0.0': 'NS' };
const KSPACE_EXIT_ORDER = ['HS', 'LS', 'NS'];

/** K-space = the non-`C*` security labels; returns the display class, or null for J-space/unknown. */
function kspaceExitClass(security: string | null): string | null {
  if (!security || security.startsWith('C')) return null;
  return KSPACE_EXIT_DISPLAY[security] ?? security;
}

/**
 * Build one chain's blob content from view data: real-occurrence count,
 * k-space exits grouped by security class (`HS`/`LS`/`NS`, then any other
 * non-`C*` label), rally presence over member systems, and EOL-critical
 * presence over the tree's inbound via connections (pointer-leaf inbound vias
 * included — they are wormholes charted in this chain).
 */
export function buildChainBlobContent(args: {
  chain: MapChain;
  members: readonly MapChainMember[];
  systems: readonly MapSystemNode[];
  /** Ids of connections currently EOL-critical in the view. */
  criticalConnectionIds: ReadonlySet<string>;
}): ChainBlobContent {
  const { chain, members, systems, criticalConnectionIds } = args;
  const systemsById = new Map(systems.map((s) => [s.id, s]));

  let systemCount = 0;
  let hasRally = false;
  let hasEolCritical = false;
  const exitCounts = new Map<string, number>();
  for (const m of members) {
    if (m.chainId !== chain.id) continue;
    if (m.viaConnectionId != null && criticalConnectionIds.has(m.viaConnectionId)) {
      hasEolCritical = true;
    }
    if (m.pointerChainId != null) continue;
    systemCount += 1;
    const system = systemsById.get(m.mapSystemId);
    if (!system) continue;
    if (system.rallyAt != null) hasRally = true;
    const exitClass = kspaceExitClass(system.security);
    if (exitClass) exitCounts.set(exitClass, (exitCounts.get(exitClass) ?? 0) + 1);
  }

  const exits: ChainBlobExit[] = [...exitCounts.entries()]
    .map(([securityClass, count]) => ({ securityClass, count }))
    .sort((a, b) => {
      const ra = KSPACE_EXIT_ORDER.indexOf(a.securityClass);
      const rb = KSPACE_EXIT_ORDER.indexOf(b.securityClass);
      if (ra !== rb) return (ra === -1 ? KSPACE_EXIT_ORDER.length : ra) - (rb === -1 ? KSPACE_EXIT_ORDER.length : rb);
      return a.securityClass < b.securityClass ? -1 : 1;
    });

  return { chainId: chain.id, name: chain.name, systemCount, exits, hasRally, hasEolCritical };
}

/** One collapsed chain rendered as a labeled blob spanning its block footprint. */
export type ChainForestBlob = {
  chainId: string;
  kind: ChainKind;
  content: ChainBlobContent;
  /** False below the zoom cutoff — the expand override does not apply there. */
  expandable: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
};

/** One block caption in the forest ("chain name" above an expanded tree, or "Unassigned"). */
export type ChainForestBlockLabel = {
  /** Null ⇔ the "Unassigned" block. */
  chainId: string | null;
  label: string;
  kind: ChainKind | null;
  /** True ⇔ the chain renders expanded only because of the session override (offers re-collapse). */
  collapsible: boolean;
  x: number;
  y: number;
  /** Truncation width for the caption (the block's footprint, floored at a tile). */
  maxWidth: number;
};

/** One chainless system tile in the "Unassigned" grid block. Absolute coords. */
export type ChainForestUnassignedTile = {
  mapSystemId: string;
  system: MapSystemNode;
  x: number;
  y: number;
};

/**
 * The whole All-view canvas: expanded chains as positioned occurrence/pointer
 * nodes + edges, collapsed chains as blobs, chainless systems as unassigned
 * tiles. All coordinates are absolute (block offsets applied).
 */
export type ChainForestCanvasModel = {
  occurrences: ChainOccurrenceNode[];
  pointers: ChainPointerLeaf[];
  edges: ChainCanvasEdge[];
  blobs: ChainForestBlob[];
  labels: ChainForestBlockLabel[];
  unassigned: ChainForestUnassignedTile[];
  width: number;
  height: number;
};

/**
 * Derive the All-view forest canvas from view data. Layout geometry comes from
 * `layoutForest` over the FULL tree footprints — collapse never re-packs the
 * shelf, so zooming across the blob cutoff or toggling a chain's expansion
 * keeps every block in place.
 *
 * - Members are filtered to the given (viewer-visible) chains; a system with no
 *   real occurrence in any of them lands in the "Unassigned" grid block.
 * - Per chain, `shouldCollapseChain({ systemCount, zoom, threshold,
 *   expandedOverride })` picks blob vs tree. A chain with no members renders
 *   nothing (its tab is the affordance).
 * - Forest tree edges ALWAYS key `chainedge:<childMemberId>` (never the raw
 *   connection id): one connection can back links in several chains at once,
 *   and xyflow edge ids must be unique. `connectionId` still resolves canonical
 *   selection; consumers read it from the edge data, not the id.
 */
export function buildForestCanvas(args: {
  /** Chains visible to the viewer; ordering is `layoutForest`'s (shared, personal, by creation). */
  chains: readonly MapChain[];
  members: readonly MapChainMember[];
  systems: readonly MapSystemNode[];
  /** Ids of connections currently live in the view. */
  liveConnectionIds: ReadonlySet<string>;
  /** Ids of connections currently EOL-critical in the view. */
  criticalConnectionIds: ReadonlySet<string>;
  zoom: number;
  /** The viewer's `ap_user.chain_blob_threshold`. */
  threshold: number;
  /** Session-local per-chain expansion overrides. */
  expandedChainIds: ReadonlySet<string>;
  params: ChainLayoutParams;
  orientation: ChainLayoutOrientation;
  viewportWidth: number;
  /** Gap between shelf blocks; defaults to the node gaps. */
  blockGap?: { x: number; y: number };
}): ChainForestCanvasModel {
  const {
    chains,
    members,
    systems,
    liveConnectionIds,
    criticalConnectionIds,
    zoom,
    threshold,
    expandedChainIds,
    params,
    orientation,
    viewportWidth,
    blockGap,
  } = args;

  const chainsById = new Map(chains.map((c) => [c.id, c]));
  const systemsById = new Map(systems.map((s) => [s.id, s]));

  const visibleMembers = members.filter((m) => chainsById.has(m.chainId));
  const chainedSystemIds = new Set(
    visibleMembers.filter((m) => m.pointerChainId === null).map((m) => m.mapSystemId),
  );
  const unassignedSystemIds = systems.map((s) => s.id).filter((id) => !chainedSystemIds.has(id));

  const forest = layoutForest({
    chains,
    members: visibleMembers,
    unassignedSystemIds,
    params,
    orientation,
    viewportWidth,
    blockGap,
  });

  const membersByChainId = new Map<string, MapChainMember[]>();
  for (const m of visibleMembers) {
    const list = membersByChainId.get(m.chainId);
    if (list) list.push(m);
    else membersByChainId.set(m.chainId, [m]);
  }

  const expandable = zoom >= CHAIN_BLOB_ZOOM_CUTOFF;
  const occurrences: ChainOccurrenceNode[] = [];
  const pointers: ChainPointerLeaf[] = [];
  const edges: ChainCanvasEdge[] = [];
  const blobs: ChainForestBlob[] = [];
  const labels: ChainForestBlockLabel[] = [];
  const unassigned: ChainForestUnassignedTile[] = [];

  for (const block of forest.blocks) {
    if (block.kind === 'unassigned') {
      if (block.systems.length === 0) continue;
      labels.push({
        chainId: null,
        label: 'Unassigned',
        kind: null,
        collapsible: false,
        x: block.x,
        y: block.y,
        maxWidth: Math.max(block.width, params.nodeW),
      });
      for (const tile of block.systems) {
        const system = systemsById.get(tile.mapSystemId);
        if (!system) continue;
        unassigned.push({
          mapSystemId: tile.mapSystemId,
          system,
          x: block.x + tile.x,
          y: block.y + tile.y,
        });
      }
      continue;
    }

    if (block.nodes.length === 0) continue; // empty chain: its tab is the affordance
    const chain = chainsById.get(block.chainId);
    if (!chain) continue;
    const chainMembers = membersByChainId.get(block.chainId) ?? [];
    const content = buildChainBlobContent({
      chain,
      members: chainMembers,
      systems,
      criticalConnectionIds,
    });

    const collapsed = shouldCollapseChain({
      systemCount: content.systemCount,
      zoom,
      threshold,
      expandedOverride: expandedChainIds.has(chain.id),
    });
    if (collapsed) {
      blobs.push({
        chainId: chain.id,
        kind: chain.kind,
        content,
        expandable,
        x: block.x,
        y: block.y,
        width: Math.max(block.width, params.nodeW),
        height: Math.max(block.height, params.nodeH),
      });
      continue;
    }

    labels.push({
      chainId: chain.id,
      label: chain.name,
      kind: chain.kind,
      collapsible: content.systemCount > threshold,
      x: block.x,
      y: block.y,
      maxWidth: Math.max(block.width, params.nodeW),
    });
    const resolved = resolveLayoutNodes({
      chainId: chain.id,
      layoutNodes: block.nodes,
      systemsById,
      chainsById,
      offsetX: block.x,
      offsetY: block.y,
    });
    occurrences.push(...resolved.occurrences);
    pointers.push(...resolved.pointers);
    for (const e of block.edges) {
      const sourceNodeId = resolved.nodeIdByMemberId.get(e.sourceMemberId);
      const targetNodeId = resolved.nodeIdByMemberId.get(e.targetMemberId);
      if (!sourceNodeId || !targetNodeId) continue;
      const live = e.viaConnectionId != null && liveConnectionIds.has(e.viaConnectionId);
      edges.push({
        id: chainFallbackEdgeId(e.targetMemberId),
        sourceNodeId,
        targetNodeId,
        connectionId: live ? e.viaConnectionId : null,
      });
    }
  }

  return { occurrences, pointers, edges, blobs, labels, unassigned, width: forest.width, height: forest.height };
}
