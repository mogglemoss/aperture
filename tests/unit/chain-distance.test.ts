import { describe, expect, it } from 'vitest';
import {
  computeChainDistances,
  formatChainDistanceTooltip,
  isKspaceSecurity,
  multiSourceGateBfs,
  resolveOriginSystemIds,
  type ChainExitSet,
} from '@/lib/map/chains/distance';

// Undirected adjacency from an edge list, mirroring what loadGateGraph builds.
function adjacencyOf(edges: [number, number][]): Map<number, number[]> {
  const adjacency = new Map<number, number[]>();
  const push = (from: number, to: number) => {
    const list = adjacency.get(from);
    if (list) list.push(to);
    else adjacency.set(from, [to]);
  };
  for (const [a, b] of edges) {
    push(a, b);
    push(b, a);
  }
  return adjacency;
}

// A line 1—2—3—4—5 plus a disconnected island 100—101.
const LINE = adjacencyOf([
  [1, 2],
  [2, 3],
  [3, 4],
  [4, 5],
  [100, 101],
]);

describe('isKspaceSecurity', () => {
  it('counts every non-C* label as k-space, null as unknown', () => {
    expect(isKspaceSecurity('H')).toBe(true);
    expect(isKspaceSecurity('L')).toBe(true);
    expect(isKspaceSecurity('0.0')).toBe(true);
    expect(isKspaceSecurity('P')).toBe(true);
    expect(isKspaceSecurity('C2')).toBe(false);
    expect(isKspaceSecurity('C13')).toBe(false);
    expect(isKspaceSecurity(null)).toBe(false);
  });
});

describe('multiSourceGateBfs', () => {
  it('yields jump distances from a single origin', () => {
    const dist = multiSourceGateBfs(LINE, [1]);
    expect(dist.get(1)).toBe(0);
    expect(dist.get(3)).toBe(2);
    expect(dist.get(5)).toBe(4);
    expect(dist.has(100)).toBe(false); // disconnected island unreachable
  });

  it('takes the min over several origins in one pass', () => {
    const dist = multiSourceGateBfs(LINE, [1, 5]);
    expect(dist.get(3)).toBe(2);
    expect(dist.get(2)).toBe(1);
    expect(dist.get(4)).toBe(1);
  });

  it('seeds an origin outside the adjacency at 0 without reaching further', () => {
    const dist = multiSourceGateBfs(LINE, [999]);
    expect(dist.get(999)).toBe(0);
    expect(dist.size).toBe(1);
  });
});

describe('computeChainDistances', () => {
  it('reduces each chain to the min over its exits, naming the argmin exit', () => {
    const chains: ChainExitSet[] = [
      { chainId: '10', exitSystemIds: [3, 5] }, // 2 jumps via 3, 4 via 5
      { chainId: '11', exitSystemIds: [1] }, // sitting on the origin
    ];
    const { distances, nearestExits } = computeChainDistances({
      adjacency: LINE,
      originSystemIds: [1],
      chains,
    });
    expect(distances).toEqual({ '10': 2, '11': 0 });
    expect(nearestExits).toEqual({ '10': 3, '11': 1 });
  });

  it('breaks distance ties to the first-listed exit', () => {
    const { distances, nearestExits } = computeChainDistances({
      adjacency: LINE,
      originSystemIds: [3],
      chains: [{ chainId: '10', exitSystemIds: [4, 2] }], // both 1 jump
    });
    expect(distances['10']).toBe(1);
    expect(nearestExits['10']).toBe(4);
  });

  it('reduces a chain with no k-space exits to null, never 0', () => {
    const { distances, nearestExits } = computeChainDistances({
      adjacency: LINE,
      originSystemIds: [1],
      chains: [{ chainId: '10', exitSystemIds: [] }],
    });
    expect(distances).toEqual({ '10': null });
    expect(nearestExits).toEqual({ '10': null });
  });

  it('reduces a chain whose exits are gate-unreachable to null', () => {
    const { distances } = computeChainDistances({
      adjacency: LINE,
      originSystemIds: [1],
      chains: [{ chainId: '10', exitSystemIds: [100] }], // the island
    });
    expect(distances).toEqual({ '10': null });
  });
});

describe('resolveOriginSystemIds', () => {
  const chains: ChainExitSet[] = [
    { chainId: '10', exitSystemIds: [1, 2] },
    { chainId: '11', exitSystemIds: [2, 5] },
    { chainId: '12', exitSystemIds: [4] },
  ];

  it('a k-space pilot is their own system', () => {
    expect(
      resolveOriginSystemIds({
        pilotSystemId: 3,
        pilotIsKspace: true,
        containingChainIds: new Set(['10']),
        chains,
      }),
    ).toEqual([3]);
  });

  it('a J-space pilot is the deduped exits of the chains containing them', () => {
    expect(
      resolveOriginSystemIds({
        pilotSystemId: 31000001,
        pilotIsKspace: false,
        containingChainIds: new Set(['10', '11']),
        chains,
      }).sort((a, b) => a - b),
    ).toEqual([1, 2, 5]);
  });

  it('a J-space pilot outside every visible chain resolves to no origins', () => {
    expect(
      resolveOriginSystemIds({
        pilotSystemId: 31000001,
        pilotIsKspace: false,
        containingChainIds: new Set(),
        chains,
      }),
    ).toEqual([]);
  });
});

describe('J-space origin-set case (end to end, pure)', () => {
  it('measures every chain from the containing chain’s exits — own chain 0, others min over pairs', () => {
    const chains: ChainExitSet[] = [
      { chainId: '10', exitSystemIds: [1] }, // the chain the pilot sits inside
      { chainId: '11', exitSystemIds: [4, 5] },
      { chainId: '12', exitSystemIds: [] }, // all-J chain
    ];
    const origins = resolveOriginSystemIds({
      pilotSystemId: 31000001,
      pilotIsKspace: false,
      containingChainIds: new Set(['10']),
      chains,
    });
    const { distances, nearestExits } = computeChainDistances({
      adjacency: LINE,
      originSystemIds: origins,
      chains,
    });
    expect(distances).toEqual({ '10': 0, '11': 3, '12': null });
    expect(nearestExits).toEqual({ '10': 1, '11': 4, '12': null });
  });
});

describe('formatChainDistanceTooltip', () => {
  it('names the exit with a pluralized jump count', () => {
    expect(formatChainDistanceTooltip({ jumps: 1, exitName: 'Perimeter' })).toBe(
      '1 jump to Perimeter via gates',
    );
    expect(formatChainDistanceTooltip({ jumps: 4, exitName: 'Jita' })).toBe(
      '4 jumps to Jita via gates',
    );
    expect(formatChainDistanceTooltip({ jumps: 2, exitName: null })).toBe(
      '2 jumps to the nearest k-space exit via gates',
    );
  });

  it('explains the "—" badge', () => {
    expect(formatChainDistanceTooltip(null)).toBe('No k-space exit — unreachable by gates');
  });
});
