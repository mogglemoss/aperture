import { describe, expect, it } from 'vitest';
import {
  buildChainBlobContent,
  buildForestCanvas,
} from '@/lib/map/chains/view';
import { CHAIN_BLOB_ZOOM_CUTOFF, formatChainBlobLine } from '@/lib/map/chains/collapse';
import { layoutForest, type ChainLayoutParams } from '@/lib/map/chains/layout';
import type { MapChain, MapChainMember, MapSystemNode } from '@/types';

// Pure checks for the Stage 5 All-view forest derivation (blob content from
// real map data + the forest canvas model) and the 1000-system / 30-chain
// scale fixture. No DB, no rendering.

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

const noCollapse = {
  zoom: 1,
  threshold: 1000,
  expandedChainIds: new Set<string>(),
};

describe('buildChainBlobContent', () => {
  it('counts real occurrences only and groups k-space exits by display class, HS/LS/NS first', () => {
    const members = [
      member('1', null, { mapSystemId: 'k1' }),
      member('2', '1', { mapSystemId: 'j1' }),
      member('3', '1', { mapSystemId: 'k2' }),
      member('4', '3', { mapSystemId: 'k3' }),
      member('5', '4', { mapSystemId: 'p1' }),
      // Pointer-leaf: excluded from the count and never an exit.
      member('6', '2', { mapSystemId: 'k4', pointerChainId: '9' }),
      // Foreign chain: ignored entirely.
      member('7', null, { chainId: '2', mapSystemId: 'k4' }),
    ];
    const systems = [
      system('k1', { security: 'H' }),
      system('j1', { security: 'C5' }),
      system('k2', { security: 'L' }),
      system('k3', { security: '0.0' }),
      system('p1', { security: 'P' }),
      system('k4', { security: 'H' }),
    ];
    const content = buildChainBlobContent({
      chain: chain('1', { name: 'Thera' }),
      members,
      systems,
      criticalConnectionIds: new Set(),
    });

    expect(content.systemCount).toBe(5);
    expect(content.exits).toEqual([
      { securityClass: 'HS', count: 1 },
      { securityClass: 'LS', count: 1 },
      { securityClass: 'NS', count: 1 },
      { securityClass: 'P', count: 1 },
    ]);
    expect(content.hasRally).toBe(false);
    expect(content.hasEolCritical).toBe(false);
    expect(formatChainBlobLine(content)).toBe('5 systems · 1 HS · 1 LS · 1 NS · 1 P');
  });

  it('sets hasRally from member systems and hasEolCritical from inbound vias (pointer-leaf vias included)', () => {
    const members = [
      member('1', null),
      member('2', '1', { viaConnectionId: 'c1' }),
      member('3', '2', { viaConnectionId: 'c2', pointerChainId: '9', mapSystemId: 'sX' }),
    ];
    const systems = [system('s1'), system('s2', { rallyAt: '2026-08-27T12:00:00.000Z' })];

    const rally = buildChainBlobContent({
      chain: chain('1'),
      members,
      systems,
      criticalConnectionIds: new Set(),
    });
    expect(rally.hasRally).toBe(true);
    expect(rally.hasEolCritical).toBe(false);

    const viaPointerCritical = buildChainBlobContent({
      chain: chain('1'),
      members,
      systems,
      criticalConnectionIds: new Set(['c2']),
    });
    expect(viaPointerCritical.hasEolCritical).toBe(true);

    // A rallied system that is NOT a member never flags the chain.
    const foreignRally = buildChainBlobContent({
      chain: chain('1'),
      members: [member('1', null)],
      systems: [system('s1'), system('s9', { rallyAt: '2026-08-27T12:00:00.000Z' })],
      criticalConnectionIds: new Set(),
    });
    expect(foreignRally.hasRally).toBe(false);
  });
});

describe('buildForestCanvas — blocks, offsets, unassigned', () => {
  it('offsets expanded-chain nodes by their shelf block position and captions each block', () => {
    const chains = [chain('1'), chain('2')];
    const members = [
      member('1', null, { chainId: '1', mapSystemId: 'a1' }),
      member('2', '1', { chainId: '1', mapSystemId: 'a2' }),
      member('3', null, { chainId: '2', mapSystemId: 'b1' }),
    ];
    const systems = [system('a1'), system('a2'), system('b1'), system('u1')];
    const model = buildForestCanvas({
      chains,
      members,
      systems,
      liveConnectionIds: new Set(),
      criticalConnectionIds: new Set(),
      ...noCollapse,
      params: P,
      orientation: 'root-top',
      viewportWidth: 10_000,
    });

    const forest = layoutForest({
      chains,
      members,
      unassignedSystemIds: ['u1'],
      params: P,
      orientation: 'root-top',
      viewportWidth: 10_000,
    });
    const blockByChain = new Map(
      forest.blocks.flatMap((b) => (b.kind === 'chain' ? [[b.chainId, b] as const] : [])),
    );

    // Chain 2's root sits at its block offset, not at the origin.
    const b2 = blockByChain.get('2')!;
    const rootB1 = model.occurrences.find((o) => o.id === '2:b1')!;
    expect(rootB1.x).toBe(b2.x + b2.nodes[0]!.x);
    expect(rootB1.y).toBe(b2.y + b2.nodes[0]!.y);

    // One caption per expanded block plus the Unassigned caption.
    expect(model.labels.map((l) => l.label).sort()).toEqual([
      'Chain 1',
      'Chain 2',
      'Unassigned',
    ]);
    expect(model.blobs).toEqual([]);

    // The chainless system rides the Unassigned block.
    expect(model.unassigned.map((t) => t.mapSystemId)).toEqual(['u1']);
    const unassignedBlock = forest.blocks.find((b) => b.kind === 'unassigned')!;
    expect(model.unassigned[0]!.x).toBe(unassignedBlock.x);
  });

  it('collapses a chain past the threshold into a blob at the block footprint, expandable above the cutoff', () => {
    const chains = [chain('1'), chain('2')];
    const members = [
      member('1', null, { chainId: '1', mapSystemId: 'a1' }),
      member('2', '1', { chainId: '1', mapSystemId: 'a2' }),
      member('3', '1', { chainId: '1', mapSystemId: 'a3' }),
      member('4', null, { chainId: '2', mapSystemId: 'b1' }),
    ];
    const systems = ['a1', 'a2', 'a3', 'b1'].map((id) => system(id));
    const model = buildForestCanvas({
      chains,
      members,
      systems,
      liveConnectionIds: new Set(),
      criticalConnectionIds: new Set(),
      zoom: 1,
      threshold: 2,
      expandedChainIds: new Set(),
      params: P,
      orientation: 'root-top',
      viewportWidth: 10_000,
    });

    expect(model.blobs.map((b) => b.chainId)).toEqual(['1']);
    const blob = model.blobs[0]!;
    expect(blob.expandable).toBe(true);
    expect(blob.content.systemCount).toBe(3);
    // Blobbed chain renders no tiles/edges; the small chain still does.
    expect(model.occurrences.map((o) => o.id)).toEqual(['2:b1']);
    // No caption for a blobbed chain (the blob carries the name).
    expect(model.labels.map((l) => l.label).sort()).toEqual(['Chain 2']);
    // Blob footprint = the full tree block (two siblings wide), min one tile.
    expect(blob.width).toBe(2 * P.nodeW + P.gapX);
  });

  it('session expansion override wins above the cutoff and is ignored below it', () => {
    const chains = [chain('1')];
    const members = [
      member('1', null, { mapSystemId: 'a1' }),
      member('2', '1', { mapSystemId: 'a2' }),
    ];
    const systems = [system('a1'), system('a2')];
    const base = {
      chains,
      members,
      systems,
      liveConnectionIds: new Set<string>(),
      criticalConnectionIds: new Set<string>(),
      threshold: 1,
      params: P,
      orientation: 'root-top' as const,
      viewportWidth: 10_000,
    };

    const expanded = buildForestCanvas({
      ...base,
      zoom: 1,
      expandedChainIds: new Set(['1']),
    });
    expect(expanded.blobs).toEqual([]);
    expect(expanded.occurrences).toHaveLength(2);
    // The caption offers re-collapse (expanded only because of the override).
    expect(expanded.labels[0]!.collapsible).toBe(true);

    const zoomedOut = buildForestCanvas({
      ...base,
      zoom: CHAIN_BLOB_ZOOM_CUTOFF - 0.01,
      expandedChainIds: new Set(['1']),
    });
    expect(zoomedOut.blobs.map((b) => b.chainId)).toEqual(['1']);
    expect(zoomedOut.blobs[0]!.expandable).toBe(false);
    expect(zoomedOut.occurrences).toEqual([]);
  });

  it('skips empty chains and keeps forest edge ids unique when one connection backs links in two chains', () => {
    const chains = [chain('1'), chain('2'), chain('3', { name: 'Empty' })];
    const members = [
      // Chain 1: a1 -> a2 via c1.
      member('1', null, { chainId: '1', mapSystemId: 'a1' }),
      member('2', '1', { chainId: '1', mapSystemId: 'a2', viaConnectionId: 'c1' }),
      // Chain 2: same systems, same via — a2 is already chained, so a pointer.
      member('3', null, { chainId: '2', mapSystemId: 'a1' }),
      member('4', '3', {
        chainId: '2',
        mapSystemId: 'a2',
        viaConnectionId: 'c1',
        pointerChainId: '1',
      }),
    ];
    const systems = [system('a1'), system('a2')];
    const model = buildForestCanvas({
      chains,
      members,
      systems,
      liveConnectionIds: new Set(['c1']),
      criticalConnectionIds: new Set(),
      ...noCollapse,
      params: P,
      orientation: 'root-top',
      viewportWidth: 10_000,
    });

    // Member-keyed ids, unique across the forest; canonical id on the data.
    expect(model.edges.map((e) => e.id).sort()).toEqual(['chainedge:2', 'chainedge:4']);
    expect(new Set(model.edges.map((e) => e.id)).size).toBe(model.edges.length);
    expect(model.edges.every((e) => e.connectionId === 'c1')).toBe(true);

    // The empty chain contributes nothing (no blob, no caption).
    expect(model.blobs.find((b) => b.chainId === '3')).toBeUndefined();
    expect(model.labels.find((l) => l.label === 'Empty')).toBeUndefined();
  });
});

describe('forest scale fixture — 1000 systems / 30 chains', () => {
  // 30 chains of 33 systems (990) + 10 unassigned = 1000 systems. Each tree is
  // a k-space root fanning into 4 branches of depth 8 — Wingspan-shaped.
  function buildFixture() {
    const chains: MapChain[] = [];
    const members: MapChainMember[] = [];
    const systems: MapSystemNode[] = [];
    let memberId = 1;
    for (let c = 1; c <= 30; c++) {
      chains.push(
        chain(String(c), {
          kind: c <= 10 ? 'shared' : 'personal',
          ownerCharacterId: c <= 10 ? null : 42,
        }),
      );
      const rootId = String(memberId++);
      members.push(member(rootId, null, { chainId: String(c), mapSystemId: `s${rootId}` }));
      systems.push(system(`s${rootId}`, { security: 'H' }));
      const previousByBranch: string[] = [rootId, rootId, rootId, rootId];
      for (let depth = 1; depth <= 8; depth++) {
        for (let branch = 0; branch < 4; branch++) {
          const id = String(memberId++);
          members.push(
            member(id, previousByBranch[branch]!, {
              chainId: String(c),
              mapSystemId: `s${id}`,
              viaConnectionId: `via${id}`,
            }),
          );
          systems.push(system(`s${id}`, { security: 'C4' }));
          previousByBranch[branch] = id;
        }
      }
    }
    for (let u = 0; u < 10; u++) systems.push(system(`u${u}`));
    return { chains, members, systems };
  }

  it('lays out and derives the full forest quickly at both LOD extremes', () => {
    const { chains, members, systems } = buildFixture();
    expect(systems.length).toBe(1000);
    expect(chains.length).toBe(30);

    const base = {
      chains,
      members,
      systems,
      liveConnectionIds: new Set(members.flatMap((m) => (m.viaConnectionId ? [m.viaConnectionId] : []))),
      criticalConnectionIds: new Set<string>(),
      params: P,
      orientation: 'root-top' as const,
      viewportWidth: 2000,
    };

    // Full tiles at high zoom (threshold above every chain size).
    const t0 = performance.now();
    const expanded = buildForestCanvas({
      ...base,
      zoom: 1,
      threshold: 1000,
      expandedChainIds: new Set<string>(),
    });
    const expandedMs = performance.now() - t0;
    expect(expanded.occurrences.length).toBe(990);
    expect(expanded.unassigned.length).toBe(10);
    expect(expanded.edges.length).toBe(960);
    expect(expanded.blobs).toEqual([]);

    // Blobs at low zoom: 30 blobs, zero tiles except the unassigned grid.
    const t1 = performance.now();
    const blobbed = buildForestCanvas({
      ...base,
      zoom: 0.1,
      threshold: 15,
      expandedChainIds: new Set<string>(),
    });
    const blobbedMs = performance.now() - t1;
    expect(blobbed.blobs.length).toBe(30);
    expect(blobbed.occurrences).toEqual([]);
    expect(blobbed.edges).toEqual([]);
    expect(blobbed.unassigned.length).toBe(10);

    // Zoom/override changes never re-pack the shelf: identical geometry.
    const blobByChain = new Map(blobbed.blobs.map((b) => [b.chainId, b]));
    const forest = layoutForest({
      chains,
      members,
      unassignedSystemIds: systems.slice(990).map((s) => s.id),
      params: P,
      orientation: 'root-top',
      viewportWidth: 2000,
    });
    for (const block of forest.blocks) {
      if (block.kind !== 'chain') continue;
      const blob = blobByChain.get(block.chainId)!;
      expect(blob.x).toBe(block.x);
      expect(blob.y).toBe(block.y);
    }

    // Derivation stays interactive-fast at this scale (loose bound — CI noise).
    expect(expandedMs).toBeLessThan(250);
    expect(blobbedMs).toBeLessThan(250);
  });
});
