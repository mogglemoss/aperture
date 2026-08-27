'use client';

import type { NodeProps } from '@xyflow/react';
import { ArrowUpRight, Repeat2 } from 'lucide-react';

// Terminal pointer-leaf pill in chain mode (nomadic-chains). A cross-link whose
// far side already belongs to a chain never unfolds recursively — it renders as
// this pill ("continues in <chain>" / "loops to <system>"). Clicking it is
// handled by MapCanvas's chain-mode node-click handler (switch to the target
// chain's tab focused on the target system); the node itself is presentational.

export type ChainPointerNodeData = {
  memberId: string;
  targetChainId: string;
  /** Null when the target chain isn't visible to the viewer (rendered "another chain"). */
  targetChainName: string | null;
  /** True ⇔ the pointer loops back into its own chain. */
  isLoop: boolean;
  targetMapSystemId: string;
  targetSystemName: string;
};

export function ChainPointerNode({ data }: NodeProps & { data: ChainPointerNodeData }) {
  const Icon = data.isLoop ? Repeat2 : ArrowUpRight;
  const label = data.isLoop
    ? `loops to ${data.targetSystemName}`
    : `continues in ${data.targetChainName ?? 'another chain'}`;
  const title = data.isLoop
    ? `Loops back to ${data.targetSystemName} in this chain`
    : `Continues in ${data.targetChainName ?? 'another chain'} at ${data.targetSystemName}`;
  return (
    <div
      className="flex max-w-56 cursor-pointer items-center gap-1 rounded-full border border-dashed border-muted-foreground/50 bg-map-node px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-foreground/60 hover:text-foreground"
      title={title}
    >
      <Icon className="size-3.5 shrink-0" />
      <span className="truncate">{label}</span>
    </div>
  );
}
