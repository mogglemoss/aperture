'use client';

import { useEffect, useRef } from 'react';
import {
  Background,
  ConnectionMode,
  Controls,
  ReactFlow,
  type Connection,
  type Edge,
  type Node,
  type ReactFlowInstance,
} from '@xyflow/react';
import type { ChainLayoutParams } from '@/types';
import { SystemNode, type SystemNodeData } from './SystemNode';
import { ChainPointerNode, type ChainPointerNodeData } from './ChainPointerNode';
import { ConnectionEdge } from './ConnectionEdge';

// Chain-mode canvas (nomadic-chains): renders ONE chain's generated tree.
// Positions come entirely from the layout engine — nodes are not draggable and
// there is no viewport persistence (fitView on every tab open). The free-canvas
// ReactFlow in MapCanvas is untouched; this is the parallel render path a chain
// tab swaps in.

/**
 * Tile/gap dimensions fed to the layout engine, in LOGICAL (breadth × depth)
 * terms — `nodeW`/`gapX` along the breadth axis, `nodeH`/`gapY` along depth,
 * transposed by the layout per orientation (do not pre-swap). Sized for the
 * SystemNode tile footprint; pointer pills are smaller.
 */
export const CHAIN_TILE_PARAMS: ChainLayoutParams = {
  nodeW: 230,
  nodeH: 70,
  gapX: 30,
  gapY: 50,
  pointerW: 190,
  pointerH: 40,
};

export type ChainCanvasNode = Node<SystemNodeData> | Node<ChainPointerNodeData>;

/** A one-shot "center on this system" request; a new token re-triggers. */
export type ChainFocusRequest = { token: number; mapSystemId: string };

const nodeTypes = { system: SystemNode, chainPointer: ChainPointerNode };
const edgeTypes = { connection: ConnectionEdge };

export function ChainCanvas({
  nodes,
  edges,
  focus,
  onNodeClick,
  onEdgeClick,
  onPaneClick,
  onConnect,
  onNodeContextMenu,
  onEdgeContextMenu,
  onPaneContextMenu,
}: {
  nodes: ChainCanvasNode[];
  edges: Edge[];
  /** Center the viewport on this system's occurrence (pointer navigation, jump-to-system). */
  focus: ChainFocusRequest | null;
  onNodeClick: (event: React.MouseEvent, node: Node) => void;
  onEdgeClick: (event: React.MouseEvent, edge: Edge) => void;
  onPaneClick: () => void;
  onConnect: (params: Connection) => void;
  onNodeContextMenu: (event: React.MouseEvent, node: Node) => void;
  onEdgeContextMenu: (event: React.MouseEvent, edge: Edge) => void;
  onPaneContextMenu: (event: MouseEvent | React.MouseEvent) => void;
}) {
  const instRef = useRef<ReactFlowInstance<ChainCanvasNode, Edge> | null>(null);
  const appliedFocusToken = useRef(0);

  const applyFocus = (f: ChainFocusRequest) => {
    const inst = instRef.current;
    if (!inst) return;
    const node = nodes.find(
      (n) => n.type === 'system' && (n.data as SystemNodeData).id === f.mapSystemId,
    );
    if (!node) return;
    appliedFocusToken.current = f.token;
    const w = node.measured?.width ?? CHAIN_TILE_PARAMS.nodeW;
    const h = node.measured?.height ?? CHAIN_TILE_PARAMS.nodeH;
    void inst.setCenter(node.position.x + w / 2, node.position.y + h / 2, {
      zoom: 1,
      duration: 0,
    });
  };

  // Focus on token change. Runs every render, gated by the token, so it needs
  // no dependency list; the mount-time request is handled in onInit instead
  // (the instance isn't ready before then).
  useEffect(() => {
    if (focus && instRef.current && focus.token !== appliedFocusToken.current) applyFocus(focus);
  });

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodeClick={onNodeClick}
      onEdgeClick={onEdgeClick}
      onPaneClick={onPaneClick}
      onNodeContextMenu={onNodeContextMenu}
      onEdgeContextMenu={onEdgeContextMenu}
      onPaneContextMenu={onPaneContextMenu}
      onConnect={onConnect}
      onInit={(inst) => {
        instRef.current = inst;
        // A focus request pending at mount (pointer navigation just switched
        // tabs) wins over the initial fitView.
        if (focus && focus.token !== appliedFocusToken.current) applyFocus(focus);
      }}
      nodesDraggable={false}
      nodesConnectable
      connectionMode={ConnectionMode.Loose}
      deleteKeyCode={null}
      edgesFocusable
      colorMode="dark"
      fitView
      zoomOnScroll={false}
      preventScrolling={false}
      proOptions={{ hideAttribution: true }}
    >
      <Background />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}
