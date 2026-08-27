// @vitest-environment node
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, pool } from '@/db/client';
import {
  apCharacter,
  apMap,
  apMapChainMember,
  apMapSystem,
  apUser,
  universeConstellation,
  universeRegion,
  universeSystem,
} from '@/db/schema';
import { createChain } from '@/lib/map/mutations/chains';
import { addSystemWithStargateLinks } from '@/lib/map/mutations/systems';
import { foldWormholeJumpOntoMap } from '@/lib/jobs/locationCommit';

/**
 * DB-gated like the rest:
 *   docker compose up -d && pnpm db:migrate && RUN_DB_TESTS=1 pnpm test nomadic-chains-tracking
 *
 * Nomadic-chains Stage 2b: tracking-driven chain membership. Drives
 * `foldWormholeJumpOntoMap` over seeded chains and asserts the per-chain
 * fan-out (`attachChainMemberships`): a jump from a chained system accretes a
 * child member, the return jump (and any repeat shuttle) writes nothing, a
 * landing on a system chained elsewhere accretes one deduped pointer-leaf,
 * foreign personal chains never grow, and the presence-gated
 * (`addNewSystems = false`) path accretes no membership at all.
 *
 * Fixture id range claimed by this suite: universe 98049xxx, corp/characters 99062xxx.
 */
const run = process.env.RUN_DB_TESTS === '1';

const REGION = 98049001;
const CONSTELLATION = 98049001;
const SA = 98049011; // rooted in the pilot's personal chain + the foreign one
const SB = 98049012; // destination of the tracked jump
const SC = 98049013; // never placed on the map
const SD = 98049014; // roots the shared chain
const SE = 98049015; // on the map, unchained
const ALL_SYSTEMS = [SA, SB, SC, SD, SE];

const CORP = 99062900n;
const PILOT = 99062001n; // the tracked, jumping character
const OTHER = 99062002n; // owns the foreign personal chain

let userId = 0;
let mapId = 0n;
let pilotChainId = 0n; // personal, PILOT's
let foreignChainId = 0n; // personal, OTHER's — must never grow from PILOT's jumps
let sharedChainId = 0n;

describe.skipIf(!run)('nomadic chains — tracking-driven membership (real Postgres)', () => {
  beforeAll(async () => {
    await migrate(db, { migrationsFolder: 'src/db/migrations' });
    await cleanup();

    await db.insert(universeRegion).values({ id: REGION, name: 'Chain Track Region' });
    await db
      .insert(universeConstellation)
      .values({ id: CONSTELLATION, regionId: REGION, name: 'Chain Track Const' });
    await db.insert(universeSystem).values(
      ALL_SYSTEMS.map((id, i) => ({
        id,
        constellationId: CONSTELLATION,
        name: `J${id}`,
        security: `C${i + 1}`,
      })),
    );

    const [u] = await db.insert(apUser).values({}).returning({ id: apUser.id });
    userId = u!.id;
    await db.insert(apCharacter).values([mkChar(PILOT, 'Track Pilot'), mkChar(OTHER, 'Track Other')]);

    const [map] = await db
      .insert(apMap)
      .values({ name: 'Chain Track Map', scope: 'wh', type: 'corp', ownerCorporationId: CORP })
      .returning({ id: apMap.id });
    mapId = map!.id;

    pilotChainId = await mkChain('Pilot Scouts', PILOT);
    foreignChainId = await mkChain('Other Scouts', OTHER);
    sharedChainId = await mkChain('Ops', null);

    // SA roots both personal chains; SD roots the shared one; SE stays unchained.
    await rootSystem(SA, PILOT, pilotChainId);
    await rootSystem(SA, OTHER, foreignChainId);
    await rootSystem(SD, OTHER, sharedChainId);
    const plain = await addSystemWithStargateLinks({ mapId, systemId: SE, characterId: PILOT });
    expect(plain.ok).toBe(true);
  });

  afterAll(async () => {
    await cleanup();
    await pool.end();
  });

  it('a tracked jump from a chained system accretes a child member; foreign personal chains never grow', async () => {
    const rootId = await memberIdOf(pilotChainId, SA);
    const memberEventsBefore = await memberEventCount(); // the three seeded roots
    const result = await foldWormholeJumpOntoMap({
      mapId,
      characterId: PILOT,
      fromSystemId: SA,
      toSystemId: SB,
      addNewSystems: true,
    });
    expect(result.toSystemAdded).toBe(true);
    expect(result.connectionCreated).toBe(true);

    const member = await realMemberRow(pilotChainId, await mapSystemIdOf(SB));
    expect(member).toMatchObject({
      parentMemberId: rootId,
      viaConnectionId: result.connectionId,
      pointerChainId: null,
    });
    expect(await memberEventCount()).toBe(memberEventsBefore + 1);

    // OTHER's personal chain also holds SA, but it answers only to its owner —
    // PILOT's jump must not grow it.
    expect(await memberCount(foreignChainId)).toBe(1);
  });

  it('the return jump — and any repeat shuttle — writes nothing', async () => {
    const eventsBefore = await eventCount();
    const back = await foldWormholeJumpOntoMap({
      mapId,
      characterId: PILOT,
      fromSystemId: SB,
      toSystemId: SA,
      addNewSystems: true,
    });
    expect(back.connectionCreated).toBe(false);
    expect(back.connectionId).not.toBeNull();

    const again = await foldWormholeJumpOntoMap({
      mapId,
      characterId: PILOT,
      fromSystemId: SA,
      toSystemId: SB,
      addNewSystems: true,
    });
    expect(again.connectionCreated).toBe(false);

    expect(await eventCount()).toBe(eventsBefore);
    expect(await memberCount(pilotChainId)).toBe(2);
    // The root was never reached via a connection — a shuttle toward it must
    // not stamp its via (via = how a member is reached from its parent).
    const [root] = await db
      .select({ viaConnectionId: apMapChainMember.viaConnectionId })
      .from(apMapChainMember)
      .where(eq(apMapChainMember.id, await memberIdOf(pilotChainId, SA)));
    expect(root!.viaConnectionId).toBeNull();
  });

  it('a jump landing on a system chained elsewhere accretes one deduped pointer-leaf', async () => {
    const sharedRootId = await memberIdOf(sharedChainId, SD);
    const result = await foldWormholeJumpOntoMap({
      mapId,
      characterId: PILOT,
      fromSystemId: SD,
      toSystemId: SA,
      addNewSystems: true,
    });
    expect(result.connectionCreated).toBe(true);

    const leaves = await db
      .select()
      .from(apMapChainMember)
      .where(
        and(
          eq(apMapChainMember.chainId, sharedChainId),
          eq(apMapChainMember.mapSystemId, await mapSystemIdOf(SA)),
        ),
      );
    expect(leaves).toHaveLength(1);
    expect(leaves[0]).toMatchObject({
      parentMemberId: sharedRootId,
      viaConnectionId: result.connectionId,
      // SA really occurs in both personal chains; the earliest real member
      // (PILOT's root, inserted first) names the pointer target.
      pointerChainId: pilotChainId,
    });

    const eventsBefore = await eventCount();
    await foldWormholeJumpOntoMap({
      mapId,
      characterId: PILOT,
      fromSystemId: SD,
      toSystemId: SA,
      addNewSystems: true,
    });
    expect(await eventCount()).toBe(eventsBefore);
    expect(await memberCount(sharedChainId)).toBe(2);
  });

  it('the presence-gated path accretes no membership at all', async () => {
    const membersBefore = await totalMemberCount();
    const memberEventsBefore = await memberEventCount();

    // Both endpoints on the map (SA chained, SE unchained): the connection is
    // recorded, membership is not.
    const between = await foldWormholeJumpOntoMap({
      mapId,
      characterId: PILOT,
      fromSystemId: SA,
      toSystemId: SE,
      addNewSystems: false,
    });
    expect(between.connectionCreated).toBe(true);

    // An endpoint off the map: the whole jump is suppressed.
    const suppressed = await foldWormholeJumpOntoMap({
      mapId,
      characterId: PILOT,
      fromSystemId: SA,
      toSystemId: SC,
      addNewSystems: false,
    });
    expect(suppressed.connectionId).toBeNull();
    expect(await mapSystemRow(SC)).toBeUndefined();

    expect(await totalMemberCount()).toBe(membersBefore);
    expect(await memberEventCount()).toBe(memberEventsBefore);
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

async function mkChain(name: string, owner: bigint | null): Promise<bigint> {
  const result = await createChain({
    mapId,
    characterId: owner ?? OTHER,
    name,
    kind: owner === null ? 'shared' : 'personal',
    canManage: owner === null,
  });
  expect(result.ok).toBe(true);
  if (!result.ok || result.data.kind !== 'chain.created') throw new Error('chain seed failed');
  return BigInt(result.data.id);
}

async function rootSystem(systemId: number, characterId: bigint, chainId: bigint) {
  const result = await addSystemWithStargateLinks({
    mapId,
    systemId,
    characterId,
    chain: { chainId, parentMemberId: null },
  });
  expect(result.ok).toBe(true);
}

async function eventCount(): Promise<number> {
  const rows = (
    await db.execute(sql`SELECT count(*)::int AS count FROM ap_map_event WHERE map_id = ${mapId}`)
  ).rows as Array<{ count: number }>;
  return rows[0]!.count;
}

async function memberEventCount(): Promise<number> {
  const rows = (
    await db.execute(
      sql`SELECT count(*)::int AS count FROM ap_map_event WHERE map_id = ${mapId} AND kind = 'chain.member.added'`,
    )
  ).rows as Array<{ count: number }>;
  return rows[0]!.count;
}

async function mapSystemRow(systemId: number) {
  const [row] = await db
    .select({ id: apMapSystem.id })
    .from(apMapSystem)
    .where(and(eq(apMapSystem.mapId, mapId), eq(apMapSystem.systemId, systemId)));
  return row;
}

async function mapSystemIdOf(systemId: number): Promise<bigint> {
  const row = await mapSystemRow(systemId);
  return row!.id;
}

async function realMemberRow(chainId: bigint, mapSystemId: bigint) {
  const [row] = await db
    .select()
    .from(apMapChainMember)
    .where(
      and(
        eq(apMapChainMember.chainId, chainId),
        eq(apMapChainMember.mapSystemId, mapSystemId),
        sql`${apMapChainMember.pointerChainId} IS NULL`,
      ),
    );
  return row;
}

async function memberIdOf(chainId: bigint, systemId: number): Promise<bigint> {
  const row = await realMemberRow(chainId, await mapSystemIdOf(systemId));
  return row!.id;
}

async function memberCount(chainId: bigint): Promise<number> {
  const rows = await db
    .select({ id: apMapChainMember.id })
    .from(apMapChainMember)
    .where(eq(apMapChainMember.chainId, chainId));
  return rows.length;
}

async function totalMemberCount(): Promise<number> {
  const rows = (
    await db.execute(
      sql`SELECT count(*)::int AS count
          FROM ap_map_chain_member m JOIN ap_map_chain c ON c.id = m.chain_id
          WHERE c.map_id = ${mapId}`,
    )
  ).rows as Array<{ count: number }>;
  return rows[0]!.count;
}

async function cleanup() {
  await db.delete(apMap).where(eq(apMap.name, 'Chain Track Map'));
  await db.delete(apCharacter).where(inArray(apCharacter.id, [PILOT, OTHER]));
  if (userId) {
    await db.delete(apUser).where(eq(apUser.id, userId));
    userId = 0;
  }
  await db.delete(universeSystem).where(inArray(universeSystem.id, ALL_SYSTEMS));
  await db.delete(universeConstellation).where(eq(universeConstellation.id, CONSTELLATION));
  await db.delete(universeRegion).where(eq(universeRegion.id, REGION));
  mapId = 0n;
}
