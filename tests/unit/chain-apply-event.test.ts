import { describe, expect, it } from 'vitest';
import { applyEvent } from '@/lib/map/applyEvent';
import type { MapChain, MapChainMember, MapViewData } from '@/types';
import type { MapEventPayload } from '@/lib/realtime/protocol';

// Pure reducer checks for the nomadic-chains `chain.*` events plus the two
// server-side prunes the reducer mirrors without an event of their own
// (membership prune on system.removed, via SET NULL on connection.delete).

const makeState = (overrides?: Partial<MapViewData>): MapViewData => ({
  map: { id: '1', name: 'Test Map', scope: 'wh', type: 'corp', tagScheme: 'none', homeMapSystemId: null },
  systems: [],
  connections: [],
  signatures: [],
  notes: [],
  chains: [],
  chainMembers: [],
  presence: [],
  ...overrides,
});

const chainA: MapChain = {
  id: '1',
  name: 'Alpha',
  kind: 'personal',
  ownerCharacterId: 90000001,
  createdAt: '2026-08-27T00:00:00.000Z',
  updatedAt: '2026-08-27T00:00:00.000Z',
};

const chainB: MapChain = { ...chainA, id: '2', name: 'Bravo', kind: 'shared', ownerCharacterId: null };

const member = (over: Partial<MapChainMember> & Pick<MapChainMember, 'id'>): MapChainMember => ({
  chainId: '1',
  mapSystemId: '10',
  parentMemberId: null,
  viaConnectionId: null,
  pointerChainId: null,
  ...over,
});

describe('applyEvent — chain events', () => {
  it('chain.created appends, and replaces on re-delivery', () => {
    const created: MapEventPayload = {
      kind: 'chain.created',
      eventId: 1,
      id: '1',
      name: 'Alpha',
      chainKind: 'personal',
      ownerCharacterId: 90000001,
      createdAt: chainA.createdAt,
      updatedAt: chainA.updatedAt,
    };
    const next = applyEvent(makeState(), created);
    expect(next.chains).toEqual([chainA]);
    // Re-delivery replaces by id — no duplicate tab.
    const again = applyEvent(next, { ...created, eventId: 2, name: 'Alpha 2' });
    expect(again.chains).toHaveLength(1);
    expect(again.chains[0]!.name).toBe('Alpha 2');
  });

  it('chain.renamed merges name + updatedAt into the matching chain only', () => {
    const state = makeState({ chains: [chainA, chainB] });
    const next = applyEvent(state, {
      kind: 'chain.renamed',
      eventId: 3,
      id: '1',
      name: 'Scouts',
      updatedAt: '2026-08-27T01:00:00.000Z',
    });
    expect(next.chains[0]).toMatchObject({ id: '1', name: 'Scouts', updatedAt: '2026-08-27T01:00:00.000Z' });
    expect(next.chains[1]).toEqual(chainB);
  });

  it('chain.deleted drops the chain + its members and degrades pointer-leaves naming it', () => {
    const state = makeState({
      chains: [chainA, chainB],
      chainMembers: [
        member({ id: '100', chainId: '1' }),
        member({ id: '101', chainId: '1', parentMemberId: '100' }),
        member({ id: '200', chainId: '2', mapSystemId: '20' }),
        // chain B's pointer-leaf continuing into chain A.
        member({ id: '201', chainId: '2', mapSystemId: '10', parentMemberId: '200', pointerChainId: '1' }),
      ],
    });
    const next = applyEvent(state, { kind: 'chain.deleted', eventId: 4, id: '1', name: 'Alpha' });
    expect(next.chains).toEqual([chainB]);
    expect(next.chainMembers.map((m) => m.id)).toEqual(['200', '201']);
    expect(next.chainMembers[1]!.pointerChainId).toBeNull();
  });

  it('chain.member.added upserts by id (append, then replace on the via backfill)', () => {
    const added: MapEventPayload = {
      kind: 'chain.member.added',
      eventId: 5,
      id: '100',
      chainId: '1',
      mapSystemId: '10',
      parentMemberId: null,
      viaConnectionId: null,
      pointerChainId: null,
      chainName: 'Alpha',
      pointerChainName: null,
    };
    const next = applyEvent(makeState({ chains: [chainA] }), added);
    expect(next.chainMembers).toEqual([member({ id: '100' })]);
    const backfilled = applyEvent(next, { ...added, eventId: 6, viaConnectionId: '77' });
    expect(backfilled.chainMembers).toHaveLength(1);
    expect(backfilled.chainMembers[0]!.viaConnectionId).toBe('77');
  });

  it('system.removed prunes the system\'s members plus their descendant closure', () => {
    const state = makeState({
      chains: [chainA, chainB],
      chainMembers: [
        member({ id: '100', mapSystemId: '10' }),
        member({ id: '101', mapSystemId: '11', parentMemberId: '100' }),
        member({ id: '102', mapSystemId: '12', parentMemberId: '101' }),
        // Pointer-leaf under the doomed branch — goes with its parent.
        member({ id: '103', mapSystemId: '10', parentMemberId: '102', pointerChainId: '1' }),
        // Another chain's member of the removed system — pruned directly.
        member({ id: '200', chainId: '2', mapSystemId: '11' }),
        // Unrelated member in the other chain — survives.
        member({ id: '201', chainId: '2', mapSystemId: '12' }),
      ],
    });
    const next = applyEvent(state, { kind: 'system.removed', eventId: 7, id: '11' });
    expect(next.chainMembers.map((m) => m.id)).toEqual(['100', '201']);
  });

  it('connection.delete nulls viaConnectionId on members that traversed it', () => {
    const state = makeState({
      chains: [chainA],
      chainMembers: [
        member({ id: '100' }),
        member({ id: '101', mapSystemId: '11', parentMemberId: '100', viaConnectionId: '77' }),
      ],
    });
    const next = applyEvent(state, { kind: 'connection.delete', eventId: 8, id: '77' });
    expect(next.chainMembers[1]!.viaConnectionId).toBeNull();
    expect(next.chainMembers).toHaveLength(2);
  });
});
