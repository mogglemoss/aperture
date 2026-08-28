'use client';

import { useState } from 'react';
import {
  Background,
  ReactFlow,
  type Edge,
  type Node,
} from '@xyflow/react';
import { Layers, User, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatChainDistanceTooltip } from '@/lib/map/chains/distance';
import { SystemNode } from '../SystemNode';
import { ChainPointerNode } from '../ChainPointerNode';
import { ConnectionEdge } from '../ConnectionEdge';
import { ALL_CHAINS_TAB } from '../ChainTabStrip';
import type { ChainCanvasNode } from '../ChainCanvas';
import { ChainCardList, ChainDrawer } from './ChainDrawer';
import { NodeActionSheet } from './NodeActionSheet';
import type { SystemNoteFormValues } from '@/components/sidebar/SystemNotesModule';
import type { KeyboardActionContext } from '@/lib/map/keyboardActions';
import type { ChainDistanceBadge, MapSystemNode, MobileChainCard, SystemNote } from '@/types';

// Phone-width chain mode (nomadic-chains): a full-screen single-chain tree
// with a bottom-sheet chain drawer, swapped in for the whole dashboard while
// chain-land is active at the `sm` breakpoint. The tree is the same
// `buildChainCanvas` derivation as the desktop tab, built by MapCanvas with
// the touch-sized `MOBILE_CHAIN_TILE_PARAMS` and root-top forced (phones are
// portrait; the orientation preference is a desktop concern). The "All" tab
// renders the chain-card list, never a rendered forest.

const nodeTypes = { system: SystemNode, chainPointer: ChainPointerNode };
const edgeTypes = { connection: ConnectionEdge };

export function MobileChainView({
  activeChainId,
  chainName,
  cards,
  distances,
  nodes,
  edges,
  onSelectChain,
  onNodeClick,
  onEdgeClick,
  onPaneClick,
  selectedSystem,
  sheetContext,
  selectedSystemNotes,
  onAddNote,
  onClearSelection,
}: {
  /** The open chain's id, or `ALL_CHAINS_TAB` (never null — null is the dashboard). */
  activeChainId: string;
  /** Resolved name of the open chain; null on the All tab. */
  chainName: string | null;
  /** Drawer / All-list cards, in tab order. */
  cards: MobileChainCard[];
  /** Chains-near-me badges; undefined ⇒ unknown, hidden. */
  distances?: Record<string, ChainDistanceBadge | null>;
  /** Pre-built xyflow nodes for the open chain (empty on the All tab). */
  nodes: ChainCanvasNode[];
  edges: Edge[];
  /** null = Free canvas (back to the dashboard); `ALL_CHAINS_TAB` = All; else a chain id. */
  onSelectChain: (chainId: string | null) => void;
  /** Chain-mode selection handler (occurrence → canonical system; pointer → chain switch). */
  onNodeClick: (event: React.MouseEvent, node: Node) => void;
  onEdgeClick: (event: React.MouseEvent, edge: Edge) => void;
  onPaneClick: () => void;
  /** The selected canonical system — a tree tap opens the `NodeActionSheet` on it. */
  selectedSystem: MapSystemNode | null;
  /** Action context for the sheet: `selectedConnection` is the occurrence's INBOUND connection. */
  sheetContext: KeyboardActionContext;
  /** Global system notes for the selected system, newest first. */
  selectedSystemNotes: SystemNote[];
  /** Add a note to the selected system. */
  onAddNote: (values: SystemNoteFormValues) => void;
  /** Clear the canonical selection (sheet dismissed). */
  onClearSelection: () => void;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isAll = activeChainId === ALL_CHAINS_TAB;
  const activeCard = isAll ? null : (cards.find((c) => c.chainId === activeChainId) ?? null);
  const KindIcon = activeCard?.kind === 'shared' ? Users : User;
  const badge = !isAll && distances !== undefined ? (distances[activeChainId] ?? null) : undefined;

  return (
    <div className="bg-background fixed inset-0 z-40 flex flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b px-3">
        <div className="flex min-w-0 items-center gap-1.5">
          {isAll ? (
            <Layers className="text-muted-foreground size-4 shrink-0" />
          ) : (
            <KindIcon className="text-muted-foreground size-4 shrink-0" />
          )}
          <span className="truncate text-sm font-medium">
            {isAll ? 'All chains' : (chainName ?? '')}
          </span>
          {badge !== undefined && (
            <span
              className="shrink-0 rounded bg-foreground/10 px-1 text-[10px] tabular-nums leading-4"
              title={formatChainDistanceTooltip(badge)}
            >
              {badge ? `${badge.jumps}j` : '—'}
            </span>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => setDrawerOpen(true)}>
          <Layers />
          Chains
        </Button>
      </header>
      {isAll ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <ChainCardList
            cards={cards}
            activeChainId={null}
            distances={distances}
            onSelect={onSelectChain}
          />
        </div>
      ) : (
        <div className="min-h-0 flex-1">
          {/* Keyed by chain id so switching chains refits the new tree. Touch
              pan/pinch are xyflow defaults (panOnDrag / zoomOnPinch); unlike
              the desktop canvases, page scrolling is suppressed over the pane
              (there is no page to scroll — the view is full-screen). */}
          <ReactFlow
            key={activeChainId}
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            onPaneClick={onPaneClick}
            nodesDraggable={false}
            nodesConnectable={false}
            deleteKeyCode={null}
            minZoom={0.1}
            colorMode="dark"
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background />
          </ReactFlow>
        </div>
      )}
      <ChainDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        cards={cards}
        activeChainId={activeChainId}
        distances={distances}
        onSelect={onSelectChain}
      />
      {/* Light charting (Stage 8b): tapping an occurrence opens the action
          sheet. Gated off on the All card list — a selection lingering from a
          previous tab must not open a sheet over the cards. */}
      <NodeActionSheet
        system={isAll ? null : selectedSystem}
        context={sheetContext}
        notes={selectedSystemNotes}
        onAddNote={onAddNote}
        onClose={onClearSelection}
      />
    </div>
  );
}
