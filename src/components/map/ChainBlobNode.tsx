'use client';

import type { NodeProps } from '@xyflow/react';
import { Flag, Hourglass, Maximize2, Minimize2, User, Users } from 'lucide-react';
import { formatChainBlobLine } from '@/lib/map/chains/collapse';
import { formatChainDistanceTooltip } from '@/lib/map/chains/distance';
import type { ChainBlobContent, ChainDistanceBadge, ChainKind } from '@/types';

// All-view LOD nodes (nomadic-chains Stage 5): a collapsed chain's labeled
// blob, and the caption above an expanded chain block / the "Unassigned" grid.
// Click/double-click behaviour (select chain, open its tab) lives in
// MapCanvas's forest handlers; only the expand/collapse affordance acts here.

export type ChainBlobNodeData = {
  content: ChainBlobContent;
  width: number;
  height: number;
  /** False below the zoom cutoff, where the expand override does not apply. */
  expandable: boolean;
  kind: ChainKind;
  /**
   * Chains-near-me gate jumps (undefined ⇒ unknown, badge hidden; null ⇒ no
   * gate-reachable k-space exit, "—"). Derived per render, not part of the
   * blob content contract.
   */
  distance?: ChainDistanceBadge | null;
  onToggleExpand: (chainId: string) => void;
};

export function ChainBlobNode({ data, selected }: NodeProps & { data: ChainBlobNodeData }) {
  const { content } = data;
  const KindIcon = data.kind === 'shared' ? Users : User;
  return (
    <div
      className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed bg-map-node/80 px-3 py-2 transition-colors ${
        selected
          ? 'border-primary'
          : 'border-muted-foreground/40 hover:border-foreground/60'
      }`}
      style={{ width: data.width, height: data.height }}
      title={`${content.name} — ${formatChainBlobLine(content)}`}
    >
      <div className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-foreground">
        <KindIcon className="size-3.5 shrink-0 opacity-70" />
        <span className="truncate">{content.name}</span>
        {data.expandable && (
          <button
            type="button"
            className="nodrag nopan ml-1 flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
            title="Expand this chain"
            aria-label={`Expand ${content.name}`}
            onClick={(e) => {
              e.stopPropagation();
              data.onToggleExpand(content.chainId);
            }}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            <Maximize2 className="size-3.5" />
          </button>
        )}
      </div>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span>{formatChainBlobLine(content)}</span>
        {data.distance !== undefined && (
          <span
            className="shrink-0 rounded bg-foreground/10 px-1 text-[10px] tabular-nums leading-4"
            title={formatChainDistanceTooltip(data.distance)}
          >
            {data.distance ? `${data.distance.jumps}j` : '—'}
          </span>
        )}
        {content.hasRally && (
          <Flag className="size-3.5 shrink-0 text-amber-400" aria-label="Rally point active" />
        )}
        {content.hasEolCritical && (
          <Hourglass
            className="size-3.5 shrink-0 text-red-400"
            aria-label="EOL-critical connection"
          />
        )}
      </div>
    </div>
  );
}

export type ChainLabelNodeData = {
  /** Null ⇔ the "Unassigned" block caption. */
  chainId: string | null;
  label: string;
  kind: ChainKind | null;
  /** Offers the re-collapse affordance (the chain is expanded only by the session override). */
  collapsible: boolean;
  maxWidth: number;
  onToggleExpand: (chainId: string) => void;
};

export function ChainLabelNode({ data }: NodeProps & { data: ChainLabelNodeData }) {
  const KindIcon = data.kind === 'shared' ? Users : data.kind === 'personal' ? User : null;
  return (
    <div
      className={`flex items-center gap-1.5 text-xs font-medium text-muted-foreground ${
        data.chainId ? 'cursor-pointer hover:text-foreground' : ''
      }`}
      style={{ maxWidth: data.maxWidth }}
    >
      {KindIcon && <KindIcon className="size-3 shrink-0 opacity-70" />}
      <span className="truncate">{data.label}</span>
      {data.chainId && data.collapsible && (
        <button
          type="button"
          className="nodrag nopan flex size-4 shrink-0 items-center justify-center rounded hover:bg-accent hover:text-foreground"
          title="Collapse this chain to its blob"
          aria-label={`Collapse ${data.label}`}
          onClick={(e) => {
            e.stopPropagation();
            if (data.chainId) data.onToggleExpand(data.chainId);
          }}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <Minimize2 className="size-3" />
        </button>
      )}
    </div>
  );
}
