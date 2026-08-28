/**
 * Chains-near-me distance reducer (nomadic-chains): pure gate-jump distance
 * math — plain adjacency maps in, per-chain minima out. Distance is
 * **unweighted gate jumps for orientation**; the route module owns
 * safety-weighted actual routing. No `server-only`, no DB, no React — the
 * chain-distances API route feeds it the memoized gate adjacency, and client
 * components import only the types + display helper.
 */

/** One viewer-visible chain reduced to its k-space member systems ("exits", EVE solar-system ids). */
export type ChainExitSet = {
  chainId: string;
  /** In member (creation) order — the nearest-exit tie-break is first-listed. */
  exitSystemIds: readonly number[];
};

/**
 * The chain-distances endpoint payload: gate jumps from the viewer's pilot to
 * every chain the viewer can see. `originSystemId` null ⇔ distances are
 * unknown (no located pilot, or a J-space pilot outside every visible chain)
 * and the badges hide; a `distances` value of null ⇔ the chain has no
 * gate-reachable k-space exit and renders "—", never 0.
 */
export type ChainDistances = {
  /** The pilot the distances are measured from (the viewer's active character). */
  characterId: number;
  originSystemId: number | null;
  /** Gate jumps per viewer-visible chain id. */
  distances: Record<string, number | null>;
  /** EVE solar-system id of each chain's nearest exit; null exactly where `distances` is null. */
  nearestExits: Record<string, number | null>;
};

/** Display slice for one chain's badge: the jump count + the resolved nearest-exit name. */
export type ChainDistanceBadge = {
  jumps: number;
  /** Null when the exit system isn't resolvable client-side. */
  exitName: string | null;
};

/**
 * K-space test on the `universe_system.security` label (`H`, `L`, `0.0`,
 * `C1`…`C25`, `P`, `A`): everything but the `C*` J-space classes counts —
 * the same rule the blob's exit summary uses.
 */
export function isKspaceSecurity(security: string | null): boolean {
  return security != null && !security.startsWith('C');
}

/**
 * Multi-source BFS: gate-jump distance from the nearest of `origins` to every
 * reachable system. Every origin seeds the queue at distance 0, so one O(V+E)
 * pass answers min-over-pairs for every chain at once. Unreachable systems are
 * absent from the result; unknown origins (not in the adjacency) still seed at
 * 0 so an exit equal to an origin is always distance 0.
 */
export function multiSourceGateBfs(
  adjacency: ReadonlyMap<number, readonly number[]>,
  origins: readonly number[],
): Map<number, number> {
  const dist = new Map<number, number>();
  const queue: number[] = [];
  for (const origin of origins) {
    if (dist.has(origin)) continue;
    dist.set(origin, 0);
    queue.push(origin);
  }
  let head = 0;
  while (head < queue.length) {
    const current = queue[head++]!;
    const currentDist = dist.get(current)!;
    for (const next of adjacency.get(current) ?? []) {
      if (!dist.has(next)) {
        dist.set(next, currentDist + 1);
        queue.push(next);
      }
    }
  }
  return dist;
}

/**
 * The pilot's origin set for the BFS. In k-space the origin is the pilot's own
 * system. In J-space it is the k-space exits of every visible chain holding
 * the pilot's current system as a real member (min over pairs falls out of the
 * multi-source seed); an empty result ⇔ distances are unknown.
 */
export function resolveOriginSystemIds(args: {
  pilotSystemId: number;
  pilotIsKspace: boolean;
  /** Ids of the visible chains holding the pilot's system as a real occurrence. */
  containingChainIds: ReadonlySet<string>;
  chains: readonly ChainExitSet[];
}): number[] {
  const { pilotSystemId, pilotIsKspace, containingChainIds, chains } = args;
  if (pilotIsKspace) return [pilotSystemId];
  const origins = new Set<number>();
  for (const chain of chains) {
    if (!containingChainIds.has(chain.chainId)) continue;
    for (const exit of chain.exitSystemIds) origins.add(exit);
  }
  return [...origins];
}

/**
 * The reducer: one multi-source BFS over the gate adjacency, then per chain
 * the min over its exits. A chain with no exits — or none gate-reachable from
 * the origin set — reduces to null (rendered "—", never 0). `nearestExits`
 * carries the argmin exit (ties break to the first-listed exit).
 */
export function computeChainDistances(args: {
  adjacency: ReadonlyMap<number, readonly number[]>;
  originSystemIds: readonly number[];
  chains: readonly ChainExitSet[];
}): { distances: Record<string, number | null>; nearestExits: Record<string, number | null> } {
  const dist = multiSourceGateBfs(args.adjacency, args.originSystemIds);
  const distances: Record<string, number | null> = {};
  const nearestExits: Record<string, number | null> = {};
  for (const chain of args.chains) {
    let best: number | null = null;
    let bestExit: number | null = null;
    for (const exit of chain.exitSystemIds) {
      const d = dist.get(exit);
      if (d === undefined) continue;
      if (best === null || d < best) {
        best = d;
        bestExit = exit;
      }
    }
    distances[chain.chainId] = best;
    nearestExits[chain.chainId] = bestExit;
  }
  return { distances, nearestExits };
}

/** Badge tooltip: "N jumps to <exit> via gates", or the no-exit explanation for a "—" badge. */
export function formatChainDistanceTooltip(badge: ChainDistanceBadge | null): string {
  if (!badge) return 'No k-space exit — unreachable by gates';
  const exit = badge.exitName ?? 'the nearest k-space exit';
  return `${badge.jumps} jump${badge.jumps === 1 ? '' : 's'} to ${exit} via gates`;
}
