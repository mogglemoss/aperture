/**
 * Pure LOD collapse decision for chain mode (nomadic-chains): when does a
 * chain render as a labeled blob instead of its full tree? No `server-only`,
 * no DB, no React. Also carries the blob content contract Stage 5's renderer
 * consumes.
 */

/**
 * Zoom cutoff below which every chain is a blob regardless of size or
 * override — individual tiles are illegible that far out.
 */
export const CHAIN_BLOB_ZOOM_CUTOFF = 0.35;

export type ChainCollapseInput = {
  /** Real occurrences in the chain (pointer-leaves excluded). */
  systemCount: number;
  /** Current canvas zoom (1 = 100%). */
  zoom: number;
  /** The viewer's `ap_user.chain_blob_threshold` (default 15). */
  threshold: number;
  /** Session-local "keep this chain expanded" toggle (the blob's expand affordance). */
  expandedOverride: boolean;
};

/**
 * True ⇔ the chain renders as a blob. Precedence: below
 * `CHAIN_BLOB_ZOOM_CUTOFF` every chain is a blob (the override does not
 * apply); at or above it, a chain blobs when `systemCount > threshold` unless
 * `expandedOverride` is set.
 */
export function shouldCollapseChain(input: ChainCollapseInput): boolean {
  if (input.zoom < CHAIN_BLOB_ZOOM_CUTOFF) return true;
  return input.systemCount > input.threshold && !input.expandedOverride;
}

/** One k-space exit bucket of a blob's summary, e.g. `{ securityClass: 'HS', count: 5 }`. */
export type ChainBlobExit = {
  /** Security-class label (`HS` / `LS` / `NS` / …). */
  securityClass: string;
  count: number;
};

/**
 * What a collapsed chain's blob displays (the Stage 5 render contract): chain
 * name, system count, k-space exit summary grouped by security class, and the
 * presence of rally / EOL-critical flags anywhere in the chain.
 */
export type ChainBlobContent = {
  chainId: string;
  name: string;
  /** Real occurrences (pointer-leaves excluded). */
  systemCount: number;
  /** K-space exits grouped by security class; empty for a chain with none. */
  exits: ChainBlobExit[];
  /** A rally point is set on some member system. */
  hasRally: boolean;
  /** Some connection inside the chain is EOL-critical. */
  hasEolCritical: boolean;
};

/** The blob's summary line, e.g. `34 systems · 5 HS · 2 LS`. */
export function formatChainBlobLine(content: ChainBlobContent): string {
  const parts = [`${content.systemCount} ${content.systemCount === 1 ? 'system' : 'systems'}`];
  for (const exit of content.exits) parts.push(`${exit.count} ${exit.securityClass}`);
  return parts.join(' · ');
}
