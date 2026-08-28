// @vitest-environment node
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { and, eq, inArray, like, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, pool } from '@/db/client';
import {
  apCharacter,
  apMap,
  apMapChain,
  apMapChainMember,
  apMapConnection,
  apMapSystem,
  apUser,
  universeConstellation,
  universeRegion,
  universeSystem,
} from '@/db/schema';
import { createChainWithSeed } from '@/lib/map/mutations/chains';
import {
  createConnection,
  createConnectionWithChainMembership,
} from '@/lib/map/mutations/connections';
import { addSystem, addSystemWithStargateLinks } from '@/lib/map/mutations/systems';
import { mapEventPayloadSchema } from '@/lib/realtime/protocol';
import type { MapEventPayload } from '@/lib/realtime/protocol';

/**
 * DB-gated like the rest:
 *   docker compose up -d && pnpm db:migrate && RUN_DB_TESTS=1 pnpm test
 *
 * Nomadic-chains Stage 9 — seed on anchor + universal fan-out:
 * wormhole-only seed traversal (gates and dormant holes never walked),
 * creation-order parentage with the stored-direction loop rule, cross-chain
 * pointer-leaves as terminal, first-root-add seeding, manual-charting fan-out
 * parity with the tracked-jump (Stage 2b) semantics incl. foreign-personal
 * exclusion and chain-id ordering, the non-wh no-op, and the event-batching
 * bound (N small per-member events, each far under the 8 KB pg_notify
 * ceiling — never one payload scaling with subtree size).
 *
 * Fixture id range claimed by this suite: universe 98052xxx, corp/characters 99064xxx.
 */
const run = process.env.RUN_DB_TESTS === '1';

const REGION = 98052001;
const CONSTELLATION = 98052001;

// Test 1 — wormhole-only traversal.
const K1 = 98052011; // k-space anchor
const K2 = 98052012; // gate neighbour of K1 — must not seed
const J1 = 98052013;
const J2 = 98052014;
const K3 = 98052015; // k-space exit leaf
const J4 = 98052016; // wh-linked beyond the k-space exit — still seeds (scope rule, not system class)
const J5 = 98052017; // behind a dormant hole — must not seed

// Test 2 — creation-order + loop.
const LA = 98052021;
const LB = 98052022;
const LC = 98052023;

// Test 3/4 — cross-chain pointer.
const XW = 98052031;
const XX = 98052032;
const XY = 98052033;

// Tests 6/7 — fan-out parity.
const FF = 98052041; // the from-system every chain holds
const FN = 98052042; // the newly charted system
const FG = 98052043; // gate-scope target

// Test 8 — batching bound (30-system linear chain).
const BATCH_BASE = 98052100;
const BATCH_COUNT = 30;

const ALL_SYSTEMS = [
  K1, K2, J1, J2, K3, J4, J5,
  LA, LB, LC,
  XW, XX, XY,
  FF, FN, FG,
  ...Array.from({ length: BATCH_COUNT }, (_, i) => BATCH_BASE + i),
];

const CORP = 99064900n;
const ACTOR = 99064001n; // the charting character
const ALLY = 99064002n; // another corp member; owns the foreign personal chain

let userId = 0;

type Member = {
  id: bigint;
  chainId: bigint;
  mapSystemId: bigint;
  parentMemberId: bigint | null;
  viaConnectionId: bigint | null;
  pointerChainId: bigint | null;
};

describe.skipIf(!run)('nomadic chains — seed on anchor + universal fan-out (real Postgres)', () => {
  beforeAll(async () => {
    await migrate(db, { migrationsFolder: 'src/db/migrations' });
    await cleanup();

    await db.insert(universeRegion).values({ id: REGION, name: 'Seed Test Region' });
    await db
      .insert(universeConstellation)
      .values({ id: CONSTELLATION, regionId: REGION, name: 'Seed Test Const' });
    await db.insert(universeSystem).values(
      ALL_SYSTEMS.map((id, i) => ({
        id,
        constellationId: CONSTELLATION,
        name: [K1, K2, K3].includes(id) ? `Seed-K${id % 100}` : `J${id % 1000000}`,
        security: [K1, K2, K3].includes(id) ? '0.5' : `C${(i % 5) + 1}`,
      })),
    );

    const [u] = await db.insert(apUser).values({}).returning({ id: apUser.id });
    userId = u!.id;
    await db.insert(apCharacter).values([mkChar(ACTOR, 'Seed Actor'), mkChar(ALLY, 'Seed Ally')]);
  });

  afterAll(async () => {
    await cleanup();
    await pool.end();
  });

  it('seed walks wormholes only: gates, dormant holes never traverse; parentage follows creation order', async () => {
    const mapId = await mkMap('Chain Seed Test 1');
    const ms = await placeSystems(mapId, [K1, K2, J1, J2, K3, J4, J5]);

    // Charting order (connection id order) — the parentage the seed must rebuild.
    const c1 = await link(mapId, ms[K1]!, ms[J1]!, 'wh');
    await link(mapId, ms[K1]!, ms[K2]!, 'stargate'); // gate — never walked
    const c3 = await link(mapId, ms[J1]!, ms[J2]!, 'wh');
    const c4 = await link(mapId, ms[J2]!, ms[K3]!, 'wh');
    const c5 = await link(mapId, ms[K3]!, ms[J4]!, 'wh');
    const dormant = await link(mapId, ms[J1]!, ms[J5]!, 'wh');
    await db
      .update(apMapConnection)
      .set({ confirmedAt: null })
      .where(eq(apMapConnection.id, dormant));

    const before = await eventCount(mapId);
    const created = await createChainWithSeed({
      mapId,
      characterId: ACTOR,
      name: 'Seed-K11',
      kind: 'personal',
      canManage: false,
      anchorMapSystemId: ms[K1]!,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    // chain.created + root + 4 adopted members, each its own small event.
    expect(created.data.payloads.map((p) => p.kind)).toEqual([
      'chain.created',
      ...Array<string>(5).fill('chain.member.added'),
    ]);
    for (const p of created.data.payloads) {
      expect(() => mapEventPayloadSchema.parse(p)).not.toThrow();
    }
    expect(await eventCount(mapId)).toBe(before + 6);

    const members = await membersOf(chainIdOf(created.data.payloads));
    const bySystem = new Map(members.map((m) => [m.mapSystemId, m]));
    expect(members).toHaveLength(5);

    const root = bySystem.get(ms[K1]!)!;
    expect(root).toMatchObject({ parentMemberId: null, viaConnectionId: null, pointerChainId: null });
    expect(bySystem.get(ms[J1]!)).toMatchObject({ parentMemberId: root.id, viaConnectionId: c1 });
    expect(bySystem.get(ms[J2]!)).toMatchObject({
      parentMemberId: bySystem.get(ms[J1]!)!.id,
      viaConnectionId: c3,
    });
    expect(bySystem.get(ms[K3]!)).toMatchObject({
      parentMemberId: bySystem.get(ms[J2]!)!.id,
      viaConnectionId: c4,
    });
    // The walk continues through a k-space member over a *wh* link (the stop
    // rule is link scope, not system class — live charting behaves the same).
    expect(bySystem.get(ms[J4]!)).toMatchObject({
      parentMemberId: bySystem.get(ms[K3]!)!.id,
      viaConnectionId: c5,
    });
    // Gate neighbour and the system behind the dormant hole never seed.
    expect(bySystem.has(ms[K2]!)).toBe(false);
    expect(bySystem.has(ms[J5]!)).toBe(false);
  });

  it('seed replays charting order: a later cross-link becomes a loop pointer-leaf under its stored source', async () => {
    const mapId = await mkMap('Chain Seed Test 2');
    const ms = await placeSystems(mapId, [LA, LB, LC]);
    const c1 = await link(mapId, ms[LA]!, ms[LB]!, 'wh');
    const c2 = await link(mapId, ms[LB]!, ms[LC]!, 'wh');
    const c3 = await link(mapId, ms[LA]!, ms[LC]!, 'wh'); // charted last, from A

    const created = await createChainWithSeed({
      mapId,
      characterId: ACTOR,
      name: 'Loop',
      kind: 'personal',
      canManage: false,
      anchorMapSystemId: ms[LA]!,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const chainId = chainIdOf(created.data.payloads);

    const members = await membersOf(chainId);
    expect(members).toHaveLength(4);
    const root = members.find((m) => m.parentMemberId === null)!;
    const b = members.find((m) => m.mapSystemId === ms[LB]! && m.pointerChainId === null)!;
    const c = members.find((m) => m.mapSystemId === ms[LC]! && m.pointerChainId === null)!;
    // C was charted from B (c2 precedes c3) — creation order decides.
    expect(b).toMatchObject({ parentMemberId: root.id, viaConnectionId: c1 });
    expect(c).toMatchObject({ parentMemberId: b.id, viaConnectionId: c2 });
    // c3 revisits C: a loop pointer-leaf hanging under c3's stored SOURCE (A).
    const loop = members.find((m) => m.pointerChainId !== null)!;
    expect(loop).toMatchObject({
      mapSystemId: ms[LC]!,
      parentMemberId: root.id,
      viaConnectionId: c3,
      pointerChainId: chainId,
    });
  });

  it('seed lands on another chain as a terminal pointer-leaf — the foreign subtree is never unfolded', async () => {
    const mapId = await mkMap('Chain Seed Test 3');
    const ms = await placeSystems(mapId, [XW, XX, XY]);
    await link(mapId, ms[XX]!, ms[XY]!, 'wh');

    const zRes = await createChainWithSeed({
      mapId,
      characterId: ACTOR,
      name: 'Zulu',
      kind: 'shared',
      canManage: true,
      anchorMapSystemId: ms[XX]!,
    });
    expect(zRes.ok).toBe(true);
    if (!zRes.ok) return;
    const zId = chainIdOf(zRes.data.payloads);
    expect(await membersOf(zId)).toHaveLength(2); // X root + Y child

    // W→X charted only after Zulu exists (a raw createConnection — no
    // fan-out), so W belongs to no chain when Papa anchors on it.
    const c2 = await link(mapId, ms[XW]!, ms[XX]!, 'wh');

    const pRes = await createChainWithSeed({
      mapId,
      characterId: ACTOR,
      name: 'Papa',
      kind: 'personal',
      canManage: false,
      anchorMapSystemId: ms[XW]!,
    });
    expect(pRes.ok).toBe(true);
    if (!pRes.ok) return;
    const pId = chainIdOf(pRes.data.payloads);

    const pMembers = await membersOf(pId);
    expect(pMembers).toHaveLength(2);
    const pRoot = pMembers.find((m) => m.parentMemberId === null)!;
    const pointer = pMembers.find((m) => m.pointerChainId !== null)!;
    expect(pointer).toMatchObject({
      mapSystemId: ms[XX]!,
      parentMemberId: pRoot.id,
      viaConnectionId: c2,
      pointerChainId: zId,
    });
    // The payload names the pointed-at chain for the pill.
    const pointerPayload = pRes.data.payloads.find(
      (p) => p.kind === 'chain.member.added' && p.pointerChainId !== null,
    );
    expect(pointerPayload).toMatchObject({ pointerChainName: 'Zulu' });
    // XY belongs to Zulu only — the pointer is terminal.
    expect(pMembers.some((m) => m.mapSystemId === ms[XY]!)).toBe(false);
  });

  it('an empty chain seeds on its first root add', async () => {
    const mapId = await mkMap('Chain Seed Test 4');
    const ms = await placeSystems(mapId, [XW, XX, XY]);
    await link(mapId, ms[XX]!, ms[XY]!, 'wh');
    await link(mapId, ms[XW]!, ms[XX]!, 'wh');
    const zRes = await createChainWithSeed({
      mapId,
      characterId: ACTOR,
      name: 'Zulu2',
      kind: 'shared',
      canManage: true,
      anchorMapSystemId: ms[XX]!,
    });
    expect(zRes.ok).toBe(true);
    if (!zRes.ok) return;
    const zId = chainIdOf(zRes.data.payloads);

    const empty = await createChainWithSeed({
      mapId,
      characterId: ACTOR,
      name: 'Blank',
      kind: 'personal',
      canManage: false,
      anchorMapSystemId: null,
    });
    expect(empty.ok).toBe(true);
    if (!empty.ok) return;
    expect(empty.data.payloads.map((p) => p.kind)).toEqual(['chain.created']);
    const blankId = chainIdOf(empty.data.payloads);
    expect(await membersOf(blankId)).toHaveLength(0);

    // First root add (the chain gains its anchor) runs the same seed walk.
    const rooted = await addSystemWithStargateLinks({
      mapId,
      systemId: XW,
      characterId: ACTOR,
      chain: { chainId: blankId, parentMemberId: null },
    });
    expect(rooted.ok).toBe(true);
    if (!rooted.ok) return;
    expect(rooted.data.payloads.map((p) => p.kind)).toEqual([
      'system.added',
      'chain.member.added',
      'chain.member.added',
    ]);
    const members = await membersOf(blankId);
    expect(members).toHaveLength(2);
    expect(members.find((m) => m.pointerChainId !== null)).toMatchObject({
      mapSystemId: ms[XX]!,
      pointerChainId: zId,
    });
  });

  it('rejects an anchor that is not a visible system of this map', async () => {
    const mapId = await mkMap('Chain Seed Test 5');
    const otherMapId = await mkMap('Chain Seed Test 5b');
    const ms = await placeSystems(otherMapId, [FF]);
    const created = await createChainWithSeed({
      mapId,
      characterId: ACTOR,
      name: 'Nope',
      kind: 'personal',
      canManage: false,
      anchorMapSystemId: ms[FF]!, // a map-system row of another map
    });
    expect(created).toMatchObject({ ok: false, error: 'Anchor system not found on this map.' });
    expect(await db.select().from(apMapChain).where(eq(apMapChain.mapId, mapId))).toHaveLength(0);
  });

  it('connection draw fans out to every holder of the source: earliest chain real, later pointer, foreign personal excluded, non-wh inert', async () => {
    const mapId = await mkMap('Chain Seed Test 6');
    const ms = await placeSystems(mapId, [FF, FN, FG]);

    const sharedId = await seedChainAt(mapId, ACTOR, 'Shared6', 'shared', ms[FF]!);
    const ownId = await seedChainAt(mapId, ACTOR, 'Own6', 'personal', ms[FF]!);
    const foreignId = await seedChainAt(mapId, ALLY, 'Foreign6', 'personal', ms[FF]!);

    const drawn = await createConnectionWithChainMembership({
      mapId,
      characterId: ACTOR,
      sourceMapSystemId: ms[FF]!,
      targetMapSystemId: ms[FN]!,
      scope: 'wh',
    });
    expect(drawn.ok).toBe(true);
    if (!drawn.ok || drawn.data.kind !== 'connection.create') return;

    // Chain-id order: the earliest holder (the shared chain) accretes the real
    // occurrence; the actor's own later personal chain accretes a pointer to
    // it; the foreign personal chain accretes nothing (Stage 2b parity).
    const sharedN = (await membersOf(sharedId)).find((m) => m.mapSystemId === ms[FN]!);
    expect(sharedN).toMatchObject({
      pointerChainId: null,
      viaConnectionId: BigInt(drawn.data.id),
    });
    const ownN = (await membersOf(ownId)).find((m) => m.mapSystemId === ms[FN]!);
    expect(ownN).toMatchObject({ pointerChainId: sharedId });
    expect(await membersOf(foreignId)).toHaveLength(1); // just its root

    // A repeat draw of the same pair writes no further membership.
    const repeat = await createConnectionWithChainMembership({
      mapId,
      characterId: ACTOR,
      sourceMapSystemId: ms[FF]!,
      targetMapSystemId: ms[FN]!,
      scope: 'wh',
    });
    expect(repeat.ok).toBe(true);
    expect(await membersOf(sharedId)).toHaveLength(2);
    expect(await membersOf(ownId)).toHaveLength(2);

    // A non-wh draw from a chained system accretes no membership — gates must
    // not drag k-space into a tab.
    const gate = await createConnectionWithChainMembership({
      mapId,
      characterId: ACTOR,
      sourceMapSystemId: ms[FF]!,
      targetMapSystemId: ms[FG]!,
      scope: 'stargate',
    });
    expect(gate.ok).toBe(true);
    expect(await membersOf(sharedId)).toHaveLength(2);
    expect(await membersOf(ownId)).toHaveLength(2);
    expect(await membersOf(foreignId)).toHaveLength(1);
  });

  it('manual add fans out to every holder of the parent system — the hinted tab is not privileged', async () => {
    const mapId = await mkMap('Chain Seed Test 7');
    const ms = await placeSystems(mapId, [FF]);

    const sharedId = await seedChainAt(mapId, ACTOR, 'Shared7', 'shared', ms[FF]!);
    const ownId = await seedChainAt(mapId, ACTOR, 'Own7', 'personal', ms[FF]!);
    const foreignId = await seedChainAt(mapId, ALLY, 'Foreign7', 'personal', ms[FF]!);

    const ownParent = (await membersOf(ownId)).find((m) => m.parentMemberId === null)!;
    // Charted from the actor's PERSONAL tab — yet the earliest holder (the
    // shared chain) accretes the real occurrence and the hinted tab points at
    // it (chain-id order, Stage 2b parity; the hint is guard + from-system).
    const added = await addSystemWithStargateLinks({
      mapId,
      systemId: FN,
      characterId: ACTOR,
      chain: { chainId: ownId, parentMemberId: ownParent.id },
    });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(added.data.payloads.map((p) => p.kind)).toEqual([
      'system.added',
      'chain.member.added',
      'chain.member.added',
    ]);
    const msN = await mapSystemIdOf(mapId, FN);
    const sharedN = (await membersOf(sharedId)).find((m) => m.mapSystemId === msN);
    expect(sharedN).toMatchObject({ pointerChainId: null, viaConnectionId: null });
    const ownN = (await membersOf(ownId)).find((m) => m.mapSystemId === msN);
    expect(ownN).toMatchObject({ parentMemberId: ownParent.id, pointerChainId: sharedId });
    expect(await membersOf(foreignId)).toHaveLength(1);
  });

  // Generous timeout: the fixture charts 30 systems + 29 holes and the seed
  // replays them, all over a (possibly remote) test database.
  it('a seed of N members emits N per-member events, each far inside the pg_notify ceiling', { timeout: 120_000 }, async () => {
    const mapId = await mkMap('Chain Seed Test 8');
    const systemIds = Array.from({ length: BATCH_COUNT }, (_, i) => BATCH_BASE + i);
    const ms = await placeSystems(mapId, systemIds);
    for (let i = 0; i < BATCH_COUNT - 1; i += 1) {
      await link(mapId, ms[systemIds[i]!]!, ms[systemIds[i + 1]!]!, 'wh');
    }

    const before = await eventCount(mapId);
    const created = await createChainWithSeed({
      mapId,
      characterId: ACTOR,
      name: 'Batch',
      kind: 'personal',
      canManage: false,
      anchorMapSystemId: ms[systemIds[0]!]!,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    // One chain.created + one chain.member.added per adopted member — N small
    // events, never a payload scaling with the subtree.
    expect(created.data.payloads).toHaveLength(1 + BATCH_COUNT);
    expect(await eventCount(mapId)).toBe(before + 1 + BATCH_COUNT);
    for (const p of created.data.payloads) {
      expect(Buffer.byteLength(JSON.stringify(p), 'utf8')).toBeLessThan(8000);
    }
    expect(await membersOf(chainIdOf(created.data.payloads))).toHaveLength(BATCH_COUNT);
  });
});

function mkChar(id: bigint, name: string) {
  return {
    id,
    userId,
    name,
    ownerHash: `hash-${id.toString()}`,
    corporationId: CORP,
    isDirector: false,
    status: 'active',
  } as const;
}

async function mkMap(name: string): Promise<bigint> {
  const [map] = await db
    .insert(apMap)
    .values({ name, scope: 'wh', type: 'corp', ownerCorporationId: CORP })
    .returning({ id: apMap.id });
  return map!.id;
}

/** Add each system visible via the canonical mutation; returns EVE id → map-system id. */
async function placeSystems(
  mapId: bigint,
  systemIds: number[],
): Promise<Record<number, bigint>> {
  const out: Record<number, bigint> = {};
  for (const systemId of systemIds) {
    const res = await addSystem({ mapId, systemId, characterId: ACTOR, positionX: 0, positionY: 0 });
    if (!res.ok || res.data.kind !== 'system.added') throw new Error('fixture add failed');
    out[systemId] = BigInt(res.data.id);
  }
  return out;
}

async function link(
  mapId: bigint,
  sourceMapSystemId: bigint,
  targetMapSystemId: bigint,
  scope: 'wh' | 'stargate',
): Promise<bigint> {
  const res = await createConnection({
    mapId,
    characterId: ACTOR,
    sourceMapSystemId,
    targetMapSystemId,
    scope,
  });
  if (!res.ok || res.data.kind !== 'connection.create') throw new Error('fixture link failed');
  return BigInt(res.data.id);
}

async function seedChainAt(
  mapId: bigint,
  characterId: bigint,
  name: string,
  kind: 'personal' | 'shared',
  anchorMapSystemId: bigint,
): Promise<bigint> {
  const res = await createChainWithSeed({
    mapId,
    characterId,
    name,
    kind,
    canManage: kind === 'shared',
    anchorMapSystemId,
  });
  if (!res.ok) throw new Error(res.error);
  return chainIdOf(res.data.payloads);
}

function chainIdOf(payloads: MapEventPayload[]): bigint {
  const created = payloads[0];
  if (!created || created.kind !== 'chain.created') throw new Error('missing chain.created');
  return BigInt(created.id);
}

async function membersOf(chainId: bigint): Promise<Member[]> {
  return db
    .select({
      id: apMapChainMember.id,
      chainId: apMapChainMember.chainId,
      mapSystemId: apMapChainMember.mapSystemId,
      parentMemberId: apMapChainMember.parentMemberId,
      viaConnectionId: apMapChainMember.viaConnectionId,
      pointerChainId: apMapChainMember.pointerChainId,
    })
    .from(apMapChainMember)
    .where(eq(apMapChainMember.chainId, chainId));
}

async function mapSystemIdOf(mapId: bigint, systemId: number): Promise<bigint> {
  const [row] = await db
    .select({ id: apMapSystem.id })
    .from(apMapSystem)
    .where(and(eq(apMapSystem.mapId, mapId), eq(apMapSystem.systemId, systemId)));
  return row!.id;
}

async function eventCount(mapId: bigint): Promise<number> {
  const rows = (
    await db.execute(sql`SELECT count(*)::int AS count FROM ap_map_event WHERE map_id = ${mapId}`)
  ).rows as Array<{ count: number }>;
  return rows[0]!.count;
}

async function cleanup() {
  await db.delete(apMap).where(like(apMap.name, 'Chain Seed Test%'));
  await db.delete(apCharacter).where(inArray(apCharacter.id, [ACTOR, ALLY]));
  if (userId) {
    await db.delete(apUser).where(eq(apUser.id, userId));
    userId = 0;
  }
  await db.delete(universeSystem).where(inArray(universeSystem.id, ALL_SYSTEMS));
  await db.delete(universeConstellation).where(eq(universeConstellation.id, CONSTELLATION));
  await db.delete(universeRegion).where(eq(universeRegion.id, REGION));
}
