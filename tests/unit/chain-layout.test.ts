import { describe, expect, it } from 'vitest';
import {
  layoutChainTree,
  layoutForest,
  packShelves,
  type ChainLayoutMemberRef,
  type ChainLayoutParams,
} from '@/lib/map/chains/layout';
import {
  CHAIN_BLOB_ZOOM_CUTOFF,
  formatChainBlobLine,
  shouldCollapseChain,
  type ChainBlobContent,
} from '@/lib/map/chains/collapse';

// Pure module checks for the Stage 3 forest layout engine + LOD collapse
// decision. No DB, no rendering.

const P: ChainLayoutParams = { nodeW: 100, nodeH: 50, gapX: 20, gapY: 30 };

/** Membership fixture: `m('5', '1')` = member 5 charted from member 1. */
function m(
  id: string,
  parentMemberId: string | null,
  over: Partial<ChainLayoutMemberRef> = {},
): ChainLayoutMemberRef {
  return { id, chainId: '1', mapSystemId: `s${id}`, parentMemberId, pointerChainId: null, ...over };
}

const nodeById = <T extends { memberId: string }>(layout: { nodes: T[] }, id: string): T => {
  const node = layout.nodes.find((n) => n.memberId === id);
  if (!node) throw new Error(`no node ${id}`);
  return node;
};

describe('layoutChainTree — subtree breadth math', () => {
  it('spans a fan of children and centers the parent over them', () => {
    // root(1) with three leaf children: span = 3·nodeW + 2·gapX = 340.
    const layout = layoutChainTree('1', [m('1', null), m('2', '1'), m('3', '1'), m('4', '1')], P, 'root-top');
    expect(layout.width).toBe(340);
    expect(layout.height).toBe(50 + 80); // depth 1 at nodeH+gapY=80, plus its own nodeH
    expect(nodeById(layout, '2').x).toBe(0);
    expect(nodeById(layout, '3').x).toBe(120);
    expect(nodeById(layout, '4').x).toBe(240);
    // Parent centered over the children's span.
    expect(nodeById(layout, '1').x).toBe(120);
    expect(nodeById(layout, '1').y).toBe(0);
    expect(nodeById(layout, '2').y).toBe(80);
  });

  it('a subtree with children is as broad as their span, a linear chain stays nodeW', () => {
    // root(1) → A(2){21,22} + B(3): A's breadth 220, B 100, root span 340.
    const layout = layoutChainTree(
      '1',
      [m('1', null), m('2', '1'), m('3', '1'), m('21', '2'), m('22', '2')],
      P,
      'root-top',
    );
    expect(layout.width).toBe(340);
    expect(nodeById(layout, '21').x).toBe(0);
    expect(nodeById(layout, '22').x).toBe(120);
    expect(nodeById(layout, '2').x).toBe(60); // centered over its own two children
    expect(nodeById(layout, '3').x).toBe(240);
    expect(nodeById(layout, '1').x).toBe(120); // centered over the 340 span

    // A purely linear chain never exceeds one node's breadth.
    const linear = layoutChainTree('1', [m('1', null), m('2', '1'), m('3', '2')], P, 'root-top');
    expect(linear.width).toBe(100);
    expect(nodeById(linear, '3').x).toBe(0);
    expect(nodeById(linear, '3').y).toBe(160);
  });

  it('a parent wider than its children span centers the children under it', () => {
    // Pointer pill child (60 wide) under a 100-wide parent: slot = max(100, 60).
    const layout = layoutChainTree(
      '1',
      [m('1', null), m('2', '1', { pointerChainId: '9' })],
      { ...P, pointerW: 60, pointerH: 24 },
      'root-top',
    );
    expect(layout.width).toBe(100);
    expect(nodeById(layout, '1').x).toBe(0);
    expect(nodeById(layout, '2').x).toBe(20); // (100 − 60) / 2
  });

  it('emits one parent→child edge per non-root member, carrying the via connection', () => {
    const layout = layoutChainTree('1', [m('1', null), m('2', '1', { viaConnectionId: '77' })], P, 'root-top');
    expect(layout.edges).toEqual([
      { id: '2', sourceMemberId: '1', targetMemberId: '2', viaConnectionId: '77' },
    ]);
  });
});

describe('layoutChainTree — sibling stability', () => {
  it('orders siblings by member id (creation order), not input order', () => {
    const layout = layoutChainTree('1', [m('1', null), m('3', '1'), m('2', '1')], P, 'root-top');
    expect(nodeById(layout, '2').x).toBeLessThan(nodeById(layout, '3').x);
  });

  it('an added child appends after existing siblings without shuffling them', () => {
    const before = layoutChainTree('1', [m('1', null), m('2', '1'), m('3', '1')], P, 'root-top');
    const after = layoutChainTree('1', [m('1', null), m('2', '1'), m('3', '1'), m('9', '1')], P, 'root-top');
    const order = (l: typeof before) =>
      l.nodes
        .filter((n) => n.depth === 1)
        .sort((a, b) => a.x - b.x)
        .map((n) => n.memberId);
    expect(order(before)).toEqual(['2', '3']);
    expect(order(after)).toEqual(['2', '3', '9']);
    // Numeric id order, not lexicographic: '10' sorts after '9'.
    const wide = layoutChainTree(
      '1',
      [m('1', null), m('2', '1'), m('3', '1'), m('9', '1'), m('10', '1')],
      P,
      'root-top',
    );
    expect(order(wide)).toEqual(['2', '3', '9', '10']);
  });
});

describe('layoutChainTree — orientation transpose', () => {
  it('root-left is the exact transpose of root-top', () => {
    const members = [
      m('1', null),
      m('2', '1'),
      m('3', '1'),
      m('21', '2'),
      m('22', '2', { pointerChainId: '5' }),
    ];
    const params = { ...P, pointerW: 60, pointerH: 24 };
    const top = layoutChainTree('1', members, params, 'root-top');
    const left = layoutChainTree('1', members, params, 'root-left');
    expect(left.width).toBe(top.height);
    expect(left.height).toBe(top.width);
    for (const node of top.nodes) {
      const other = nodeById(left, node.memberId);
      expect(other.x).toBe(node.y);
      expect(other.y).toBe(node.x);
      expect(other.width).toBe(node.height);
      expect(other.height).toBe(node.width);
      expect(other.depth).toBe(node.depth);
    }
  });
});

describe('layoutChainTree — pointer-leaf sizing', () => {
  it('pointer-leaves take the pill dimensions and contribute pill breadth to the span', () => {
    const layout = layoutChainTree(
      '1',
      [m('1', null), m('2', '1'), m('3', '1', { pointerChainId: '7' })],
      { ...P, pointerW: 60, pointerH: 24 },
      'root-top',
    );
    const pill = nodeById(layout, '3');
    expect(pill.width).toBe(60);
    expect(pill.height).toBe(24);
    expect(pill.pointerChainId).toBe('7');
    // Span = nodeW + gapX + pointerW, not 2·nodeW + gapX.
    expect(layout.width).toBe(100 + 20 + 60);
    expect(pill.x).toBe(120);
  });

  it('pill dimensions default to the tile size when not supplied', () => {
    const layout = layoutChainTree('1', [m('1', null), m('2', '1', { pointerChainId: '7' })], P, 'root-top');
    const pill = nodeById(layout, '2');
    expect(pill.width).toBe(100);
    expect(pill.height).toBe(50);
  });
});

describe('packShelves — shelf wrap', () => {
  it('wraps rows at the viewport width, row height = tallest block in the row', () => {
    const positions = packShelves(
      [
        { width: 300, height: 100 },
        { width: 300, height: 200 },
        { width: 300, height: 50 },
      ],
      650,
      20,
      30,
    );
    // Blocks 1+2 fit (300 + 20 + 300 = 620 ≤ 650); block 3 wraps below the
    // tallest block of row one (200) plus the row gap.
    expect(positions).toEqual([
      { x: 0, y: 0 },
      { x: 320, y: 0 },
      { x: 0, y: 230 },
    ]);
  });

  it('a block wider than the viewport keeps its own row at natural width', () => {
    const positions = packShelves(
      [
        { width: 900, height: 100 },
        { width: 200, height: 50 },
      ],
      650,
      20,
      30,
    );
    expect(positions).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 130 },
    ]);
  });
});

describe('layoutForest', () => {
  it('orders blocks shared → personal by creation order, Unassigned last — never by size', () => {
    const members = [
      // Personal chain 1 is the biggest; shared 3 is created after shared 2.
      m('1', null, { chainId: '1' }),
      m('2', '1', { chainId: '1' }),
      m('3', '1', { chainId: '1' }),
      m('4', null, { chainId: '2' }),
      m('5', null, { chainId: '3' }),
    ];
    const forest = layoutForest({
      chains: [
        { id: '1', kind: 'personal' },
        { id: '3', kind: 'shared' },
        { id: '2', kind: 'shared' },
      ],
      members,
      unassignedSystemIds: ['90', '91'],
      params: P,
      orientation: 'root-top',
      viewportWidth: 10_000,
    });
    expect(
      forest.blocks.map((b) => (b.kind === 'chain' ? b.chainId : 'unassigned')),
    ).toEqual(['2', '3', '1', 'unassigned']);
    // One row (huge viewport): x strictly increases in that order.
    const xs = forest.blocks.map((b) => b.x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
  });

  it('lays unassigned systems as a grid wrapping at the viewport width', () => {
    const forest = layoutForest({
      chains: [],
      members: [],
      unassignedSystemIds: ['5', '1', '3', '2', '4'],
      params: P,
      orientation: 'root-top',
      // Fits 3 columns: 3·100 + 2·20 = 340 ≤ 360 < 4 columns.
      viewportWidth: 360,
    });
    expect(forest.blocks).toHaveLength(1);
    const block = forest.blocks[0];
    if (!block || block.kind !== 'unassigned') throw new Error('expected unassigned block');
    expect(block.width).toBe(340);
    expect(block.height).toBe(130); // two rows
    expect(block.systems.map((s) => s.mapSystemId)).toEqual(['1', '2', '3', '4', '5']);
    expect(block.systems[3]).toMatchObject({ mapSystemId: '4', x: 0, y: 80 });
  });

  it('blockGap spaces the shelf packing without touching intra-tree gaps', () => {
    const members = [m('1', null, { chainId: '1' }), m('2', null, { chainId: '2' })];
    const forest = layoutForest({
      chains: [
        { id: '1', kind: 'shared' },
        { id: '2', kind: 'shared' },
      ],
      members,
      unassignedSystemIds: [],
      params: P,
      orientation: 'root-top',
      viewportWidth: 10_000,
      blockGap: { x: 90, y: 80 },
    });
    expect(forest.blocks[1]).toMatchObject({ x: P.nodeW + 90, y: 0 });
  });

  it('a chain with no members contributes an empty 0×0 block', () => {
    const forest = layoutForest({
      chains: [{ id: '1', kind: 'shared' }],
      members: [],
      unassignedSystemIds: [],
      params: P,
      orientation: 'root-top',
      viewportWidth: 500,
    });
    expect(forest.blocks).toEqual([
      { kind: 'chain', chainId: '1', x: 0, y: 0, width: 0, height: 0, nodes: [], edges: [] },
    ]);
  });
});

describe('shouldCollapseChain — precedence', () => {
  const base = { systemCount: 5, zoom: 1, threshold: 15, expandedOverride: false };

  it('below the zoom cutoff every chain is a blob, even small or overridden ones', () => {
    expect(shouldCollapseChain({ ...base, zoom: 0.2 })).toBe(true);
    expect(shouldCollapseChain({ ...base, zoom: 0.2, expandedOverride: true })).toBe(true);
    expect(shouldCollapseChain({ ...base, zoom: 0.2, systemCount: 1 })).toBe(true);
  });

  it('at or above the cutoff, size over the threshold blobs', () => {
    expect(shouldCollapseChain({ ...base, systemCount: 16 })).toBe(true);
    expect(shouldCollapseChain({ ...base, zoom: CHAIN_BLOB_ZOOM_CUTOFF, systemCount: 16 })).toBe(true);
  });

  it('the session expansion override wins over the threshold — but only above the cutoff', () => {
    expect(shouldCollapseChain({ ...base, systemCount: 16, expandedOverride: true })).toBe(false);
  });

  it('at or under the threshold stays expanded', () => {
    expect(shouldCollapseChain({ ...base, systemCount: 15 })).toBe(false);
    expect(shouldCollapseChain({ ...base, systemCount: 1 })).toBe(false);
  });
});

describe('formatChainBlobLine', () => {
  it('renders count and exit buckets joined by middots', () => {
    const content: ChainBlobContent = {
      chainId: '1',
      name: 'Thera',
      systemCount: 34,
      exits: [
        { securityClass: 'HS', count: 5 },
        { securityClass: 'LS', count: 2 },
      ],
      hasRally: false,
      hasEolCritical: true,
    };
    expect(formatChainBlobLine(content)).toBe('34 systems · 5 HS · 2 LS');
  });

  it('singularizes one system and omits exits when there are none', () => {
    expect(
      formatChainBlobLine({
        chainId: '1',
        name: 'C6 dead end',
        systemCount: 1,
        exits: [],
        hasRally: false,
        hasEolCritical: false,
      }),
    ).toBe('1 system');
  });
});
