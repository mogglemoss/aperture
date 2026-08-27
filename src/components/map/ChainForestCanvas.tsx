'use client';

import { useEffect, useRef } from 'react';
import {
  Background,
  Controls,
  ReactFlow,
  type Edge,
  type Node,
  type ReactFlowInstance,
} from '@xyflow/react';
import { SystemNode, type SystemNodeData } from './SystemNode';
import { ChainPointerNode, type ChainPointerNodeData } from './ChainPointerNode';
import { ChainBlobNode, type ChainBlobNodeData, ChainLabelNode, type ChainLabelNodeData } from './ChainBlobNode';
import { ConnectionEdge } from './ConnectionEdge';
import { CHAIN_TILE_PARAMS, type ChainFocusRequest } from './ChainCanvas';

// All-tab forest canvas (nomadic-chains Stage 5): every visible chain side by
// side (shelf rows), with per-chain blob collapse. Positions come entirely from
// the layout engine — nodes are not draggable, and there is no charting here
// (connection draws belong to the chain tabs and the free canvas). Read-mostly:
// the LOD blobs are what keep pan smooth at WDS scale.

/** Inter-block shelf gap — wider than the sibling gaps so chains read as separate blocks. */
export const CHAIN_FOREST_BLOCK_GAP = { x: 90, y: 80 };

/** Vertical offset of a block's caption above its block origin. */
export const CHAIN_FOREST_LABEL_OFFSET = 26;

export type ChainForestCanvasNode =
  | Node<SystemNodeData>
  | Node<ChainPointerNodeData>
  | Node<ChainBlobNodeData>
  | Node<ChainLabelNodeData>;

const nodeTypes = {
  system: SystemNode,
  chainPointer: ChainPointerNode,
  chainBlob: ChainBlobNode,
  chainLabel: ChainLabelNode,
};
const edgeTypes = { connection: ConnectionEdge };

export function ChainForestCanvas({
  nodes,
  edges,
  focus,
  onNodeClick,
  onNodeDoubleClick,
  onEdgeClick,
  onPaneClick,
  onNodeContextMenu,
  onEdgeContextMenu,
  onPaneContextMenu,
  onZoom,
}: {
  nodes: ChainForestCanvasNode[];
  edges: Edge[];
  /** Center the viewport on this system's occurrence or unassigned tile (jump-to-system). */
  focus: ChainFocusRequest | null;
  onNodeClick: (event: React.MouseEvent, node: Node) => void;
  /** Blob / caption double-click opens that chain's tab. */
  onNodeDoubleClick: (event: React.MouseEvent, node: Node) => void;
  onEdgeClick: (event: React.MouseEvent, edge: Edge) => void;
  onPaneClick: () => void;
  onNodeContextMenu: (event: React.MouseEvent, node: Node) => void;
  onEdgeContextMenu: (event: React.MouseEvent, edge: Edge) => void;
  onPaneContextMenu: (event: MouseEvent | React.MouseEvent) => void;
  /** Reports the live canvas zoom (every move) — feeds the blob-collapse decision. */
  onZoom: (zoom: number) => void;
}) {
  const instRef = useRef<ReactFlowInstance<ChainForestCanvasNode, Edge> | null>(null);
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

  // Focus on token change. Runs every render, gated by the token (see
  // ChainCanvas); the mount-time request is handled in onInit instead.
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
      onNodeDoubleClick={onNodeDoubleClick}
      onEdgeClick={onEdgeClick}
      onPaneClick={onPaneClick}
      onNodeContextMenu={onNodeContextMenu}
      onEdgeContextMenu={onEdgeContextMenu}
      onPaneContextMenu={onPaneContextMenu}
      onInit={(inst) => {
        instRef.current = inst;
        // A focus request pending at mount wins over the initial fitView; then
        // report the fitted zoom so the collapse decision starts truthful.
        if (focus && focus.token !== appliedFocusToken.current) applyFocus(focus);
        onZoom(inst.getZoom());
      }}
      onMove={(_event, viewport) => onZoom(viewport.zoom)}
      nodesDraggable={false}
      nodesConnectable={false}
      deleteKeyCode={null}
      zoomOnDoubleClick={false}
      edgesFocusable
      colorMode="dark"
      fitView
      minZoom={0.05}
      zoomOnScroll={false}
      preventScrolling={false}
      proOptions={{ hideAttribution: true }}
    >
      <Background />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}
