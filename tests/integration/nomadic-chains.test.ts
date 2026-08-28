// @vitest-environment node
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
  universeSystem,
} from '@/db/schema';
import {
  attachChainMemberOnSystemAdd,
  createChain,
  deleteChain,
  renameChain,
} from '@/lib/map/mutations/chains';
import { createConnectionWithChainMembership } from '@/lib/map/mutations/connections';
import { addSystemWithStargateLinks, removeSystem } from '@/lib/map/mutations/systems';
import { loadMapForView } from '@/lib/map/loadMap';
import { mapEventPayloadSchema } from '@/lib/realtime/protocol';

/**
 * DB-gated like the rest:
 *   docker compose up -d && pnpm db:migrate && RUN_DB_TESTS=1 pnpm test
 *
 * Nomadic-chains: chain lifecycle guards (personal privacy, shared management
 * gating), membership write-through (root/child real occurrences, via
 * backfill, loop + cross-chain pointer-leaves — reaching every chain through
 * the Stage 9 universal fan-out, which resolves the source member from the
 * connection's source endpoint), pruning on system removal (parent-FK cascade)
 * and chain delete (pointer degrade), and the viewer-filtered chain load in
 * `loadMapForView`. Seeding + fan-out parity live in
 * `nomadic-chains-seeding.test.ts`.
 *
 * Fixture id range claimed by this suite: universe 98048xxx, corp/characters 99061xxx.
 */
const run = process.env.RUN_DB_TESTS === '1';

const REGION = 98048001;
const CONSTELLATION = 98048001;
const SA = 98048011;
const SB = 98048012;
const SC = 98048013;
const SD = 98048014;
const SE = 98048015;
const ALL_SYSTEMS = [SA, SB, SC, SD, SE];

const CORP = 99061900n;
const OWNER = 99061001n; // ordinary corp member; owns the personal chain
const OTHER = 99061002n; // ordinary corp member; not the owner
const DIRECTOR = 99061003n; // corp director ⇒ canManageMap

let userId = 0;
let mapId = 0n;
let personalChainId = 0n;
let sharedChainId = 0n;

describe.skipIf(!run)('nomadic chains — lifecycle + membership write-through (real Postgres)', () => {
  beforeAll(async () => {
    await migrate(db, { migrationsFolder: 'src/db/migrations' });
    await cleanup();

    await db.insert(universeRegion).values({ id: REGION, name: 'Chain Test Region' });
    await db
      .insert(universeConstellation)
      .values({ id: CONSTELLATION, regionId: REGION, name: 'Chain Test Const' });
    await db.insert(universeSystem).values([
      { id: SA, constellationId: CONSTELLATION, name: 'J148048', security: 'C2' },
      { id: SB, constellationId: CONSTELLATION, name: 'J248048', security: 'C3' },
      { id: SC, constellationId: CONSTELLATION, name: 'J348048', security: 'C4' },
      { id: SD, constellationId: CONSTELLATION, name: 'J448048', security: 'C5' },
      { id: SE, constellationId: CONSTELLATION, name: 'J548048', security: 'C1' },
    ]);

    const [u] = await db.insert(apUser).values({}).returning({ id: apUser.id });
    userId = u!.id;
    await db.insert(apCharacter).values([
      mkChar(OWNER, 'Chain Owner', false),
      mkChar(OTHER, 'Chain Other', false),
      mkChar(DIRECTOR, 'Chain Director', true),
    ]);

    const [map] = await db
      .insert(apMap)
      .values({ name: 'Chain Test Map', scope: 'wh', type: 'corp', ownerCorporationId: CORP })
      .returning({ id: apMap.id });
    mapId = map!.id;
  });

  afterAll(async () => {
    await cleanup();
    await pool.end();
  });

  it('any viewer creates a personal chain; shared requires management', async () => {
    const personal = await createChain({
      mapId,
      characterId: OWNER,
      name: 'Scouting',
      kind: 'personal',
      canManage: false,
    });
    expect(personal.ok).toBe(true);
    if (!personal.ok) return;
    expect(() => mapEventPayloadSchema.parse(personal.data)).not.toThrow();
    expect(personal.data).toMatchObject({
      kind: 'chain.created',
      chainKind: 'personal',
      ownerCharacterId: Number(OWNER),
    });
    if (personal.data.kind === 'chain.created') personalChainId = BigInt(personal.data.id);

    const denied = await createChain({
      mapId,
      characterId: OTHER,
      name: 'Ops',
      kind: 'shared',
      canManage: false,
    });
    expect(denied).toMatchObject({ ok: false, error: expect.stringContaining('management') });

    const shared = await createChain({
      mapId,
      characterId: DIRECTOR,
      name: 'Ops',
      kind: 'shared',
      canManage: true,
    });
    expect(shared.ok).toBe(true);
    if (shared.ok && shared.data.kind === 'chain.created') {
      expect(shared.data.ownerCharacterId).toBeNull();
      sharedChainId = BigInt(shared.data.id);
    }
  });

  it('a foreign personal chain reads "Chain not found." through the write path', async () => {
    const rename = await renameChain({
      mapId,
      chainId: personalChainId,
      characterId: OTHER,
      name: 'Hijacked',
      canManage: false,
    });
    expect(rename).toMatchObject({ ok: false, error: 'Chain not found.' });

    // Even with management authority — personal chains answer to their owner only.
    const managerRename = await renameChain({
      mapId,
      chainId: personalChainId,
      characterId: DIRECTOR,
      name: 'Hijacked',
      canManage: true,
    });
    expect(managerRename).toMatchObject({ ok: false, error: 'Chain not found.' });

    const owned = await renameChain({
      mapId,
      chainId: personalChainId,
      characterId: OWNER,
      name: 'Scouts',
      canManage: false,
    });
    expect(owned.ok).toBe(true);

    const sharedDenied = await renameChain({
      mapId,
      chainId: sharedChainId,
      characterId: OWNER,
      name: 'Nope',
      canManage: false,
    });
    expect(sharedDenied).toMatchObject({ ok: false, error: expect.stringContaining('management') });
  });

  it('system-add write-through: root, child, single-anchor guard, idempotent re-add', async () => {
    const before = await eventCount();
    const root = await addSystemWithStargateLinks({
      mapId,
      systemId: SA,
      characterId: OWNER,
      chain: { chainId: personalChainId, parentMemberId: null },
    });
    expect(root.ok).toBe(true);
    if (!root.ok) return;
    expect(root.data.payloads.map((p) => p.kind)).toEqual(['system.added', 'chain.member.added']);
    const rootPayload = root.data.payloads[1]!;
    expect(() => mapEventPayloadSchema.parse(rootPayload)).not.toThrow();
    expect(rootPayload).toMatchObject({
      kind: 'chain.member.added',
      parentMemberId: null,
      viaConnectionId: null,
      pointerChainId: null,
      chainName: 'Scouts',
    });
    expect(await eventCount()).toBe(before + 2);

    const rootMemberId = await memberIdOf(personalChainId, SA);
    const child = await addSystemWithStargateLinks({
      mapId,
      systemId: SB,
      characterId: OWNER,
      chain: { chainId: personalChainId, parentMemberId: rootMemberId },
    });
    expect(child.ok).toBe(true);
    if (!child.ok) return;
    const childPayload = child.data.payloads[1]!;
    expect(childPayload).toMatchObject({
      kind: 'chain.member.added',
      parentMemberId: rootMemberId.toString(),
    });

    // One anchor per chain: a second parentless add is refused (and rolls the add back).
    const secondRoot = await addSystemWithStargateLinks({
      mapId,
      systemId: SC,
      characterId: OWNER,
      chain: { chainId: personalChainId, parentMemberId: null },
    });
    expect(secondRoot).toMatchObject({ ok: false, error: expect.stringContaining('anchor') });
    expect(await mapSystemRow(SC)).toBeUndefined();

    // Re-adding a system already really in the chain is a membership no-op.
    const readd = await addSystemWithStargateLinks({
      mapId,
      systemId: SB,
      characterId: OWNER,
      chain: { chainId: personalChainId, parentMemberId: rootMemberId },
    });
    expect(readd.ok).toBe(true);
    if (!readd.ok) return;
    expect(readd.data.payloads.map((p) => p.kind)).toEqual(['system.added']);
    expect(await memberCount(personalChainId)).toBe(2);
  });

  it('charting into a foreign personal chain is refused and rolls back the add', async () => {
    const rootMemberId = await memberIdOf(personalChainId, SA);
    const result = await addSystemWithStargateLinks({
      mapId,
      systemId: SE,
      characterId: OTHER,
      chain: { chainId: personalChainId, parentMemberId: rootMemberId },
    });
    expect(result).toMatchObject({ ok: false, error: 'Chain not found.' });
    expect(await mapSystemRow(SE)).toBeUndefined();
  });

  it('connection write-through: via backfill, new real member, loop + cross-chain pointer-leaves', async () => {
    const childMemberId = await memberIdOf(personalChainId, SB);
    const msA = await mapSystemIdOf(SA);
    const msB = await mapSystemIdOf(SB);

    // SA→SB: the tree edge already exists (SB is SA's child) — the connection
    // backfills the child's via_connection_id and re-broadcasts the member.
    const before = await eventCount();
    const linkAB = await createConnectionWithChainMembership(
      { mapId, characterId: OWNER, sourceMapSystemId: msA, targetMapSystemId: msB, scope: 'wh' },
    );
    expect(linkAB.ok).toBe(true);
    if (!linkAB.ok || linkAB.data.kind !== 'connection.create') return;
    expect(await eventCount()).toBe(before + 2); // connection.create + member backfill
    expect(await memberCount(personalChainId)).toBe(2);
    const [child] = await db
      .select({ viaConnectionId: apMapChainMember.viaConnectionId })
      .from(apMapChainMember)
      .where(eq(apMapChainMember.id, childMemberId));
    expect(child!.viaConnectionId).toBe(BigInt(linkAB.data.id));

    // SB→SC: SC is chained nowhere — a new real occurrence, child of SB's member.
    const addC = await addSystemWithStargateLinks({ mapId, systemId: SC, characterId: OWNER });
    expect(addC.ok).toBe(true);
    const msC = await mapSystemIdOf(SC);
    const linkBC = await createConnectionWithChainMembership(
      { mapId, characterId: OWNER, sourceMapSystemId: msB, targetMapSystemId: msC, scope: 'wh' },
    );
    expect(linkBC.ok).toBe(true);
    if (!linkBC.ok || linkBC.data.kind !== 'connection.create') return;
    const memberC = await realMemberRow(personalChainId, msC);
    expect(memberC).toMatchObject({
      parentMemberId: childMemberId,
      viaConnectionId: BigInt(linkBC.data.id),
      pointerChainId: null,
    });

    // SC→SA: SA already really occurs elsewhere in this chain (the root, not
    // SC's neighbour) — a loop pointer-leaf, deduped on a repeat draw.
    const linkCA = await createConnectionWithChainMembership(
      { mapId, characterId: OWNER, sourceMapSystemId: msC, targetMapSystemId: msA, scope: 'wh' },
    );
    expect(linkCA.ok).toBe(true);
    const loopLeaves = await db
      .select()
      .from(apMapChainMember)
      .where(
        and(
          eq(apMapChainMember.chainId, personalChainId),
          eq(apMapChainMember.mapSystemId, msA),
          eq(apMapChainMember.pointerChainId, personalChainId),
        ),
      );
    expect(loopLeaves).toHaveLength(1);
    expect(loopLeaves[0]!.parentMemberId).toBe(memberC!.id);

    const repeat = await createConnectionWithChainMembership(
      { mapId, characterId: OWNER, sourceMapSystemId: msC, targetMapSystemId: msA, scope: 'wh' },
    );
    expect(repeat.ok).toBe(true);
    expect(await memberCount(personalChainId)).toBe(4); // no second loop pill

    // Shared chain: any viewer charts it. SD roots it; SD→SB continues in the
    // (personal) chain that already holds SB — a cross-chain pointer-leaf.
    const addD = await addSystemWithStargateLinks({
      mapId,
      systemId: SD,
      characterId: OTHER,
      chain: { chainId: sharedChainId, parentMemberId: null },
    });
    expect(addD.ok).toBe(true);
    const msD = await mapSystemIdOf(SD);
    const rootD = await memberIdOf(sharedChainId, SD);
    const eventsBefore = await eventCount();
    const linkDB = await createConnectionWithChainMembership(
      { mapId, characterId: OTHER, sourceMapSystemId: msD, targetMapSystemId: msB, scope: 'wh' },
    );
    expect(linkDB.ok).toBe(true);
    expect(await eventCount()).toBe(eventsBefore + 2);
    const [pointer] = await db
      .select()
      .from(apMapChainMember)
      .where(
        and(eq(apMapChainMember.chainId, sharedChainId), eq(apMapChainMember.mapSystemId, msB)),
      );
    expect(pointer).toMatchObject({ parentMemberId: rootD, pointerChainId: personalChainId });
  });

  it('loadMapForView ships shared chains to everyone, personal chains to their owner only', async () => {
    const ownerView = await loadMapForView(mapId, OWNER);
    expect(ownerView).not.toBeNull();
    expect(ownerView!.chains.map((c) => c.name).sort()).toEqual(['Ops', 'Scouts']);
    expect(ownerView!.chainMembers.length).toBe(6); // 4 personal + 2 shared

    const otherView = await loadMapForView(mapId, OTHER);
    expect(otherView!.chains.map((c) => c.name)).toEqual(['Ops']);
    expect(
      otherView!.chainMembers.every((m) => m.chainId === sharedChainId.toString()),
    ).toBe(true);
  });

  it('removing a system prunes its occurrences and their subtrees in every chain', async () => {
    const msB = await mapSystemIdOf(SB);
    const result = await removeSystem({ mapId, mapSystemId: msB, characterId: OWNER });
    expect(result.ok).toBe(true);

    // Personal chain: SB's member goes, SC's member (its child) and the loop
    // pointer-leaf under SC cascade with it. Only the root survives.
    const personalLeft = await db
      .select({ mapSystemId: apMapChainMember.mapSystemId })
      .from(apMapChainMember)
      .where(eq(apMapChainMember.chainId, personalChainId));
    expect(personalLeft).toHaveLength(1);
    expect(personalLeft[0]!.mapSystemId).toBe(await mapSystemIdOf(SA));

    // Shared chain: the pointer-leaf naming SB's system is pruned; the root stays.
    const sharedLeft = await db
      .select({ mapSystemId: apMapChainMember.mapSystemId })
      .from(apMapChainMember)
      .where(eq(apMapChainMember.chainId, sharedChainId));
    expect(sharedLeft).toHaveLength(1);

    // Chains themselves survive a prune.
    const chains = await db.select({ id: apMapChain.id }).from(apMapChain).where(eq(apMapChain.mapId, mapId));
    expect(chains).toHaveLength(2);
  });

  it('deleting a chain removes its members, degrades pointers to it, and never touches systems', async () => {
    // Rebuild a cross-chain pointer: SC roots a second personal chain; the
    // shared chain then points at it.
    const p2 = await createChain({
      mapId,
      characterId: OWNER,
      name: 'Daytrip',
      kind: 'personal',
      canManage: false,
    });
    expect(p2.ok).toBe(true);
    if (!p2.ok || p2.data.kind !== 'chain.created') return;
    const p2Id = BigInt(p2.data.id);

    const addC = await addSystemWithStargateLinks({
      mapId,
      systemId: SC,
      characterId: OWNER,
      chain: { chainId: p2Id, parentMemberId: null },
    });
    expect(addC.ok).toBe(true);

    const msC = await mapSystemIdOf(SC);
    const msD = await mapSystemIdOf(SD);
    const linkDC = await createConnectionWithChainMembership(
      { mapId, characterId: OTHER, sourceMapSystemId: msD, targetMapSystemId: msC, scope: 'wh' },
    );
    expect(linkDC.ok).toBe(true);
    const pointerBefore = await db
      .select({ id: apMapChainMember.id, pointerChainId: apMapChainMember.pointerChainId })
      .from(apMapChainMember)
      .where(
        and(eq(apMapChainMember.chainId, sharedChainId), eq(apMapChainMember.mapSystemId, msC)),
      );
    expect(pointerBefore[0]!.pointerChainId).toBe(p2Id);

    const visibleBefore = await visibleSystemCount();
    const deleted = await deleteChain({
      mapId,
      chainId: p2Id,
      characterId: OWNER,
      canManage: false,
    });
    expect(deleted.ok).toBe(true);
    if (deleted.ok) {
      expect(deleted.data).toMatchObject({ kind: 'chain.deleted', name: 'Daytrip' });
    }

    expect(await memberCount(p2Id)).toBe(0);
    // The pointer-leaf in the shared chain degrades to a plain leaf (SET NULL).
    const pointerAfter = await db
      .select({ pointerChainId: apMapChainMember.pointerChainId })
      .from(apMapChainMember)
      .where(eq(apMapChainMember.id, pointerBefore[0]!.id));
    expect(pointerAfter[0]!.pointerChainId).toBeNull();
    // Canonical systems are untouched by a chain delete.
    expect(await visibleSystemCount()).toBe(visibleBefore);
  });

  it('attachChainMemberOnSystemAdd guards the parent member belonging to the chain', async () => {
    const rootD = await memberIdOf(sharedChainId, SD);
    const msD = await mapSystemIdOf(SD);
    await expect(
      db.transaction((tx) =>
        attachChainMemberOnSystemAdd(tx, {
          mapId,
          characterId: OWNER,
          chainId: personalChainId,
          parentMemberId: rootD, // member of the *shared* chain
          mapSystemId: msD,
        }),
      ),
    ).rejects.toThrow('Parent member not found in chain.');
  });
});

function mkChar(id: bigint, name: string, isDirector: boolean) {
  return {
    id,
    userId,
    name,
    ownerHash: `hash-${id.toString()}`,
    corporationId: CORP,
    isDirector,
    status: 'active',
  } as const;
}

async function eventCount(): Promise<number> {
  const rows = (
    await db.execute(sql`SELECT count(*)::int AS count FROM ap_map_event WHERE map_id = ${mapId}`)
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

async function visibleSystemCount(): Promise<number> {
  const rows = await db
    .select({ id: apMapSystem.id })
    .from(apMapSystem)
    .where(and(eq(apMapSystem.mapId, mapId), eq(apMapSystem.visible, true)));
  return rows.length;
}

async function cleanup() {
  await db.delete(apMap).where(eq(apMap.name, 'Chain Test Map'));
  await db.delete(apCharacter).where(inArray(apCharacter.id, [OWNER, OTHER, DIRECTOR]));
  if (userId) {
    await db.delete(apUser).where(eq(apUser.id, userId));
    userId = 0;
  }
  await db.delete(universeSystem).where(inArray(universeSystem.id, ALL_SYSTEMS));
  await db.delete(universeConstellation).where(eq(universeConstellation.id, CONSTELLATION));
  await db.delete(universeRegion).where(eq(universeRegion.id, REGION));
  mapId = 0n;
}
