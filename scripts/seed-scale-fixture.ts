// WDS-scale fixture seed: one map ("Scale Fixture") at the nomadic-chains
// measurement shape — 30 chains of 33 systems (a k-space root fanning into 4
// branches of depth 8, mirroring tests/unit/chain-forest-view.test.ts) plus 10
// unassigned systems = 1000 systems, ~5 signatures per system, and one wh
// connection per tree edge. Used for the Stage 6 load-path measurement and the
// Stage 5/8a real-browser scale checks. Self-contained: seeds its own synthetic
// `universe_*` rows in a reserved id range, so no SDE ingest is required.
// Idempotent — deletes the map and the synthetic universe/viewer rows first.
//
// Usage: tsx scripts/seed-scale-fixture.ts [--owner <characterId>]
// Without --owner a synthetic viewer character owns the (private) map; pass
// your own character id to open the map in a browser as yourself.
import { and, eq, gte, lt } from 'drizzle-orm';
import { db, pool } from '@/db/client';
import {
  apCharacter,
  apMap,
  apMapChain,
  apMapChainMember,
  apMapConnection,
  apMapSignature,
  apMapSystem,
  apUser,
  universeConstellation,
  universeRegion,
  universeSystem,
} from '@/db/schema';

const MAP_NAME = 'Scale Fixture';
// Reserved synthetic id range (matches the tests' 98xxxxxx idiom, above any
// real EVE id in use).
const BASE = 98_090_000;
const REGION = BASE;
const CONSTELLATION = BASE;
const SYSTEM_ID_LO = BASE + 1; // systems occupy [LO, LO + 1000)
const SYSTEM_ID_HI = SYSTEM_ID_LO + 1000;
const VIEWER_ID = BigInt(BASE + 9_999); // 98099999

const CHAINS = 30;
const BRANCHES = 4;
const DEPTH = 8;
const UNASSIGNED = 10;
const SIG_TTL_MS = 48 * 60 * 60 * 1000;

function parseOwnerArg(): bigint | null {
  const idx = process.argv.indexOf('--owner');
  if (idx === -1) return null;
  const raw = process.argv[idx + 1];
  if (!raw || !/^\d+$/.test(raw)) throw new Error('--owner expects a numeric character id');
  return BigInt(raw);
}

async function cleanup() {
  await db.delete(apMap).where(eq(apMap.name, MAP_NAME)); // map_system/connection/signature/chain rows cascade
  await db
    .delete(universeSystem)
    .where(and(gte(universeSystem.id, SYSTEM_ID_LO), lt(universeSystem.id, SYSTEM_ID_HI)));
  await db.delete(universeConstellation).where(eq(universeConstellation.id, CONSTELLATION));
  await db.delete(universeRegion).where(eq(universeRegion.id, REGION));
  const [viewer] = await db
    .select({ userId: apCharacter.userId })
    .from(apCharacter)
    .where(eq(apCharacter.id, VIEWER_ID));
  if (viewer) {
    await db.delete(apUser).where(eq(apUser.id, viewer.userId)); // character cascades
  }
}

async function main() {
  const ownerArg = parseOwnerArg();
  await cleanup();

  let ownerCharacterId: bigint;
  if (ownerArg) {
    const [existing] = await db
      .select({ id: apCharacter.id })
      .from(apCharacter)
      .where(eq(apCharacter.id, ownerArg));
    if (!existing) throw new Error(`--owner character ${ownerArg} not found`);
    ownerCharacterId = ownerArg;
  } else {
    const [user] = await db.insert(apUser).values({}).returning({ id: apUser.id });
    await db.insert(apCharacter).values({
      id: VIEWER_ID,
      userId: user!.id,
      name: 'Scale Fixture Viewer',
      ownerHash: 'scale-fixture-hash',
    });
    ownerCharacterId = VIEWER_ID;
  }

  await db.insert(universeRegion).values({ id: REGION, name: 'Scale Fixture Region' });
  await db
    .insert(universeConstellation)
    .values({ id: CONSTELLATION, regionId: REGION, name: 'Scale Fixture Const' });

  // Universe systems: per chain one HS root + 32 C4 members, then 10 unassigned
  // C4s. Ids are allocated sequentially from SYSTEM_ID_LO.
  let nextSystemId = SYSTEM_ID_LO;
  const allocSystem = (security: string) => {
    const id = nextSystemId++;
    return {
      id,
      constellationId: CONSTELLATION,
      name: security === 'H' ? `ScaleHS ${id - BASE}` : `J9${String(id - BASE).padStart(5, '0')}`,
      security,
      trueSec: security === 'H' ? 0.9 : -1,
    };
  };

  type ChainPlan = {
    kind: 'personal' | 'shared';
    rootSystemId: number;
    // branches[b][d] = EVE system id at branch b, depth d+1.
    branches: number[][];
  };
  const chainPlans: ChainPlan[] = [];
  const universeRows: (typeof universeSystem.$inferInsert)[] = [];
  for (let c = 0; c < CHAINS; c++) {
    const root = allocSystem('H');
    universeRows.push(root);
    const branches: number[][] = [];
    for (let b = 0; b < BRANCHES; b++) {
      const branch: number[] = [];
      for (let d = 0; d < DEPTH; d++) {
        const sys = allocSystem('C4');
        universeRows.push(sys);
        branch.push(sys.id);
      }
      branches.push(branch);
    }
    chainPlans.push({ kind: c < 10 ? 'shared' : 'personal', rootSystemId: root.id, branches });
  }
  const unassignedIds: number[] = [];
  for (let u = 0; u < UNASSIGNED; u++) {
    const sys = allocSystem('C4');
    universeRows.push(sys);
    unassignedIds.push(sys.id);
  }
  await db.insert(universeSystem).values(universeRows);

  const [map] = await db
    .insert(apMap)
    .values({ name: MAP_NAME, scope: 'all', type: 'private', ownerCharacterId })
    .returning({ id: apMap.id });
  const mapId = map!.id;

  // Map systems on a plain grid (free-canvas positions; chain mode generates
  // its own layout).
  const systemRows = await db
    .insert(apMapSystem)
    .values(
      universeRows.map((sys, i) => ({
        mapId,
        systemId: sys.id,
        visible: true,
        positionX: (i % 40) * 220,
        positionY: Math.floor(i / 40) * 140,
        status: 'unknown' as const,
      })),
    )
    .returning({ id: apMapSystem.id, systemId: apMapSystem.systemId });
  const mapSystemByEve = new Map(systemRows.map((r) => [r.systemId, r.id]));

  // Wormhole connections: one per tree edge (root→branch head, then down each
  // branch). Every 25th goes EOL for display realism.
  const connectionValues: (typeof apMapConnection.$inferInsert)[] = [];
  const edgeKeys: { fromEve: number; toEve: number }[] = [];
  for (const plan of chainPlans) {
    for (const branch of plan.branches) {
      let prev = plan.rootSystemId;
      for (const sysId of branch) {
        edgeKeys.push({ fromEve: prev, toEve: sysId });
        connectionValues.push({
          mapId,
          sourceMapSystemId: mapSystemByEve.get(prev)!,
          targetMapSystemId: mapSystemByEve.get(sysId)!,
          scope: 'wh',
          massStatus: 'fresh',
          eolStage: connectionValues.length % 25 === 24 ? 'eol' : 'none',
          eolAt: connectionValues.length % 25 === 24 ? new Date() : null,
          confirmedAt: new Date(),
        });
        prev = sysId;
      }
    }
  }
  const connectionRows = await db
    .insert(apMapConnection)
    .values(connectionValues)
    .returning({ id: apMapConnection.id });
  const connectionByEdge = new Map(
    connectionRows.map((row, i) => [`${edgeKeys[i]!.fromEve}:${edgeKeys[i]!.toEve}`, row.id]),
  );

  // Signatures: four generic sigs per system, plus one wormhole sig on the
  // near side of every tree edge, linked to its connection (≈5 per system).
  const expiresAt = new Date(Date.now() + SIG_TTL_MS);
  const genericGroups = ['combat', 'relic', 'data', 'gas'] as const;
  const sigValues: (typeof apMapSignature.$inferInsert)[] = [];
  for (const row of systemRows) {
    genericGroups.forEach((groupKey, i) => {
      sigValues.push({
        mapSystemId: row.id,
        sigId: `SG${String.fromCharCode(65 + i)}`,
        groupKey,
        classKind: groupKey === 'combat' ? 'anomaly' : 'signature',
        name: `Scale ${groupKey} site`,
        expiresAt,
      });
    });
  }
  const whSigCountBySystem = new Map<number, number>();
  for (const { fromEve, toEve } of edgeKeys) {
    const mapSystemId = mapSystemByEve.get(fromEve)!;
    const n = whSigCountBySystem.get(fromEve) ?? 0;
    whSigCountBySystem.set(fromEve, n + 1);
    sigValues.push({
      mapSystemId,
      sigId: `WH${String.fromCharCode(65 + n)}`,
      groupKey: 'wormhole',
      classKind: 'signature',
      mapConnectionId: connectionByEdge.get(`${fromEve}:${toEve}`)!,
      expiresAt,
    });
  }
  for (let i = 0; i < sigValues.length; i += 1000) {
    await db.insert(apMapSignature).values(sigValues.slice(i, i + 1000));
  }

  // Chains + memberships: root first, then depth by depth so parent ids exist
  // (bigserial member ids stay in creation order, the sibling sort key).
  const chainRows = await db
    .insert(apMapChain)
    .values(
      chainPlans.map((plan, i) => ({
        mapId,
        name: `Scale Chain ${i + 1}`,
        kind: plan.kind,
        ownerCharacterId: plan.kind === 'personal' ? ownerCharacterId : null,
        createdByCharacterId: plan.kind === 'shared' ? ownerCharacterId : null,
      })),
    )
    .returning({ id: apMapChain.id });

  const rootRows = await db
    .insert(apMapChainMember)
    .values(
      chainPlans.map((plan, i) => ({
        chainId: chainRows[i]!.id,
        mapSystemId: mapSystemByEve.get(plan.rootSystemId)!,
      })),
    )
    .returning({ id: apMapChainMember.id });

  // previousMember[chain][branch] = the member id the next depth hangs off.
  const previousMember = chainPlans.map((_, i) =>
    Array.from({ length: BRANCHES }, () => rootRows[i]!.id),
  );
  let memberCount = chainPlans.length;
  for (let d = 0; d < DEPTH; d++) {
    const values: (typeof apMapChainMember.$inferInsert)[] = [];
    const slots: { chain: number; branch: number }[] = [];
    for (let c = 0; c < chainPlans.length; c++) {
      for (let b = 0; b < BRANCHES; b++) {
        const sysId = chainPlans[c]!.branches[b]![d]!;
        const fromEve = d === 0 ? chainPlans[c]!.rootSystemId : chainPlans[c]!.branches[b]![d - 1]!;
        values.push({
          chainId: chainRows[c]!.id,
          mapSystemId: mapSystemByEve.get(sysId)!,
          parentMemberId: previousMember[c]![b]!,
          viaConnectionId: connectionByEdge.get(`${fromEve}:${sysId}`)!,
        });
        slots.push({ chain: c, branch: b });
      }
    }
    const inserted = await db
      .insert(apMapChainMember)
      .values(values)
      .returning({ id: apMapChainMember.id });
    inserted.forEach((row, i) => {
      previousMember[slots[i]!.chain]![slots[i]!.branch] = row.id;
    });
    memberCount += inserted.length;
  }

  console.log(
    `Seeded "${MAP_NAME}" (map ${mapId}, owner ${ownerCharacterId}): ` +
      `${systemRows.length} systems, ${connectionRows.length} connections, ` +
      `${sigValues.length} signatures, ${chainRows.length} chains, ${memberCount} members.`,
  );
}

main()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('Seed failed:', err);
    await pool.end();
    process.exit(1);
  });
