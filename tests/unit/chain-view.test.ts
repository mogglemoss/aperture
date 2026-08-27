import { describe, expect, it } from 'vitest';
import {
  buildChainCanvas,
  chainOccurrenceNodeId,
  chainPointerNodeId,
  sortChainsForTabs,
} from '@/lib/map/chains/view';
import { layoutChainTree, type ChainLayoutParams } from '@/lib/map/chains/layout';
import type { MapChain, MapChainMember, MapSystemNode } from '@/types';

// Pure checks for the Stage 4 chain-canvas derivation (viewData slices →
// occurrence/pointer view-models + edges). No DB, no rendering.

const P: ChainLayoutParams = { nodeW: 100, nodeH: 50, gapX: 20, gapY: 30 };

function chain(id: string, over: Partial<MapChain> = {}): MapChain {
  return {
    id,
    name: `Chain ${id}`,
    kind: 'shared',
    ownerCharacterId: null,
    createdAt: '2026-08-27T00:00:00.000Z',
    updatedAt: '2026-08-27T00:00:00.000Z',
    ...over,
  };
}

function member(
  id: string,
  parentMemberId: string | null,
  over: Partial<MapChainMember> = {},
): MapChainMember {
  return {
    id,
    chainId: '1',
    mapSystemId: `s${id}`,
    parentMemberId,
    viaConnectionId: null,
    pointerChainId: null,
    ...over,
  };
}

function system(id: string, over: Partial<MapSystemNode> = {}): MapSystemNode {
  return {
    id,
    systemId: Number(id.replace(/\D/g, '') || 0) + 31000000,
    name: `J1000${id.replace(/\D/g, '')}`,
    alias: null,
    tag: null,
    intelNotes: null,
    status: 'unknown',
    security: 'C3',
    trueSec: -1,
    effect: null,
    regionName: 'D-R00018',
    constellationName: 'D-C00072',
    statics: [],
    staticTypeIds: [],
    tradeHub: null,
    locked: false,
    lockedByCharacterId: null,
    lockedByName: null,
    rallyAt: null,
    positionX: 0,
    positionY: 0,
    ...over,
  } as MapSystemNode;
}

describe('buildChainCanvas — occurrence derivation', () => {
  it('emits one occurrence per real member, keyed chainId:mapSystemId, with layout positions', () => {
    const members = [member('1', null), member('2', '1'), member('3', '1')];
    const systems = members.map((m) => system(m.mapSystemId));
    const model = buildChainCanvas({
      chainId: '1',
      chains: [chain('1')],
      members,
      systems,
      liveConnectionIds: new Set(),
      params: P,
      orientation: 'root-top',
    });

    expect(model.occurrences.map((o) => o.id)).toEqual(['1:s1', '1:s2', '1:s3']);
    expect(model.occurrences[0]!.id).toBe(chainOccurrenceNodeId('1', 's1'));
    expect(model.pointers).toEqual([]);

    // Positions/extent come straight from the layout engine.
    const layout = layoutChainTree('1', members, P, 'root-top');
    for (const o of model.occurrences) {
      const l = layout.nodes.find((n) => n.memberId === o.memberId)!;
      expect({ x: o.x, y: o.y, depth: o.depth }).toEqual({ x: l.x, y: l.y, depth: l.depth });
    }
    expect(model.width).toBe(layout.width);
    expect(model.height).toBe(layout.height);

    // The canonical row rides on the occurrence.
    expect(model.occurrences[1]!.system.name).toBe(systems[1]!.name);
  });

  it('filters to the requested chain', () => {
    const members = [member('1', null), member('9', null, { chainId: '2', mapSystemId: 's9' })];
    const model = buildChainCanvas({
      chainId: '1',
      chains: [chain('1'), chain('2')],
      members,
      systems: [system('s1'), system('s9')],
      liveConnectionIds: new Set(),
      params: P,
      orientation: 'root-top',
    });
    expect(model.occurrences.map((o) => o.memberId)).toEqual(['1']);
  });

  it('skips an occurrence whose canonical system is missing, dropping its incident edges', () => {
    const members = [
      member('1', null),
      member('2', '1', { viaConnectionId: 'c2' }),
      member('3', '2', { viaConnectionId: 'c3' }),
    ];
    const model = buildChainCanvas({
      chainId: '1',
      chains: [chain('1')],
      members,
      systems: [system('s1'), system('s3')], // s2 missing
      liveConnectionIds: new Set(['c2', 'c3']),
      params: P,
      orientation: 'root-top',
    });
    expect(model.occurrences.map((o) => o.memberId)).toEqual(['1', '3']);
    expect(model.edges).toEqual([]); // both edges touched the missing node
  });
});

describe('buildChainCanvas — edges', () => {
  it('keys an edge on its live backing connection, falling back to the child member', () => {
    const members = [
      member('1', null),
      member('2', '1', { viaConnectionId: 'c77' }),
      member('3', '1', { viaConnectionId: 'c-dead' }),
      member('4', '1'), // via unknown
    ];
    const model = buildChainCanvas({
      chainId: '1',
      chains: [chain('1')],
      members,
      systems: members.map((m) => system(m.mapSystemId)),
      liveConnectionIds: new Set(['c77']),
      params: P,
      orientation: 'root-top',
    });

    const byTarget = new Map(model.edges.map((e) => [e.targetNodeId, e]));
    expect(byTarget.get('1:s2')).toEqual({
      id: 'c77',
      sourceNodeId: '1:s1',
      targetNodeId: '1:s2',
      connectionId: 'c77',
    });
    expect(byTarget.get('1:s3')).toEqual({
      id: 'chainedge:3',
      sourceNodeId: '1:s1',
      targetNodeId: '1:s3',
      connectionId: null,
    });
    expect(byTarget.get('1:s4')).toEqual({
      id: 'chainedge:4',
      sourceNodeId: '1:s1',
      targetNodeId: '1:s4',
      connectionId: null,
    });
  });
});

describe('buildChainCanvas — pointer leaves', () => {
  it('derives a loop pointer without colliding with the real occurrence of the same system', () => {
    const members = [
      member('1', null),
      member('2', '1'),
      // Loop: member 3 points back at s1, which really occurs as member 1.
      member('3', '2', { mapSystemId: 's1', pointerChainId: '1', viaConnectionId: 'c9' }),
    ];
    const model = buildChainCanvas({
      chainId: '1',
      chains: [chain('1')],
      members,
      systems: [system('s1', { alias: ' Home Hole ' }), system('s2')],
      liveConnectionIds: new Set(['c9']),
      params: P,
      orientation: 'root-top',
    });

    expect(model.occurrences.map((o) => o.id)).toEqual(['1:s1', '1:s2']);
    expect(model.pointers).toHaveLength(1);
    const pointer = model.pointers[0]!;
    expect(pointer.id).toBe(chainPointerNodeId('3'));
    expect(pointer.isLoop).toBe(true);
    expect(pointer.targetChainId).toBe('1');
    expect(pointer.targetMapSystemId).toBe('s1');
    // Alias wins over the raw name (trimmed).
    expect(pointer.targetSystemName).toBe('Home Hole');
    // The pointer edge rides the live connection id.
    expect(model.edges.find((e) => e.targetNodeId === pointer.id)?.id).toBe('c9');
  });

  it('resolves a cross-chain pointer name from the visible chains, null when foreign', () => {
    const members = [
      member('1', null),
      member('2', '1', { mapSystemId: 's9', pointerChainId: '2' }),
      member('3', '1', { mapSystemId: 's10', pointerChainId: '404' }),
    ];
    const model = buildChainCanvas({
      chainId: '1',
      chains: [chain('1'), chain('2', { name: 'Thera' })],
      members,
      systems: [system('s1')], // pointer targets hidden — pills survive with id fallback
      liveConnectionIds: new Set(),
      params: P,
      orientation: 'root-top',
    });

    const toThera = model.pointers.find((p) => p.targetChainId === '2')!;
    expect(toThera.isLoop).toBe(false);
    expect(toThera.targetChainName).toBe('Thera');
    expect(toThera.targetSystemName).toBe('s9');

    const foreign = model.pointers.find((p) => p.targetChainId === '404')!;
    expect(foreign.targetChainName).toBeNull();
  });
});

describe('buildChainCanvas — orientation passthrough', () => {
  it('transposes positions under root-left exactly like the layout engine', () => {
    const members = [member('1', null), member('2', '1')];
    const systems = members.map((m) => system(m.mapSystemId));
    const top = buildChainCanvas({
      chainId: '1',
      chains: [chain('1')],
      members,
      systems,
      liveConnectionIds: new Set(),
      params: P,
      orientation: 'root-top',
    });
    const left = buildChainCanvas({
      chainId: '1',
      chains: [chain('1')],
      members,
      systems,
      liveConnectionIds: new Set(),
      params: P,
      orientation: 'root-left',
    });
    for (const o of top.occurrences) {
      const mirrored = left.occurrences.find((m) => m.memberId === o.memberId)!;
      expect({ x: mirrored.x, y: mirrored.y }).toEqual({ x: o.y, y: o.x });
    }
    expect(left.width).toBe(top.height);
    expect(left.height).toBe(top.width);
  });
});

describe('sortChainsForTabs', () => {
  it('orders shared before personal, each by creation (id) order, never by name/size', () => {
    const chains = [
      chain('12', { kind: 'personal', ownerCharacterId: 9, name: 'A' }),
      chain('3', { name: 'Zed' }),
      chain('101', { name: 'Alpha' }),
      chain('2', { kind: 'personal', ownerCharacterId: 9, name: 'Q' }),
    ];
    expect(sortChainsForTabs(chains).map((c) => c.id)).toEqual(['3', '101', '2', '12']);
  });
});
