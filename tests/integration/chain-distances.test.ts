// @vitest-environment node
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { eq, inArray } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Session } from 'next-auth';
import { db, pool } from '@/db/client';
import {
  apCharacter,
  apMap,
  apMapChain,
  apMapChainMember,
  apMapSystem,
  apUser,
  universeConstellation,
  universeRegion,
  universeStargateEdge,
  universeSystem,
} from '@/db/schema';
import { getSession } from '@/lib/session';
import { GET as chainDistancesRoute } from '@/app/api/map/[mapId]/chain-distances/route';

// The route reads only `getSession` from `@/lib/session`; a plain factory
// avoids importing the real module (and its NextAuth setup) at all.
vi.mock('@/lib/session', () => ({ getSession: vi.fn() }));

/**
 * DB-gated like the rest:
 *   docker compose up -d && pnpm db:migrate && RUN_DB_TESTS=1 pnpm test
 *
 * Chains-near-me endpoint: hand-checkable gate-jump counts over a seeded line
 * of k-space systems (K1—K2—K3—K4, the Jita → Perimeter = 1 idiom), the
 * J-space origin-set case (origins = the containing chain's exits), personal-
 * chain visibility, the unlocated-pilot null response, and the
 * foreign-character 404.
 *
 * Fixture id range claimed by this suite: universe 98051xxx, corp/characters 99063xxx.
 */
const run = process.env.RUN_DB_TESTS === '1';

const REGION = 98051001;
const CONSTELLATION = 98051001;
const K1 = 98051011; // "Jita"
const K2 = 98051012; // "Perimeter" — 1 jump from K1
const K3 = 98051013;
const K4 = 98051014;
const J1 = 98051021;
const J2 = 98051022;
const J3 = 98051023; // J-space, never chained
const ALL_SYSTEMS = [K1, K2, K3, K4, J1, J2, J3];

const CORP = 99063900n;
const VIEWER = 99063001n; // session character, the measured pilot
const OTHER = 99063002n; // same corp, different account — owns a foreign personal chain
const OUTSIDER = 99063003n; // different corp — no view access

let viewerUserId = 0;
let otherUserId = 0;
let outsiderUserId = 0;
let mapId = 0n;
let chainSharedA = 0n; // J1 root → K1 exit
let chainSharedB = 0n; // J2 root → K3, K4 exits
let chainPersonalOwn = 0n; // VIEWER's, J1 only (no k-space exit)
let chainPersonalForeign = 0n; // OTHER's — must never appear in the response

function sessionFor(characterId: bigint, userId: number): Session {
  return { characterId: characterId.toString(), userId } as Session;
}

async function callRoute(query: string) {
  const request = new NextRequest(
    `https://aperture.test/api/map/${mapId}/chain-distances${query}`,
  );
  return chainDistancesRoute(request, { params: Promise.resolve({ mapId: mapId.toString() }) });
}

async function setPilotLocation(systemId: number | null, online = true) {
  await db
    .update(apCharacter)
    .set({ lastSystemId: systemId, lastOnline: online })
    .where(eq(apCharacter.id, VIEWER));
}

describe.skipIf(!run)('chain-distances endpoint (real Postgres)', () => {
  beforeAll(async () => {
    await migrate(db, { migrationsFolder: 'src/db/migrations' });
    await cleanup();

    await db.insert(universeRegion).values({ id: REGION, name: 'Chain Distance Region' });
    await db
      .insert(universeConstellation)
      .values({ id: CONSTELLATION, regionId: REGION, name: 'Chain Distance Const' });
    await db.insert(universeSystem).values([
      { id: K1, constellationId: CONSTELLATION, name: 'CD Jita', security: 'H', trueSec: 0.95 },
      { id: K2, constellationId: CONSTELLATION, name: 'CD Perimeter', security: 'H', trueSec: 0.9 },
      { id: K3, constellationId: CONSTELLATION, name: 'CD Lowsec', security: 'L', trueSec: 0.3 },
      { id: K4, constellationId: CONSTELLATION, name: 'CD Nullsec', security: '0.0', trueSec: -0.2 },
      { id: J1, constellationId: CONSTELLATION, name: 'J151001', security: 'C2' },
      { id: J2, constellationId: CONSTELLATION, name: 'J151002', security: 'C3' },
      { id: J3, constellationId: CONSTELLATION, name: 'J151003', security: 'C5' },
    ]);
    // The gate line K1—K2—K3—K4 (Jita → Perimeter = 1).
    await db.insert(universeStargateEdge).values([
      { fromSystemId: K1, toSystemId: K2 },
      { fromSystemId: K2, toSystemId: K3 },
      { fromSystemId: K3, toSystemId: K4 },
    ]);

    const users = await db
      .insert(apUser)
      .values([{}, {}, {}])
      .returning({ id: apUser.id });
    viewerUserId = users[0]!.id;
    otherUserId = users[1]!.id;
    outsiderUserId = users[2]!.id;
    await db.insert(apCharacter).values([
      {
        id: VIEWER,
        userId: viewerUserId,
        name: 'CD Viewer',
        ownerHash: `hash-${VIEWER}`,
        corporationId: CORP,
        status: 'active',
        lastSystemId: K1,
        lastOnline: true,
      },
      {
        id: OTHER,
        userId: otherUserId,
        name: 'CD Other',
        ownerHash: `hash-${OTHER}`,
        corporationId: CORP,
        status: 'active',
      },
      {
        id: OUTSIDER,
        userId: outsiderUserId,
        name: 'CD Outsider',
        ownerHash: `hash-${OUTSIDER}`,
        corporationId: 99063901n,
        status: 'active',
      },
    ]);

    const [map] = await db
      .insert(apMap)
      .values({ name: 'Chain Distance Map', scope: 'wh', type: 'corp', ownerCorporationId: CORP })
      .returning({ id: apMap.id });
    mapId = map!.id;

    const placed = await db
      .insert(apMapSystem)
      .values(
        [J1, J2, K1, K3, K4].map((systemId) => ({ mapId, systemId, visible: true })),
      )
      .returning({ id: apMapSystem.id, systemId: apMapSystem.systemId });
    const mapSystemId = new Map(placed.map((row) => [row.systemId, row.id]));

    const chains = await db
      .insert(apMapChain)
      .values([
        { mapId, name: 'Shared A', kind: 'shared' },
        { mapId, name: 'Shared B', kind: 'shared' },
        { mapId, name: 'Own personal', kind: 'personal', ownerCharacterId: VIEWER },
        { mapId, name: 'Foreign personal', kind: 'personal', ownerCharacterId: OTHER },
      ])
      .returning({ id: apMapChain.id });
    chainSharedA = chains[0]!.id;
    chainSharedB = chains[1]!.id;
    chainPersonalOwn = chains[2]!.id;
    chainPersonalForeign = chains[3]!.id;

    const [rootA] = await db
      .insert(apMapChainMember)
      .values({ chainId: chainSharedA, mapSystemId: mapSystemId.get(J1)! })
      .returning({ id: apMapChainMember.id });
    await db
      .insert(apMapChainMember)
      .values({
        chainId: chainSharedA,
        mapSystemId: mapSystemId.get(K1)!,
        parentMemberId: rootA!.id,
      });
    const [rootB] = await db
      .insert(apMapChainMember)
      .values({ chainId: chainSharedB, mapSystemId: mapSystemId.get(J2)! })
      .returning({ id: apMapChainMember.id });
    await db.insert(apMapChainMember).values([
      { chainId: chainSharedB, mapSystemId: mapSystemId.get(K3)!, parentMemberId: rootB!.id },
      { chainId: chainSharedB, mapSystemId: mapSystemId.get(K4)!, parentMemberId: rootB!.id },
    ]);
    await db
      .insert(apMapChainMember)
      .values({ chainId: chainPersonalOwn, mapSystemId: mapSystemId.get(J1)! });
    await db
      .insert(apMapChainMember)
      .values({ chainId: chainPersonalForeign, mapSystemId: mapSystemId.get(K1)! });

    vi.mocked(getSession).mockResolvedValue(sessionFor(VIEWER, viewerUserId));
  });

  afterAll(async () => {
    await cleanup();
    await pool.end();
  });

  it('measures hand-checkable jump counts from a k-space pilot', async () => {
    await setPilotLocation(K1);
    const res = await callRoute(`?characterId=${VIEWER}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.characterId).toBe(Number(VIEWER));
    expect(body.data.originSystemId).toBe(K1);
    expect(body.data.distances).toEqual({
      [chainSharedA.toString()]: 0, // sitting on the exit itself — never "—"
      [chainSharedB.toString()]: 2, // K1→K2→K3, closer than K4 at 3
      [chainPersonalOwn.toString()]: null, // no k-space member
    });
    expect(body.data.nearestExits).toEqual({
      [chainSharedA.toString()]: K1,
      [chainSharedB.toString()]: K3,
      [chainPersonalOwn.toString()]: null,
    });
    // The foreign personal chain never rides the payload.
    expect(body.data.distances[chainPersonalForeign.toString()]).toBeUndefined();
  });

  it('Jita → Perimeter = 1 for a pilot one gate out', async () => {
    await setPilotLocation(K2);
    const res = await callRoute(`?characterId=${VIEWER}`);
    const body = await res.json();
    expect(body.data.distances[chainSharedA.toString()]).toBe(1);
    expect(body.data.nearestExits[chainSharedA.toString()]).toBe(K1);
  });

  it('J-space pilot measures from the containing chain’s k-space exits', async () => {
    await setPilotLocation(J2); // real member of Shared B
    const res = await callRoute(`?characterId=${VIEWER}`);
    const body = await res.json();
    expect(body.data.originSystemId).toBe(J2);
    expect(body.data.distances).toEqual({
      [chainSharedA.toString()]: 2, // min over pairs: K3→K1 = 2 beats K4→K1 = 3
      [chainSharedB.toString()]: 0, // the chain the pilot sits inside
      [chainPersonalOwn.toString()]: null,
    });
  });

  it('J-space pilot outside every visible chain gets the unknown response', async () => {
    await setPilotLocation(J3);
    const res = await callRoute(`?characterId=${VIEWER}`);
    const body = await res.json();
    expect(body.data.originSystemId).toBeNull();
    expect(body.data.distances).toEqual({
      [chainSharedA.toString()]: null,
      [chainSharedB.toString()]: null,
      [chainPersonalOwn.toString()]: null,
    });
  });

  it('an unlocated (offline) pilot gets the unknown response', async () => {
    await setPilotLocation(K1, false);
    const res = await callRoute(`?characterId=${VIEWER}`);
    const body = await res.json();
    expect(body.data.originSystemId).toBeNull();
    expect(body.data.distances[chainSharedA.toString()]).toBeNull();
    await setPilotLocation(K1, true);
  });

  it("rejects a character that is not the viewer's own", async () => {
    const res = await callRoute(`?characterId=${OTHER}`);
    expect(res.status).toBe(404);
  });

  it('rejects a missing or malformed characterId', async () => {
    expect((await callRoute('')).status).toBe(400);
    expect((await callRoute('?characterId=abc')).status).toBe(400);
  });

  it('view-gates: a non-member of the owning corp cannot see the map', async () => {
    vi.mocked(getSession).mockResolvedValueOnce(sessionFor(OUTSIDER, outsiderUserId));
    const res = await callRoute(`?characterId=${OUTSIDER}`);
    expect(res.status).toBe(404);
  });
});

async function cleanup() {
  await db.delete(apMap).where(eq(apMap.name, 'Chain Distance Map'));
  await db.delete(apCharacter).where(inArray(apCharacter.id, [VIEWER, OTHER, OUTSIDER]));
  const userIds = [viewerUserId, otherUserId, outsiderUserId].filter((id) => id !== 0);
  if (userIds.length) await db.delete(apUser).where(inArray(apUser.id, userIds));
  await db
    .delete(universeStargateEdge)
    .where(inArray(universeStargateEdge.fromSystemId, ALL_SYSTEMS));
  await db.delete(universeSystem).where(inArray(universeSystem.id, ALL_SYSTEMS));
  await db.delete(universeConstellation).where(eq(universeConstellation.id, CONSTELLATION));
  await db.delete(universeRegion).where(eq(universeRegion.id, REGION));
}
