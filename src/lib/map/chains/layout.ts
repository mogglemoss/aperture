/**
 * Pure forest layout engine for chain mode (nomadic-chains). No `server-only`,
 * no DB, no React — memberships in, positioned occurrence nodes + edges out,
 * for one tree (a chain tab) or the whole forest (the All view).
 *
 * Hand-rolled recursive tidy-tree: a subtree's breadth is
 * `max(nodeW, Σ children breadths + gaps)`, the parent is centered over its
 * children's span, and the depth axis is `depth × (nodeH + gapY)`. O(n) over
 * members. Children order deterministically by member id (creation order) so
 * growth never shuffles siblings.
 *
 * Everything is computed in logical (breadth × depth) coordinates and
 * transposed at the end per the requested orientation. Node/gap dimensions are
 * parameters — this module never imports UI constants. Chain mode is not
 * draggable: the generated layout owns positions.
 */

import type { ChainKind } from '@/types';

/** Which way depth grows: `root-top` downward, `root-left` rightward. */
export type ChainLayoutOrientation = 'root-top' | 'root-left';

/**
 * Node and gap dimensions, in logical (breadth × depth) terms: `nodeW` is a
 * tile's breadth-axis extent, `nodeH` its depth-axis extent, `gapX` the gap
 * between sibling subtrees, `gapY` the gap between depth levels. Under
 * `root-left` the whole plane is transposed, so `nodeW` becomes the rendered
 * height. Pointer-leaf pills default to the tile size.
 */
export type ChainLayoutParams = {
  nodeW: number;
  nodeH: number;
  gapX: number;
  gapY: number;
  /** Pointer-leaf pill breadth-axis extent; defaults to `nodeW`. */
  pointerW?: number;
  /** Pointer-leaf pill depth-axis extent; defaults to `nodeH`. */
  pointerH?: number;
};

/**
 * The membership fields the layout consumes — `MapChainMember` (and the
 * realtime `chain.member.added` body) is structurally assignable.
 */
export type ChainLayoutMemberRef = {
  /** `ap_map_chain_member.id` as a string; sibling order keys on it. */
  id: string;
  chainId: string;
  mapSystemId: string;
  /** Parent member in the tree; null ⇔ the chain's root. */
  parentMemberId: string | null;
  /** Threaded through to the outbound edge/node; optional. */
  viaConnectionId?: string | null;
  /** Non-null ⇔ pointer-leaf ("continues in …" / loop pill). */
  pointerChainId: string | null;
};

/** One positioned occurrence node. Coordinates are block-local top-left. */
export type ChainLayoutNode = {
  memberId: string;
  chainId: string;
  mapSystemId: string;
  parentMemberId: string | null;
  /** Non-null ⇔ this node renders as a terminal pointer-leaf pill. */
  pointerChainId: string | null;
  viaConnectionId: string | null;
  /** 0 = root. */
  depth: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

/** One parent→child tree edge. `id` is the child member id (each member has at most one inbound edge). */
export type ChainLayoutEdge = {
  id: string;
  sourceMemberId: string;
  targetMemberId: string;
  viaConnectionId: string | null;
};

/** One laid-out chain: nodes + edges at origin (0,0) plus the bounding block. */
export type ChainTreeLayout = {
  chainId: string;
  nodes: ChainLayoutNode[];
  edges: ChainLayoutEdge[];
  width: number;
  height: number;
};

/** The chain fields forest ordering consumes — `MapChain` is structurally assignable. */
export type ChainRef = {
  /** `ap_map_chain.id` as a string; creation order keys on it. */
  id: string;
  kind: ChainKind;
};

/** One chainless system placed in the "Unassigned" grid block. Block-local coords. */
export type UnassignedSystemNode = {
  mapSystemId: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

/** One shelf-packed block of the All view. `x`/`y` place the block; node coords stay block-local. */
export type ChainForestBlock =
  | {
      kind: 'chain';
      chainId: string;
      x: number;
      y: number;
      width: number;
      height: number;
      nodes: ChainLayoutNode[];
      edges: ChainLayoutEdge[];
    }
  | {
      kind: 'unassigned';
      x: number;
      y: number;
      width: number;
      height: number;
      systems: UnassignedSystemNode[];
    };

/** The whole All view: shelf-packed blocks plus the forest's bounding extent. */
export type ChainForestLayout = {
  blocks: ChainForestBlock[];
  width: number;
  height: number;
};

/** Numeric-string id order (bigserial ids: shorter is smaller, then lexicographic). */
function compareIdAsc(a: string, b: string): number {
  if (a.length !== b.length) return a.length - b.length;
  return a < b ? -1 : a > b ? 1 : 0;
}

type TreeNode = {
  member: ChainLayoutMemberRef;
  children: TreeNode[];
  /** Subtree breadth: `max(own breadth extent, Σ children breadths + gaps)`. */
  breadth: number;
};

/**
 * Lay out one chain's tree. Members are filtered to `chainId`; a member whose
 * parent is absent from the set is treated as an additional root (roots lay
 * side by side along the breadth axis); members trapped in a parent cycle are
 * unreachable and omitted. Empty input yields an empty 0×0 layout.
 */
export function layoutChainTree(
  chainId: string,
  members: readonly ChainLayoutMemberRef[],
  params: ChainLayoutParams,
  orientation: ChainLayoutOrientation,
): ChainTreeLayout {
  const { nodeW, nodeH, gapX, gapY } = params;
  const pointerW = params.pointerW ?? nodeW;
  const pointerH = params.pointerH ?? nodeH;

  const chainMembers = members.filter((m) => m.chainId === chainId);
  const present = new Set(chainMembers.map((m) => m.id));
  const roots: TreeNode[] = [];
  const nodesByMemberId = new Map<string, TreeNode>();
  const childrenByParentId = new Map<string, TreeNode[]>();

  for (const member of chainMembers) {
    const node: TreeNode = { member, children: [], breadth: 0 };
    nodesByMemberId.set(member.id, node);
    if (member.parentMemberId == null || !present.has(member.parentMemberId)) {
      roots.push(node);
    } else {
      const siblings = childrenByParentId.get(member.parentMemberId);
      if (siblings) siblings.push(node);
      else childrenByParentId.set(member.parentMemberId, [node]);
    }
  }
  roots.sort((a, b) => compareIdAsc(a.member.id, b.member.id));
  for (const [parentId, siblings] of childrenByParentId) {
    siblings.sort((a, b) => compareIdAsc(a.member.id, b.member.id));
    const parent = nodesByMemberId.get(parentId);
    if (parent) parent.children = siblings;
  }

  const breadthExtent = (n: TreeNode) => (n.member.pointerChainId != null ? pointerW : nodeW);
  const depthExtent = (n: TreeNode) => (n.member.pointerChainId != null ? pointerH : nodeH);

  const measure = (n: TreeNode): number => {
    let childrenSpan = 0;
    for (const child of n.children) childrenSpan += measure(child);
    if (n.children.length > 0) childrenSpan += gapX * (n.children.length - 1);
    n.breadth = Math.max(breadthExtent(n), childrenSpan);
    return n.breadth;
  };

  type Placed = { node: TreeNode; b: number; d: number; depth: number };
  const placed: Placed[] = [];
  const place = (n: TreeNode, breadthOffset: number, depth: number) => {
    placed.push({
      node: n,
      b: breadthOffset + (n.breadth - breadthExtent(n)) / 2,
      d: depth * (nodeH + gapY),
      depth,
    });
    let childrenSpan = 0;
    for (const child of n.children) childrenSpan += child.breadth;
    if (n.children.length > 0) childrenSpan += gapX * (n.children.length - 1);
    let childOffset = breadthOffset + (n.breadth - childrenSpan) / 2;
    for (const child of n.children) {
      place(child, childOffset, depth + 1);
      childOffset += child.breadth + gapX;
    }
  };

  let rootOffset = 0;
  for (const root of roots) {
    measure(root);
    place(root, rootOffset, 0);
    rootOffset += root.breadth + gapX;
  }

  let maxB = 0;
  let maxD = 0;
  const nodes: ChainLayoutNode[] = [];
  const edges: ChainLayoutEdge[] = [];
  for (const { node, b, d, depth } of placed) {
    const bSize = breadthExtent(node);
    const dSize = depthExtent(node);
    maxB = Math.max(maxB, b + bSize);
    maxD = Math.max(maxD, d + dSize);
    const { member } = node;
    nodes.push({
      memberId: member.id,
      chainId: member.chainId,
      mapSystemId: member.mapSystemId,
      parentMemberId: member.parentMemberId,
      pointerChainId: member.pointerChainId,
      viaConnectionId: member.viaConnectionId ?? null,
      depth,
      x: orientation === 'root-top' ? b : d,
      y: orientation === 'root-top' ? d : b,
      width: orientation === 'root-top' ? bSize : dSize,
      height: orientation === 'root-top' ? dSize : bSize,
    });
    if (member.parentMemberId != null && present.has(member.parentMemberId)) {
      edges.push({
        id: member.id,
        sourceMemberId: member.parentMemberId,
        targetMemberId: member.id,
        viaConnectionId: member.viaConnectionId ?? null,
      });
    }
  }

  return {
    chainId,
    nodes,
    edges,
    width: orientation === 'root-top' ? maxB : maxD,
    height: orientation === 'root-top' ? maxD : maxB,
  };
}

/** A block footprint for shelf packing. */
export type ShelfBlock = { width: number; height: number };
/** A shelf-packed block position (top-left). */
export type ShelfPosition = { x: number; y: number };

/**
 * Shelf-pack blocks into rows in the given order, wrapping at `viewportWidth`
 * (row height = tallest block in the row; a block wider than the viewport
 * gets its own row at natural width — horizontal scroll is accepted). Order is
 * the caller's and never keys on size, so growth doesn't teleport blocks.
 */
export function packShelves(
  blocks: readonly ShelfBlock[],
  viewportWidth: number,
  gapX: number,
  gapY: number,
): ShelfPosition[] {
  const positions: ShelfPosition[] = [];
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  for (const block of blocks) {
    if (x > 0 && x + block.width > viewportWidth) {
      x = 0;
      y += rowHeight + gapY;
      rowHeight = 0;
    }
    positions.push({ x, y });
    x += block.width + gapX;
    rowHeight = Math.max(rowHeight, block.height);
  }
  return positions;
}

/** Lay chainless systems out as a plain grid wrapping at `viewportWidth`, ordered by system id. */
function layoutUnassignedGrid(
  systemIds: readonly string[],
  params: ChainLayoutParams,
  viewportWidth: number,
): { systems: UnassignedSystemNode[]; width: number; height: number } {
  const { nodeW, nodeH, gapX, gapY } = params;
  const ordered = [...systemIds].sort(compareIdAsc);
  const columns = Math.max(1, Math.floor((viewportWidth + gapX) / (nodeW + gapX)));
  const systems = ordered.map((mapSystemId, i) => ({
    mapSystemId,
    x: (i % columns) * (nodeW + gapX),
    y: Math.floor(i / columns) * (nodeH + gapY),
    width: nodeW,
    height: nodeH,
  }));
  const usedColumns = Math.min(ordered.length, columns);
  const rows = Math.ceil(ordered.length / columns);
  return {
    systems,
    width: usedColumns > 0 ? usedColumns * (nodeW + gapX) - gapX : 0,
    height: rows > 0 ? rows * (nodeH + gapY) - gapY : 0,
  };
}

/**
 * Lay out the All view: every chain as a bounding block, shelf-packed into
 * rows wrapping at `viewportWidth`. Block order is shared chains then
 * personal, each by creation (id) order, with the "Unassigned" pseudo-chain
 * (chainless systems as a plain grid block) last — never by size. A chain with
 * no members contributes an empty 0×0 block.
 */
export function layoutForest(args: {
  chains: readonly ChainRef[];
  members: readonly ChainLayoutMemberRef[];
  unassignedSystemIds: readonly string[];
  params: ChainLayoutParams;
  orientation: ChainLayoutOrientation;
  viewportWidth: number;
  /** Gap between shelf blocks (visual chain separation); defaults to `params.gapX`/`gapY`. */
  blockGap?: { x: number; y: number };
}): ChainForestLayout {
  const { chains, members, unassignedSystemIds, params, orientation, viewportWidth, blockGap } =
    args;

  const ordered = [...chains].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'shared' ? -1 : 1;
    return compareIdAsc(a.id, b.id);
  });

  const trees = ordered.map((chain) => layoutChainTree(chain.id, members, params, orientation));
  const unassigned =
    unassignedSystemIds.length > 0
      ? layoutUnassignedGrid(unassignedSystemIds, params, viewportWidth)
      : null;

  const footprints: ShelfBlock[] = trees.map((t) => ({ width: t.width, height: t.height }));
  if (unassigned) footprints.push({ width: unassigned.width, height: unassigned.height });
  const positions = packShelves(
    footprints,
    viewportWidth,
    blockGap?.x ?? params.gapX,
    blockGap?.y ?? params.gapY,
  );

  const blocks: ChainForestBlock[] = trees.map((tree, i) => {
    const pos = positions[i] ?? { x: 0, y: 0 };
    return {
      kind: 'chain' as const,
      chainId: tree.chainId,
      x: pos.x,
      y: pos.y,
      width: tree.width,
      height: tree.height,
      nodes: tree.nodes,
      edges: tree.edges,
    };
  });
  if (unassigned) {
    const pos = positions[positions.length - 1] ?? { x: 0, y: 0 };
    blocks.push({
      kind: 'unassigned',
      x: pos.x,
      y: pos.y,
      width: unassigned.width,
      height: unassigned.height,
      systems: unassigned.systems,
    });
  }

  let width = 0;
  let height = 0;
  for (const block of blocks) {
    width = Math.max(width, block.x + block.width);
    height = Math.max(height, block.y + block.height);
  }
  return { blocks, width, height };
}
