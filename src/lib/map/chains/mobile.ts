/**
 * Mobile chain-view support (nomadic-chains): the phone-breakpoint gate
 * decision, touch-sized layout params, and the chain-card derivation the
 * mobile drawer and All card list render. No `server-only`, no DB, no React —
 * `MapCanvas` and the mobile components consume it, and unit tests exercise it
 * directly.
 */

import type { ChainKind, ChainLayoutParams, MapChain, MapChainMember, MapSystemNode } from '@/types';
import { buildChainBlobContent } from './view';
import { formatChainBlobLine } from './collapse';

/**
 * Layout params for the phone-width single-chain tree, in the same logical
 * (breadth × depth) terms as `CHAIN_TILE_PARAMS` (never pre-swapped per
 * orientation). Tiles keep the `SystemNode` footprint; the gaps are widened so
 * adjacent tiles stay comfortably apart for touch, and the pointer pill's
 * depth extent meets the 44px touch-target floor.
 */
export const MOBILE_CHAIN_TILE_PARAMS: ChainLayoutParams = {
  nodeW: 230,
  nodeH: 70,
  gapX: 60,
  gapY: 90,
  pointerW: 190,
  pointerH: 44,
};

/**
 * The mobile-view gate: true ⇔ the viewport is phone-width AND the viewer is
 * in chain-land (a chain tab or the All sentinel). The free canvas
 * (`activeChainId === null`) NEVER gates mobile — free-canvas mode at phone
 * width keeps the stacked dashboard untouched. Callers pass the *resolved*
 * tab, so a stored id naming a vanished chain (already resolved to null)
 * falls back to the dashboard like it does on desktop.
 */
export function isMobileChainView(
  activeChainId: string | null,
  isPhoneViewport: boolean,
): boolean {
  return isPhoneViewport && activeChainId !== null;
}

/** One chain card in the mobile drawer / All card list. */
export type MobileChainCard = {
  chainId: string;
  name: string;
  kind: ChainKind;
  /** Real occurrences (pointer-leaves excluded). */
  systemCount: number;
  /** The blob summary line, e.g. `34 systems · 5 HS · 2 LS`. */
  summaryLine: string;
  hasRally: boolean;
  hasEolCritical: boolean;
};

/**
 * Derive the drawer's chain cards from view data — one card per given chain,
 * in the given (tab) order, reusing the blob-content derivation so the card
 * summary matches the forest blob exactly. Empty chains keep their card ("0
 * systems") — the card is the affordance for opening them, as the tab is on
 * desktop. Distance badges are NOT part of the card: they join at render from
 * the same `chainDistanceBadges` record every other surface consumes.
 */
export function buildMobileChainCards(args: {
  /** Viewer-visible chains, pre-sorted in tab order (`sortChainsForTabs`). */
  chains: readonly MapChain[];
  members: readonly MapChainMember[];
  systems: readonly MapSystemNode[];
  /** Ids of connections currently EOL-critical in the view. */
  criticalConnectionIds: ReadonlySet<string>;
}): MobileChainCard[] {
  const { chains, members, systems, criticalConnectionIds } = args;
  return chains.map((chain) => {
    const content = buildChainBlobContent({ chain, members, systems, criticalConnectionIds });
    return {
      chainId: chain.id,
      name: chain.name,
      kind: chain.kind,
      systemCount: content.systemCount,
      summaryLine: formatChainBlobLine(content),
      hasRally: content.hasRally,
      hasEolCritical: content.hasEolCritical,
    };
  });
}
