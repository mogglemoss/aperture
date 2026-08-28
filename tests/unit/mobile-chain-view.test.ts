import { describe, expect, it } from 'vitest';
import {
  MOBILE_CHAIN_TILE_PARAMS,
  buildMobileChainCards,
  isMobileChainView,
} from '@/lib/map/chains/mobile';
import { buildChainBlobContent } from '@/lib/map/chains/view';
import { formatChainBlobLine } from '@/lib/map/chains/collapse';
import type { MapChain, MapChainMember, MapSystemNode } from '@/types';

// Pure checks for the Stage 8a mobile chain view: the phone-breakpoint gate
// decision, the touch-sized layout params, and the drawer card derivation.
// No DB, no rendering.

const ALL = 'all'; // ChainTabStrip's ALL_CHAINS_TAB sentinel (component import avoided here)

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

describe('isMobileChainView — the breakpoint gate', () => {
  it('never gates on the free canvas: phone width + null keeps the stacked dashboard', () => {
    expect(isMobileChainView(null, true)).toBe(false);
  });

  it('gates on a chain tab and on the All sentinel at phone width', () => {
    expect(isMobileChainView('7', true)).toBe(true);
    expect(isMobileChainView(ALL, true)).toBe(true);
  });

  it('never gates on a desktop-width viewport', () => {
    expect(isMobileChainView('7', false)).toBe(false);
    expect(isMobileChainView(ALL, false)).toBe(false);
    expect(isMobileChainView(null, false)).toBe(false);
  });
});

describe('MOBILE_CHAIN_TILE_PARAMS — touch-sized layout inputs', () => {
  it('meets the 44px touch floor on gaps and the pointer pill depth extent', () => {
    expect(MOBILE_CHAIN_TILE_PARAMS.gapX).toBeGreaterThanOrEqual(44);
    expect(MOBILE_CHAIN_TILE_PARAMS.gapY).toBeGreaterThanOrEqual(44);
    expect(
      MOBILE_CHAIN_TILE_PARAMS.pointerH ?? MOBILE_CHAIN_TILE_PARAMS.nodeH,
    ).toBeGreaterThanOrEqual(44);
    expect(MOBILE_CHAIN_TILE_PARAMS.nodeH).toBeGreaterThanOrEqual(44);
  });
});

describe('buildMobileChainCards — drawer card derivation', () => {
  it('emits one card per chain in the given (tab) order with the blob summary line', () => {
    const chains = [chain('2', { name: 'Thera' }), chain('1', { kind: 'personal', ownerCharacterId: 9 })];
    const members = [
      member('10', null, { chainId: '2', mapSystemId: 'k1' }),
      member('11', '10', { chainId: '2', mapSystemId: 's11' }),
      member('20', null, { chainId: '1', mapSystemId: 's20' }),
    ];
    const systems = [system('k1', { security: 'H' }), system('s11'), system('s20')];

    const cards = buildMobileChainCards({
      chains,
      members,
      systems,
      criticalConnectionIds: new Set(),
    });

    expect(cards.map((c) => c.chainId)).toEqual(['2', '1']); // order preserved, never re-sorted
    expect(cards[0]).toMatchObject({
      name: 'Thera',
      kind: 'shared',
      systemCount: 2,
      summaryLine: '2 systems · 1 HS',
    });
    expect(cards[1]).toMatchObject({ kind: 'personal', systemCount: 1, summaryLine: '1 system' });

    // The summary is the exact blob line — the card and the forest blob agree.
    const blob = buildChainBlobContent({
      chain: chains[0]!,
      members,
      systems,
      criticalConnectionIds: new Set(),
    });
    expect(cards[0]!.summaryLine).toBe(formatChainBlobLine(blob));
  });

  it('counts real members only and keeps an empty chain as a "0 systems" card', () => {
    const chains = [chain('1'), chain('9', { name: 'Empty' })];
    const members = [
      member('1', null),
      // Pointer-leaf: excluded from the count.
      member('2', '1', { mapSystemId: 's9', pointerChainId: '2' }),
      // Foreign chain: ignored entirely.
      member('3', null, { chainId: '404', mapSystemId: 's3' }),
    ];
    const cards = buildMobileChainCards({
      chains,
      members,
      systems: [system('s1'), system('s3')],
      criticalConnectionIds: new Set(),
    });
    expect(cards.map((c) => [c.chainId, c.systemCount])).toEqual([
      ['1', 1],
      ['9', 0],
    ]);
    expect(cards[1]!.summaryLine).toBe('0 systems');
  });

  it('carries rally and EOL-critical flags', () => {
    const cards = buildMobileChainCards({
      chains: [chain('1')],
      members: [member('1', null), member('2', '1', { viaConnectionId: 'c7' })],
      systems: [system('s1', { rallyAt: '2026-08-27T00:00:00.000Z' }), system('s2')],
      criticalConnectionIds: new Set(['c7']),
    });
    expect(cards[0]).toMatchObject({ hasRally: true, hasEolCritical: true });
  });
});
