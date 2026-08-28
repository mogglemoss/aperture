'use client';

import { Flag, Hourglass, Layers, Map as MapIcon, User, Users } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { formatChainDistanceTooltip } from '@/lib/map/chains/distance';
import { ALL_CHAINS_TAB } from '../ChainTabStrip';
import type { ChainDistanceBadge, ChainKind, MobileChainCard } from '@/types';

// Mobile chain switcher (nomadic-chains): a bottom-sheet drawer of chain
// cards, replacing the desktop tab strip at phone width. The same card list
// also renders as the "All" tab's main content (a card list, never a rendered
// forest — no 1000-node canvas on a phone).

function DistanceBadge({ badge }: { badge: ChainDistanceBadge | null }) {
  return (
    <span
      className="shrink-0 rounded bg-foreground/10 px-1 text-[10px] tabular-nums leading-4"
      title={formatChainDistanceTooltip(badge)}
    >
      {badge ? `${badge.jumps}j` : '—'}
    </span>
  );
}

function kindIcon(kind: ChainKind) {
  return kind === 'shared' ? Users : User;
}

/**
 * The chain-card list: one tappable card per visible chain (name, kind icon,
 * blob summary line, distance badge, rally / EOL-critical flags). Rendered
 * inside the drawer and as the All tab's full-screen content.
 */
export function ChainCardList({
  cards,
  activeChainId,
  distances,
  onSelect,
}: {
  /** In tab order (shared first, then personal, by creation). */
  cards: MobileChainCard[];
  /** Highlights the open chain's card; `ALL_CHAINS_TAB` or null highlights none. */
  activeChainId: string | null;
  /** Chains-near-me badges; undefined ⇒ unknown, every badge hidden. */
  distances?: Record<string, ChainDistanceBadge | null>;
  onSelect: (chainId: string) => void;
}) {
  if (cards.length === 0) {
    return (
      <div className="text-muted-foreground px-4 py-6 text-center text-sm">
        No chains yet. Create one from a desktop browser.
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {cards.map((card) => {
        const KindIcon = kindIcon(card.kind);
        const active = card.chainId === activeChainId;
        return (
          <li key={card.chainId}>
            <button
              type="button"
              onClick={() => onSelect(card.chainId)}
              className={`flex min-h-14 w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors ${
                active
                  ? 'border-primary bg-accent/40'
                  : 'border-foreground/10 hover:bg-accent/40'
              }`}
            >
              <KindIcon className="text-muted-foreground size-4 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-medium">{card.name}</span>
                  {distances !== undefined && <DistanceBadge badge={distances[card.chainId] ?? null} />}
                  {card.hasRally && (
                    <Flag className="size-3.5 shrink-0 text-amber-400" aria-label="Rally point active" />
                  )}
                  {card.hasEolCritical && (
                    <Hourglass
                      className="size-3.5 shrink-0 text-red-400"
                      aria-label="EOL-critical connection"
                    />
                  )}
                </span>
                <span className="text-muted-foreground block truncate text-xs">
                  {card.summaryLine}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The bottom-sheet chain switcher. Beyond the chain cards it carries the two
 * mode rows: "All chains" (the `ALL_CHAINS_TAB` sentinel — opens the card-list
 * view) and "Canvas" (null — leaves the mobile chain view for the stacked
 * dashboard's free canvas).
 */
export function ChainDrawer({
  open,
  onOpenChange,
  cards,
  activeChainId,
  distances,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cards: MobileChainCard[];
  /** The open chain's id, or `ALL_CHAINS_TAB`. */
  activeChainId: string;
  distances?: Record<string, ChainDistanceBadge | null>;
  /** null = Free canvas (back to the dashboard); `ALL_CHAINS_TAB` = the All card list. */
  onSelect: (chainId: string | null) => void;
}) {
  const pick = (chainId: string | null) => {
    onOpenChange(false);
    onSelect(chainId);
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[70dvh] gap-0">
        <SheetHeader className="pb-2">
          <SheetTitle>Chains</SheetTitle>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
          <div className="mb-2 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => pick(ALL_CHAINS_TAB)}
              className={`flex min-h-11 w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors ${
                activeChainId === ALL_CHAINS_TAB
                  ? 'border-primary bg-accent/40'
                  : 'border-foreground/10 hover:bg-accent/40'
              }`}
            >
              <Layers className="text-muted-foreground size-4 shrink-0" />
              All chains
            </button>
            <button
              type="button"
              onClick={() => pick(null)}
              className="border-foreground/10 hover:bg-accent/40 flex min-h-11 w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors"
            >
              <MapIcon className="text-muted-foreground size-4 shrink-0" />
              Canvas
            </button>
          </div>
          <ChainCardList
            cards={cards}
            activeChainId={activeChainId}
            distances={distances}
            onSelect={pick}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
