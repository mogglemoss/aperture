'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Background,
  ConnectionMode,
  Controls,
  ReactFlow,
  SelectionMode,
  applyNodeChanges,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type OnSelectionChangeParams,
  type ReactFlowInstance,
  type Viewport,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { arrayMove } from '@dnd-kit/sortable';
import type { Layout, ResponsiveLayouts } from 'react-grid-layout';
import type {
  Breakpoint,
  ChainDistanceBadge,
  ChainDistances,
  ChainKind,
  ChainLayoutOrientation,
  ConnectionEnd,
  LiveShareBadge,
  MapCapability,
  MapContextMenuTarget,
  MapEventPayload,
  MapLayoutConfig,
  MapSettings,
  MapSignature,
  MapSystemNode,
  MapViewData,
  PanelGroup,
  PanelId,
  RouteDestinationView,
  RoutePrefs,
  SignatureIndicatorPrefs,
  SigSearchFilters,
  StructureIntel,
  SystemNote,
} from '@/types';
import type { SystemStatsSummary } from '@/lib/map/stats';
import type { SystemIntelSummary } from '@/lib/map/intel';
import { applyEvent } from '@/lib/map/applyEvent';
import {
  GRID_SIZE,
  MANUAL_SLOT,
  findOpenPosition,
  overlaps,
  snapToGrid as snapPointToGrid,
  type Point,
} from '@/lib/map/placement';
import { buildChainCanvas, buildForestCanvas, sortChainsForTabs } from '@/lib/map/chains/view';
import { CHAIN_BLOB_ZOOM_CUTOFF } from '@/lib/map/chains/collapse';
import {
  MOBILE_CHAIN_TILE_PARAMS,
  buildMobileChainCards,
  isMobileChainView,
  resolveInboundConnectionId,
} from '@/lib/map/chains/mobile';
import {
  addSystemOnServer,
  createChainOnServer,
  createConnectionOnServer,
  createSignatureOnServer,
  deleteChainOnServer,
  deleteConnectionOnServer,
  deleteDisconnectedOnServer,
  deleteSignatureOnServer,
  deleteSubchainOnServer,
  restoreConnectionOnServer,
  fetchChainDistances,
  fetchMapSnapshot,
  fetchSystemData,
  fetchSystemSignatures,
  pingSystemOnServer,
  removeSystemOnServer,
  renameChainOnServer,
  updateConnectionOnServer,
  updateSignatureOnServer,
  updateSystemOnServer,
  addNoteOnServer,
  updateNoteOnServer,
  deleteNoteOnServer,
  type CreateSignatureBody,
  type UpdateConnectionBody,
  type UpdateNoteBody,
  type UpdateSignatureBody,
  type UpdateSystemBody,
} from '@/lib/map/client';
import { computeDisconnected, computeSubchain } from '@/lib/map/subchainGraph';
import {
  createStructureOnServer,
  deleteStructureOnServer,
  updateStructureOnServer,
} from '@/lib/structures/client';
import {
  createSystemNoteOnServer,
  deleteSystemNoteOnServer,
  updateSystemNoteOnServer,
  type UpdateSystemNoteBody,
} from '@/lib/system-notes/client';
import { mapUpdateLoadSchema, type Envelope } from '@/lib/realtime/protocol';
import { useMapSubscription, useRealtimeEvents, useReconnectResync } from '@/lib/realtime/useRealtime';
import { RoutePlannerModule } from '@/components/sidebar/RoutePlannerModule';
import { KillStatsModule } from '@/components/sidebar/KillStatsModule';
import { SystemGraphModule } from '@/components/sidebar/SystemGraphModule';
import { SystemKillboardModule } from '@/components/sidebar/SystemKillboardModule';
import { TagsModule } from '@/components/sidebar/TagsModule';
import { TheraModule } from '@/components/sidebar/TheraModule';
import { IntelModule } from '@/components/sidebar/IntelModule';
import { StructureModule } from '@/components/sidebar/StructureModule';
import type { StructureFormValues } from '@/components/sidebar/StructureFormDialog';
import {
  SystemNotesModule,
  type SystemNoteFormValues,
} from '@/components/sidebar/SystemNotesModule';
import { InspectorModule, type SelectionRef } from '@/components/sidebar/InspectorModule';
import {
  SignatureModule,
  SignatureModuleHeaderActions,
} from '@/components/sidebar/SignatureModule';
import { Download, Info, LayoutDashboard, RotateCcw, ScrollText, Settings, Trash2, Upload, User } from 'lucide-react';
import { Tooltip } from '@base-ui/react/tooltip';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from '@/components/ui/menu';
import { MapInfoDialog } from '@/components/dialogs/MapInfoDialog';
import { PilotRosterButton } from './PilotRosterButton';
import { SystemOverlayButton } from './SystemOverlayButton';
import { MapShareIndicator } from './MapShareIndicator';
import { MapSettingsDialog } from '@/components/dialogs/MapSettingsDialog';
import { MapAuditDialog } from '@/components/map/manage/MapAuditDialog';
import { SignatureSearchModule } from '@/components/sidebar/SignatureSearchModule';
import { AddSystemDialog } from './AddSystemDialog';
import { ConnectionEdge, type ConnectionEdgeData } from './ConnectionEdge';
import { MapPresenceProvider } from './MapPresenceContext';
import { MapActiveCharProvider, useMapActiveChar } from './MapActiveCharContext';
import { MapSignatureIndicatorProvider } from './MapSignatureIndicatorContext';
import { SignaturePasteHotkey } from './SignaturePasteHotkey';
import { CommandPalette } from './CommandPalette';
import { MapHotkeys, type MoveDirection } from './MapHotkeys';
import type { KeyboardActionContext } from '@/lib/map/keyboardActions';
import { TransitSignaturePrompt } from './TransitSignaturePrompt';
import { MapTravelProvider, TravelBridge } from './MapTravelContext';
import { MapUnderglowProvider } from './MapUnderglowContext';
import { MapUnderglowBridge } from './MapUnderglowBridge';
import { SystemNode, type SystemNodeData } from './SystemNode';
import { MapNoteNode, type MapNoteNodeData } from './MapNoteNode';
import {
  ChainCanvas,
  CHAIN_TILE_PARAMS,
  type ChainCanvasNode,
  type ChainFocusRequest,
} from './ChainCanvas';
import { ALL_CHAINS_TAB, ChainTabStrip } from './ChainTabStrip';
import {
  ChainForestCanvas,
  CHAIN_FOREST_BLOCK_GAP,
  CHAIN_FOREST_LABEL_OFFSET,
  type ChainForestCanvasNode,
} from './ChainForestCanvas';
import type { ChainBlobNodeData, ChainLabelNodeData } from './ChainBlobNode';
import type { ChainPointerNodeData } from './ChainPointerNode';
import { MobileChainView } from './mobile/MobileChainView';
import { useIsPhoneViewport } from './mobile/useIsPhoneViewport';
import { MapContextMenu } from './MapContextMenu';
import { SubchainDeletePrompt } from './SubchainDeletePrompt';
import { RestoreConnectionPrompt } from './RestoreConnectionPrompt';
import { MapLayoutGrid } from './layout/MapLayoutGrid';
import { MapPanelGroup } from './layout/MapPanelGroup';
import { PanelDndContext } from './layout/PanelDndContext';
import {
  DEFAULT_MAP_LAYOUT,
  PANELS,
  PANEL_COLS,
  PANEL_MIN,
  dedupeGroups,
  ensurePanelsPlaced,
  migrateLayout,
  removePanelFromLayout,
} from '@/lib/map/layout/panels';
import { mapLayoutConfigSchema } from '@/lib/map/layout/schema';
import { setMapLayoutAction } from '@/app/(app)/actions/account';
import { toast } from 'sonner';

// Debounce window for persisting layout edits (drag/resize/hide) to the server.
const LAYOUT_SAVE_DEBOUNCE_MS = 600;

// Cadence for re-pulling read-side per-system intel/stats for systems already on
// the map. Floored at the ~5min server refresh-job cadence — polling faster than
// the underlying data changes would just be waste against the shared deployment.
const SYSTEM_DATA_REFRESH_MS = 5 * 60 * 1000;

// Compact character selector for the map toolbar. Must render inside
// MapActiveCharProvider (which is inside MapPresenceProvider).
function ActiveCharSelector() {
  const { activeCharId, locatedChars, setPickedCharId } = useMapActiveChar();

  if (locatedChars.length === 0) {
    return (
      <Tooltip.Root>
        <Tooltip.Trigger
          render={<span />}
          className="inline-flex h-8 cursor-default items-center gap-1 rounded-md px-2 opacity-50"
        >
          <User className="size-3.5 shrink-0" />
          <span className="text-muted-foreground text-sm">No characters</span>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Positioner sideOffset={4} side="bottom" align="center">
            <Tooltip.Popup className="z-50 max-w-[16rem] rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md">
              No characters are currently tracked on this map. Character tracking requires an
              in-game session with ESI location scope.
            </Tooltip.Popup>
          </Tooltip.Positioner>
        </Tooltip.Portal>
      </Tooltip.Root>
    );
  }

  return (
    <Tooltip.Root>
      <Tooltip.Trigger render={<span className="inline-flex" />}>
        <Select<string>
          value={String(activeCharId ?? '')}
          onValueChange={(v) => setPickedCharId(v ? Number(v) : null)}
          items={Object.fromEntries(locatedChars.map((c) => [String(c.id), c.name]))}
        >
          <SelectTrigger className="h-8 w-auto px-2 text-sm gap-1">
            <User className="size-3.5 shrink-0" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {locatedChars.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner sideOffset={4} side="bottom" align="center">
          <Tooltip.Popup className="z-50 max-w-[18rem] rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md">
            Active character — controls map focus, route planning, and signature highlighting
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

// Debounce for the chains-near-me refetch on the active pilot's location
// change (nomadic-chains) — a jump burst collapses into one request. The
// mount-time fetch fires immediately.
const CHAIN_DISTANCE_DEBOUNCE_MS = 500;

// Chains-near-me fetcher (nomadic-chains). Must render inside
// MapActiveCharProvider: the origin pilot is the active character — the same
// pick the route planner uses — and the effect re-runs when that pilot's
// presence location changes, so the badges track jumps. Reports the result up
// via `onDistances` because the consumers (tab strip / forest blobs /
// inspector) render from MapCanvas state outside this subtree.
function ChainDistanceBridge({
  mapId,
  hasChains,
  onDistances,
}: {
  mapId: string;
  hasChains: boolean;
  onDistances: (distances: ChainDistances | null) => void;
}) {
  const { activeCharId, activeCharSystemId } = useMapActiveChar();
  const fetchedOnceRef = useRef(false);

  useEffect(() => {
    if (!hasChains || activeCharId == null || activeCharSystemId == null) {
      // No located pilot (or nothing to measure): distances are unknown and
      // the badges hide. Reset the immediate-fetch latch so a pilot appearing
      // later doesn't wait out the debounce.
      fetchedOnceRef.current = false;
      onDistances(null);
      return;
    }
    let cancelled = false;
    const run = async () => {
      const result = await fetchChainDistances({ mapId, characterId: activeCharId });
      if (!cancelled && result.ok) onDistances(result.data);
    };
    if (!fetchedOnceRef.current) {
      fetchedOnceRef.current = true;
      void run();
      return () => {
        cancelled = true;
      };
    }
    const timer = setTimeout(() => void run(), CHAIN_DISTANCE_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [mapId, hasChains, activeCharId, activeCharSystemId, onDistances]);

  return null;
}

// Union two breakpoints' layout arrays by item `i` (incoming wins). RGL only
// reports geometry for panels currently rendered, so a hidden panel's slot (and
// any panel not yet placed) is preserved from the previous state rather than
// dropped from the breakpoint on the next change.
function mergeLayouts(
  prev: Record<Breakpoint, Layout>,
  incoming: ResponsiveLayouts<Breakpoint>,
): Record<Breakpoint, Layout> {
  const next = { ...prev };
  for (const bp of Object.keys(incoming) as Breakpoint[]) {
    const incomingBp = incoming[bp];
    if (!incomingBp) continue;
    const incomingIds = new Set(incomingBp.map((item) => item.i));
    const kept = prev[bp].filter((item) => !incomingIds.has(item.i));
    next[bp] = [...incomingBp, ...kept];
  }
  return next;
}

const nodeTypes = { system: SystemNode, note: MapNoteNode };
const edgeTypes = { connection: ConnectionEdge };

// xyflow node ids must be unique, but `ap_map_system.id` and `ap_map_note.id` are
// independent identity sequences and so collide numerically. Namespace note nodes
// (`note:<id>`) in xyflow; their real `ap_map_note.id` stays on `data.id`.
type CanvasNode = Node<SystemNodeData> | Node<MapNoteNodeData>;
const noteNodeId = (noteId: string) => `note:${noteId}`;

// Resolve each connection's source wormhole from its attached signatures,
// preferring the named side over the K162 reverse-exit (the named hole carries
// the routing / mass / lifetime static data). Feeds the edge detail popover on
// both the free canvas and the chain-mode tree.
function buildWormholeByConnection(
  signatures: MapSignature[],
): Map<string, { typeId: number; code: string | null }> {
  const whByConn = new Map<string, { typeId: number; code: string | null }>();
  for (const sig of signatures) {
    if (sig.mapConnectionId == null || sig.typeId == null) continue;
    const existing = whByConn.get(sig.mapConnectionId);
    if (!existing || (existing.code === 'K162' && sig.wormholeCode !== 'K162')) {
      whByConn.set(sig.mapConnectionId, { typeId: sig.typeId, code: sig.wormholeCode });
    }
  }
  return whByConn;
}

// Per-map chain-view display preference (nomadic-chains): which tab is active
// (null = "Free" / free canvas — the default; `ALL_CHAINS_TAB` = the All
// forest; else a chain id) and which way trees grow. Client-persisted in
// localStorage beside the viewport pref — a display toggle, no schema.
type ChainViewPref = { activeChainId: string | null; orientation: ChainLayoutOrientation };
const chainViewStorageKey = (mapId: string) => `aperture:map:${mapId}:chainView`;

/** A pending "also delete the subchain?" offer raised by a deleted wormhole sig. */
type SubchainSigOffer = {
  headId: string;
  anchorId: string;
  headName: string;
  count: number;
};

// A re-confirmed wormhole sig whose remembered connection is currently dormant
// (absent from the view) → an offer to restore it. Keyed on the dormant
// connection id; `targetName` names the far system for the prompt.
type RestoreConnOffer = {
  connId: string;
  targetName: string;
};

export function MapCanvas({
  data,
  stats: initialStats,
  intel: initialIntel,
  structures: initialStructures,
  systemNotes: initialSystemNotes,
  settings,
  canManage,
  capabilities,
  liveShares: initialLiveShares,
  travelAnimation,
  signatureIndicators,
  chainBlobThreshold,
  viewerCharacterIds,
  viewerCharacters,
  mainCharacterId,
  sessionCharacterId,
  routePrefs,
  routeDestinations,
  mapLayout,
}: {
  data: MapViewData;
  stats: Record<number, SystemStatsSummary>;
  intel: Record<number, SystemIntelSummary>;
  structures: Record<number, StructureIntel[]>;
  systemNotes: Record<number, SystemNote[]>;
  settings: MapSettings;
  /** Whether the viewer can manage this map (derived `canManageMap`) — reveals settings/webhooks/audit. */
  canManage: boolean;
  /**
   * The delegated map capabilities the viewer holds (`resolveMapCapabilities`).
   * A manager holds every value; a delegated corp title holds the subset granted
   * to it. Drives per-feature reveal of the director-gated surfaces.
   */
  capabilities: MapCapability[];
  /** Share links currently publishing this map, for the header indicator every viewer sees. */
  liveShares: LiveShareBadge[];
  travelAnimation: boolean;
  /** Viewer's resolved stale/unscanned indicator prefs (threshold + toggles). */
  signatureIndicators: SignatureIndicatorPrefs;
  /** Viewer's `ap_user.chain_blob_threshold` — a chain larger than this blobs in the All view. */
  chainBlobThreshold: number;
  /** Viewer's account character ids — matched against presence for the CTRL+V fast-paste location check. */
  viewerCharacterIds: number[];
  /** Viewer's active characters (id + name) for the route planner's source picker. */
  viewerCharacters: { id: number; name: string }[];
  /** The account's main character id (route planner's default source), or null. */
  mainCharacterId: number | null;
  /**
   * The signed-in (session) character id. Personal chains are filtered to this
   * owner — mirroring `loadMapForView`, so a foreign personal chain arriving
   * over realtime never renders.
   */
  sessionCharacterId: number;
  /** Per-account route-planner settings (routes-module). */
  routePrefs: RoutePrefs;
  /** The account's saved route destinations (routes-module). */
  routeDestinations: RouteDestinationView[];
  /**
   * Saved per-account dashboard layout (map-layout-builder), or `null` to use
   * `DEFAULT_MAP_LAYOUT`.
   */
  mapLayout?: MapLayoutConfig | null;
}) {
  const [selected, setSelected] = useState<SelectionRef | null>(null);
  // The multi-select set; `selected` (above) remains the primary anchor that
  // drives the inspector and sidebar modules. Invariant: when
  // `selected?.kind === 'system'`, this set contains `selected.id`. Always
  // replaced with a fresh Set (never mutated) — the render-time sync block
  // detects changes by reference equality.
  const [selectedSystemIds, setSelectedSystemIds] = useState<Set<string>>(() => new Set());
  // Right-click context-menu target (independent of selection — right-click does
  // not change `selected`/`selectedSystemIds`). `null` ⇒ no menu open.
  const [contextMenu, setContextMenu] = useState<MapContextMenuTarget | null>(null);
  // Pending delete-subchain confirmation. The doomed systems are also highlighted
  // via `selectedSystemIds` while this is open. `null` ⇒ no prompt.
  const [subchainPreview, setSubchainPreview] = useState<{
    headId: string;
    anchorId: string | null;
    headName: string;
    count: number;
  } | null>(null);
  // Queue of "also delete the subchain?" prompts, offered after a wormhole sig
  // with a populated "Leads to" is deleted — one per such sig. The row trash
  // icon enqueues a single entry; a lazy-delete paste can enqueue several at
  // once. `[0]` is the active prompt; an empty queue ⇒ no prompt.
  const [subchainSigPrompts, setSubchainSigPrompts] = useState<SubchainSigOffer[]>([]);
  const [restoreConnPrompts, setRestoreConnPrompts] = useState<RestoreConnOffer[]>([]);
  // Pending delete-disconnected confirmation. The doomed systems (everything cut
  // off from the Home) are highlighted via `selectedSystemIds` while open.
  const [disconnectedPreview, setDisconnectedPreview] = useState<{ count: number } | null>(null);
  const [mapInfoOpen, setMapInfoOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [addSystemOpen, setAddSystemOpen] = useState(false);
  const [sigSearchFilters, setSigSearchFilters] = useState<SigSearchFilters>({
    name: '',
    groupKey: null,
    maxAgeHours: null,
    securityClasses: [],
    includeAnomalies: true,
    includeSignatures: true,
    activity: null,
  });
  const [flashSigId, setFlashSigId] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Sonar-ping highlight of sigs a local bulk paste created/updated (issue #209).
  const [pasteFlash, setPasteFlash] = useState<Record<string, 'created' | 'updated'>>({});
  const pasteFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // One-shot "Lazy delete" arm for the CTRL+V fast paste: when on, the next
  // direct scanner paste also removes missing sigs, then disarms itself.
  const [lazyDeleteSigs, setLazyDeleteSigs] = useState(false);
  const [viewData, setViewData] = useState<MapViewData>(data);
  const [liveShares, setLiveShares] = useState<LiveShareBadge[]>(initialLiveShares);
  // Captured via ReactFlow's onInit so the manual-add flow can place new nodes
  // at the current viewport centre rather than (0,0).
  const flowInstance = useRef<ReactFlowInstance<
    CanvasNode,
    Edge<ConnectionEdgeData>
  > | null>(null);
  const flowWrapperRef = useRef<HTMLDivElement>(null);
  // Client-space point set by the pane "Add system" action; consumed by the next
  // `onAddSystem` so the added node lands where the user right-clicked rather than
  // at the selection/viewport-centre default. Cleared once read.
  const pendingAddPoint = useRef<{ x: number; y: number } | null>(null);
  // True only while a drag-box selection is in progress. `onSelectionChange`
  // fires for our own click-driven selection echoes too; without this gate the
  // reconciler would fight the click handlers and loop. Box drag is the only
  // selection source we must adopt from xyflow.
  const boxSelecting = useRef(false);
  // Read-side per-system data (intel / activity stats / structure intel /
  // global system notes) is server-rendered for the systems present at page
  // load, then held as state so systems added live can be backfilled (see the
  // effect below) without a reload. Structure intel and system notes are also
  // updated in place by our own CRUD callbacks.
  const [intel, setIntel] = useState(initialIntel);
  const [stats, setStats] = useState(initialStats);
  const [structures, setStructures] = useState(initialStructures);
  const [systemNotes, setSystemNotes] = useState(initialSystemNotes);

  // EVE solar-system ids whose read-side data has been loaded or is in flight.
  // Seeded from the load-time intel (one entry per initially-rendered system).
  const requestedSystemData = useRef<Set<number>>(
    new Set(Object.keys(initialIntel).map(Number)),
  );
  // Backfill systems added after the initial render (paste, tracked-pilot jump,
  // manual add): one batched fetch per new id-set, merged into state so their
  // sov/FW/incursion decorators and sidebar modules fill in without a reload.
  // Additive only — an id already requested is never refetched (a stale snapshot
  // matches the existing load-time model); a failed fetch is retried on the next
  // system change by un-marking its ids.
  useEffect(() => {
    const missing = viewData.systems
      .map((s) => s.systemId)
      .filter((id) => !requestedSystemData.current.has(id));
    if (missing.length === 0) return;
    for (const id of missing) requestedSystemData.current.add(id);
    fetchSystemData({ mapId: data.map.id, systemIds: missing }).then((result) => {
      if (!result.ok) {
        for (const id of missing) requestedSystemData.current.delete(id);
        return;
      }
      setIntel((prev) => ({ ...prev, ...result.data.intel }));
      setStats((prev) => ({ ...prev, ...result.data.stats }));
      setStructures((prev) => ({ ...prev, ...result.data.structures }));
      setSystemNotes((prev) => ({ ...prev, ...result.data.systemNotes }));
    });
  }, [viewData.systems, data.map.id]);

  // Distinct EVE system ids currently on the map, mirrored into a ref so the
  // periodic refresh below reads a fresh set without re-arming its interval on
  // every viewData change (drag, realtime, optimistic patch).
  const onMapSystemIds = useMemo(
    () => [...new Set(viewData.systems.map((s) => s.systemId))],
    [viewData.systems],
  );
  const onMapSystemIdsRef = useRef(onMapSystemIds);
  useEffect(() => {
    onMapSystemIdsRef.current = onMapSystemIds;
  }, [onMapSystemIds]);

  // Read-side intel/stats drift as their server refresh jobs (incursion, sov/FW,
  // hourly stats) run; a long-lived open map never picks that up. Re-pull the
  // whole on-map set on an interval and reference-replace intel/stats so the
  // node-sync key rebuilds decorators. Skips while the tab is hidden to avoid
  // polling the shared deployment for a view nobody is looking at. Structures are
  // deliberately not re-merged: they carry the user's own un-echoed CRUD edits
  // and have no server refresh job, so overwriting them would only risk clobber.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      const systemIds = onMapSystemIdsRef.current;
      if (systemIds.length === 0) return;
      fetchSystemData({ mapId: data.map.id, systemIds }).then((result) => {
        if (!result.ok) return;
        setIntel((prev) => ({ ...prev, ...result.data.intel }));
        setStats((prev) => ({ ...prev, ...result.data.stats }));
      });
    }, SYSTEM_DATA_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [data.map.id]);

  const [nodes, setNodes] = useState<CanvasNode[]>(() => [
    ...data.systems.map((s) => ({
      id: s.id,
      type: 'system' as const,
      position: { x: s.positionX, y: s.positionY },
      data: {
        ...s,
        isHome: s.id === data.map.homeMapSystemId,
        inFactionWarfare: intel[s.systemId]?.factionWar != null,
        hasIncursion: intel[s.systemId]?.incursion != null,
        hasNotes: (systemNotes[s.systemId] ?? []).length > 0,
      },
      selected: false,
      draggable: !s.locked,
    })),
    ...data.notes.map((n) => ({
      id: noteNodeId(n.id),
      type: 'note' as const,
      position: { x: n.positionX, y: n.positionY },
      data: { ...n },
      selected: false,
      draggable: !n.locked,
    })),
  ]);
  const appliedEventIds = useRef<Set<number>>(new Set());

  // Signatures no longer ride the `system.added` event (that breached the 8 KB
  // pg_notify ceiling). On every system.added we refetch the system's sigs and
  // upsert them into the view, so a re-added system's survivors converge on all
  // tabs without a reload. Keyed on the *event*, not a viewData diff: re-add
  // reuses the same ap_map_system.id (soft delete), so a diff-and-dedupe effect
  // (like the read-side backfill above) would never refire.
  const sigHydrateInFlight = useRef<Set<string>>(new Set());
  const hydrateSignatures = useCallback(
    (mapSystemId: string) => {
      if (sigHydrateInFlight.current.has(mapSystemId)) return;
      sigHydrateInFlight.current.add(mapSystemId);
      void fetchSystemSignatures({ mapId: data.map.id, mapSystemId })
        .then((result) => {
          if (!result.ok) return;
          setViewData((prev) => {
            // Upsert-by-id (race-tolerant): a signature.create arriving during the
            // fetch is never clobbered; the baseline for a (re)added system is
            // empty (system.removed pruned / brand-new), so upsert == replace here.
            const next = [...prev.signatures];
            for (const sig of result.data) {
              const idx = next.findIndex((s) => s.id === sig.id);
              if (idx >= 0) next[idx] = sig;
              else next.push(sig);
            }
            return { ...prev, signatures: next };
          });
        })
        .finally(() => sigHydrateInFlight.current.delete(mapSystemId));
    },
    [data.map.id],
  );

  // Fire hydration for every system.added in a batch of just-applied payloads.
  // Called from each fold site *outside* the setViewData updater (no side effects
  // inside a state reducer).
  const hydrateAddedSystems = useCallback(
    (payloads: MapEventPayload[]) => {
      for (const p of payloads) if (p.kind === 'system.added') hydrateSignatures(p.id);
    },
    [hydrateSignatures],
  );

  const [initialViewport] = useState<Viewport | null>(() => {
    try {
      const raw = localStorage.getItem(`aperture:map:${data.map.id}:viewport`);
      return raw ? (JSON.parse(raw) as Viewport) : null;
    } catch {
      return null;
    }
  });
  // Last free-canvas viewport (starts at the stored one). Read at every mount of
  // the free ReactFlow, so returning from a chain tab restores the viewport the
  // user left rather than the page-load one.
  const lastViewportRef = useRef<Viewport | null>(initialViewport);

  // ---- Chain mode (nomadic-chains) ---------------------------------------
  // Which tab is active (null = Free canvas, ALL_CHAINS_TAB = forest, else a
  // chain id) + tree orientation; a per-user display preference persisted per
  // map in localStorage.
  const [chainView, setChainView] = useState<ChainViewPref>(() => {
    try {
      const raw = localStorage.getItem(chainViewStorageKey(data.map.id));
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<ChainViewPref>;
        return {
          activeChainId: typeof parsed.activeChainId === 'string' ? parsed.activeChainId : null,
          orientation: parsed.orientation === 'root-left' ? 'root-left' : 'root-top',
        };
      }
    } catch {
      // fall through to the default
    }
    return { activeChainId: null, orientation: 'root-top' };
  });
  const updateChainView = useCallback(
    (patch: Partial<ChainViewPref>) => {
      setChainView((prev) => {
        const next = { ...prev, ...patch };
        try {
          localStorage.setItem(chainViewStorageKey(data.map.id), JSON.stringify(next));
        } catch {
          // preference persistence is best-effort
        }
        return next;
      });
    },
    [data.map.id],
  );
  // One-shot "center the chain canvas on this system" request (pointer-leaf
  // navigation, jump-to-system while a chain tab is open).
  const [chainFocus, setChainFocus] = useState<ChainFocusRequest | null>(null);
  const focusTokenRef = useRef(0);
  const requestChainFocus = useCallback((mapSystemId: string) => {
    focusTokenRef.current += 1;
    setChainFocus({ token: focusTokenRef.current, mapSystemId });
  }, []);
  // Chains visible to this viewer: every shared chain plus the session
  // character's own personal chains, in tab order. Realtime fans out foreign
  // personal chains too — they are filtered here, mirroring `loadMapForView`.
  const visibleChains = useMemo(
    () =>
      sortChainsForTabs(
        viewData.chains.filter(
          (c) => c.kind === 'shared' || c.ownerCharacterId === sessionCharacterId,
        ),
      ),
    [viewData.chains, sessionCharacterId],
  );
  const activeChain = useMemo(
    () =>
      chainView.activeChainId
        ? (visibleChains.find((c) => c.id === chainView.activeChainId) ?? null)
        : null,
    [visibleChains, chainView.activeChainId],
  );
  // The All-view forest tab (`ALL_CHAINS_TAB` sentinel — never a chain id).
  const isForestTab = chainView.activeChainId === ALL_CHAINS_TAB;
  // The stored tab resolved against reality: a stored id naming a vanished
  // chain resolves to null (= Free). Feeds the tab strip, the mode ref, and
  // the mobile gate.
  const resolvedChainTab = activeChain?.id ?? (isForestTab ? ALL_CHAINS_TAB : null);
  // Mirrored into a ref so mode-agnostic callbacks (jump-to-system, sig search)
  // can branch without re-memoizing on every tab switch. Non-null for a chain
  // tab AND the forest tab — both center through a ChainFocusRequest (the
  // free-canvas flow instance is unmounted in either).
  const activeChainIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeChainIdRef.current = resolvedChainTab;
  }, [resolvedChainTab]);

  // ---- Mobile chain view (Stage 8a) --------------------------------------
  // Phone-width viewport + chain-land ⇒ the full-screen mobile view replaces
  // the whole dashboard render (toolbar, grid, hotkeys, palette). Free-canvas
  // mode at phone width keeps the stacked dashboard untouched.
  const isPhoneViewport = useIsPhoneViewport();
  const mobileChainActive = isMobileChainView(resolvedChainTab, isPhoneViewport);

  // ---- Chains-near-me distances -------------------------------------------
  // Fetched by ChainDistanceBridge (active pilot as origin; refetched on mount
  // and debounced on the pilot's own location change). Null ⇔ unknown.
  const [chainDistances, setChainDistances] = useState<ChainDistances | null>(null);
  // Display slice per chain id: jump count + the resolved nearest-exit name
  // (exit systems are chain members, so they're on the map). Undefined while
  // distances are unknown — every badge surface hides on undefined.
  const chainDistanceBadges = useMemo<Record<string, ChainDistanceBadge | null> | undefined>(() => {
    if (!chainDistances || chainDistances.originSystemId == null) return undefined;
    const nameBySolarId = new Map(viewData.systems.map((s) => [s.systemId, s.name]));
    const badges: Record<string, ChainDistanceBadge | null> = {};
    for (const [chainId, jumps] of Object.entries(chainDistances.distances)) {
      if (jumps == null) {
        badges[chainId] = null;
        continue;
      }
      const exitId = chainDistances.nearestExits[chainId];
      badges[chainId] = {
        jumps,
        exitName: exitId != null ? (nameBySolarId.get(exitId) ?? null) : null,
      };
    }
    return badges;
  }, [chainDistances, viewData.systems]);

  // ---- All-view forest state (Stage 5) -----------------------------------
  // Live forest-canvas zoom, re-rendered ONLY when it crosses the blob cutoff
  // (the collapse decision is the sole zoom consumer, so mid-pan zoom changes
  // that don't flip any blob never rebuild the node arrays).
  const [forestZoom, setForestZoom] = useState(1);
  const onForestZoom = useCallback((zoom: number) => {
    setForestZoom((prev) =>
      (prev < CHAIN_BLOB_ZOOM_CUTOFF) === (zoom < CHAIN_BLOB_ZOOM_CUTOFF) ? prev : zoom,
    );
  }, []);
  // Session-local per-chain "keep expanded" overrides (the blob's expand
  // affordance) — deliberately not persisted.
  const [expandedChainIds, setExpandedChainIds] = useState<Set<string>>(() => new Set());
  const onToggleChainExpand = useCallback((chainId: string) => {
    setExpandedChainIds((prev) => {
      const next = new Set(prev);
      if (next.has(chainId)) next.delete(chainId);
      else next.add(chainId);
      return next;
    });
  }, []);
  // Shelf-wrap width for the forest layout, measured off the forest wrapper
  // (deadbanded so tiny grid resizes don't re-pack the shelf).
  const [forestViewportWidth, setForestViewportWidth] = useState(1200);
  const forestResizeObserver = useRef<ResizeObserver | null>(null);
  const forestWrapperRef = useCallback((el: HTMLDivElement | null) => {
    forestResizeObserver.current?.disconnect();
    forestResizeObserver.current = null;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      const width = Math.round(el.clientWidth);
      if (width > 0) {
        setForestViewportWidth((prev) => (Math.abs(prev - width) < 40 ? prev : width));
      }
    });
    observer.observe(el);
    forestResizeObserver.current = observer;
  }, []);

  // ---- Free-form dashboard layout (map-layout-builder) -------------------
  // Seeded from the saved per-account layout; `null` ⇒ the default arrangement.
  // `migrateLayout` upgrades a pre-v2 blob (no grouping) to singleton groups;
  // `dedupeGroups` heals any panel that a stale build resurrected as a duplicate
  // cell; `ensurePanelsPlaced` then auto-places any registered panel missing from
  // a saved layout (a panel that shipped after the user last saved). All are
  // normalisers, no data migration. No-ops for `DEFAULT_MAP_LAYOUT` (already
  // current and complete).
  const [layout, setLayout] = useState<MapLayoutConfig>(() =>
    ensurePanelsPlaced(dedupeGroups(migrateLayout(mapLayout ?? DEFAULT_MAP_LAYOUT))),
  );
  // The grid's active responsive breakpoint (reported by `MapLayoutGrid`). Grouping
  // is per-breakpoint, so the rendered cells read from `layout.groups[breakpoint]`.
  const [breakpoint, setBreakpoint] = useState<Breakpoint>('lg');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // RGL fires `onLayoutChange` once on mount with its normalized layout; that
  // first call updates local state but must not persist (no spurious write per
  // map open). Subsequent (user-driven) changes save.
  const firstLayoutChange = useRef(true);
  // The mobile chain view unmounts the grid; re-arm the mount guard so the
  // grid's remount-time normalization doesn't persist a no-op layout write.
  useEffect(() => {
    if (mobileChainActive) firstLayoutChange.current = true;
  }, [mobileChainActive]);

  const saveLayout = useCallback((config: MapLayoutConfig) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      // Fire-and-forget: a layout-preference write failing is non-critical.
      void setMapLayoutAction(config);
    }, LAYOUT_SAVE_DEBOUNCE_MS);
  }, []);

  // Flush nothing but cancel a pending debounce on unmount.
  useEffect(() => () => clearTimeout(saveTimer.current ?? undefined), []);
  useEffect(() => () => {
    clearTimeout(flashTimer.current ?? undefined);
    clearTimeout(pasteFlashTimer.current ?? undefined);
  }, []);

  const handleLayoutChange = useCallback(
    (_current: Layout, all: ResponsiveLayouts<Breakpoint>) => {
      setLayout((prev) => {
        const next: MapLayoutConfig = { ...prev, layouts: mergeLayouts(prev.layouts, all) };
        if (!firstLayoutChange.current) saveLayout(next);
        firstLayoutChange.current = false;
        return next;
      });
    },
    [saveLayout],
  );

  // Hide a panel (tab ✕ or panels-menu uncheck). The panel leaves its group's
  // tab strip in every breakpoint (`removePanelFromLayout` re-keys/drops the
  // group as needed, picking a new active tab) and lands in `hidden`.
  const handleHide = useCallback(
    (id: PanelId) => {
      setLayout((prev) => {
        if (prev.hidden.includes(id)) return prev;
        const removed = removePanelFromLayout(prev, id);
        const next: MapLayoutConfig = { ...removed, hidden: [...prev.hidden, id] };
        saveLayout(next);
        return next;
      });
    },
    [saveLayout],
  );

  // Panels-menu checkbox: flip a panel between hidden and visible. Re-showing a
  // panel drops it from `hidden` and `ensurePanelsPlaced` re-adds it as a fresh
  // singleton group at the bottom of each breakpoint (a hidden panel has no
  // preserved slot — hiding removed its group). Hiding routes through the same
  // group-aware removal as the tab ✕.
  const handleToggleVisible = useCallback(
    (id: PanelId) => {
      setLayout((prev) => {
        let next: MapLayoutConfig;
        if (prev.hidden.includes(id)) {
          next = ensurePanelsPlaced({ ...prev, hidden: prev.hidden.filter((h) => h !== id) });
        } else {
          const removed = removePanelFromLayout(prev, id);
          next = { ...removed, hidden: [...prev.hidden, id] };
        }
        saveLayout(next);
        return next;
      });
    },
    [saveLayout],
  );

  // Switch a group's active tab. Applies to every breakpoint that holds a group
  // with this id whose members include the panel (a singleton/reused id spans
  // breakpoints; a per-breakpoint-only group matches only where it exists).
  const handleSetActiveTab = useCallback(
    (groupId: string, panel: PanelId) => {
      setLayout((prev) => {
        const groups = { ...prev.groups };
        for (const bp of Object.keys(prev.groups) as Breakpoint[]) {
          groups[bp] = prev.groups[bp].map((g) =>
            g.id === groupId && g.members.includes(panel) ? { ...g, active: panel } : g,
          );
        }
        const next: MapLayoutConfig = { ...prev, groups };
        saveLayout(next);
        return next;
      });
    },
    [saveLayout],
  );

  // Move a member panel out of its current group and append it as a new active
  // tab of `targetGroupId`, scoped to the active breakpoint (grouping is
  // per-breakpoint). If the source group empties it is dropped, along with its
  // grid item in `layouts[bp]` — `mergeLayouts` keeps only `prev` items, so a
  // removed item is not resurrected by RGL's next `onLayoutChange`.
  const mergePanelIntoGroup = useCallback(
    (sourcePanel: PanelId, targetGroupId: string) => {
      setLayout((prev) => {
        const bp = breakpoint;
        const source = prev.groups[bp].find((g) => g.members.includes(sourcePanel));
        const target = prev.groups[bp].find((g) => g.id === targetGroupId);
        if (!source || !target || source.id === targetGroupId) return prev;
        const droppedIds = new Set<string>();
        // Old group id → new anchor id, when removing the source's anchor member
        // forces a re-key; its `layouts[bp]` item is renamed to match.
        const renamed = new Map<string, PanelId>();
        const groupsBp = prev.groups[bp].flatMap((g) => {
          if (g.id === source.id) {
            const members = g.members.filter((m) => m !== sourcePanel);
            if (members.length === 0) {
              droppedIds.add(g.id);
              return [];
            }
            const active = g.active === sourcePanel ? members[0]! : g.active;
            // A group's id must stay one of its members. If the removed panel was
            // the anchor id, re-key to the new active so the freed PanelId isn't
            // later reused for a second cell with a colliding id (duplicate keys).
            if (g.id === sourcePanel) {
              renamed.set(g.id, active);
              return [{ id: active, members, active }];
            }
            return [{ ...g, members, active }];
          }
          if (g.id === targetGroupId) {
            return [{ ...g, members: [...g.members, sourcePanel], active: sourcePanel }];
          }
          return [g];
        });
        const groups = { ...prev.groups, [bp]: groupsBp };
        const layouts =
          droppedIds.size > 0 || renamed.size > 0
            ? {
                ...prev.layouts,
                [bp]: prev.layouts[bp]
                  .filter((i) => !droppedIds.has(i.i))
                  .map((it) => {
                    const newId = renamed.get(it.i);
                    return newId ? { ...it, i: newId, ...PANEL_MIN[newId] } : it;
                  }),
              }
            : prev.layouts;
        const next: MapLayoutConfig = { ...prev, groups, layouts };
        saveLayout(next);
        return next;
      });
    },
    [breakpoint, saveLayout],
  );

  // Reorder a tab within its own group's header (active breakpoint only). No-op
  // if either panel is missing or the order is unchanged.
  const reorderTab = useCallback(
    (groupId: string, fromPanel: PanelId, toPanel: PanelId) => {
      setLayout((prev) => {
        const bp = breakpoint;
        const group = prev.groups[bp].find((g) => g.id === groupId);
        if (!group) return prev;
        const from = group.members.indexOf(fromPanel);
        const to = group.members.indexOf(toPanel);
        if (from < 0 || to < 0 || from === to) return prev;
        const members = arrayMove(group.members, from, to);
        const groupsBp = prev.groups[bp].map((g) => (g.id === groupId ? { ...g, members } : g));
        const next: MapLayoutConfig = { ...prev, groups: { ...prev.groups, [bp]: groupsBp } };
        saveLayout(next);
        return next;
      });
    },
    [breakpoint, saveLayout],
  );

  // Split a member out of its group into its own new singleton cell at a snapped
  // grid position (active breakpoint only). The new group/layout-item id is the
  // panel's `PanelId` (grid ids live in the `PanelId` space). When the panel is its
  // group's anchor id, the source group + its layout item are first re-keyed to a
  // remaining member so the id isn't claimed by two cells. A singleton source has no
  // group to split — it already owns item `i === source.id`, so this just moves it.
  const tearOffTab = useCallback(
    (panel: PanelId, x: number, y: number) => {
      setLayout((prev) => {
        const bp = breakpoint;
        const source = prev.groups[bp].find((g) => g.members.includes(panel));
        if (!source) return prev;
        const cols = PANEL_COLS[bp];
        const { minW, minH } = PANEL_MIN[panel];
        const w = Math.min(cols, minW);
        const clampedX = Math.max(0, Math.min(x, cols - w));
        const clampedY = Math.max(0, y);

        if (source.members.length === 1) {
          const layoutsBp = prev.layouts[bp].map((it) =>
            it.i === source.id ? { ...it, x: clampedX, y: clampedY } : it,
          );
          const next: MapLayoutConfig = { ...prev, layouts: { ...prev.layouts, [bp]: layoutsBp } };
          saveLayout(next);
          return next;
        }

        const remaining = source.members.filter((m) => m !== panel);
        const newActive = source.active === panel ? remaining[0]! : source.active;

        let groupsBp: PanelGroup[];
        let layoutsBp = prev.layouts[bp];
        if (source.id === panel) {
          const newSourceId = newActive;
          groupsBp = prev.groups[bp].map((g) =>
            g.id === source.id ? { id: newSourceId, members: remaining, active: newActive } : g,
          );
          layoutsBp = layoutsBp.map((it) =>
            it.i === source.id ? { ...it, i: newSourceId, ...PANEL_MIN[newSourceId] } : it,
          );
        } else {
          groupsBp = prev.groups[bp].map((g) =>
            g.id === source.id ? { ...g, members: remaining, active: newActive } : g,
          );
        }

        groupsBp = [...groupsBp, { id: panel, members: [panel], active: panel }];
        layoutsBp = [...layoutsBp, { i: panel, x: clampedX, y: clampedY, w, h: minH, minW, minH }];

        const next: MapLayoutConfig = {
          ...prev,
          groups: { ...prev.groups, [bp]: groupsBp },
          layouts: { ...prev.layouts, [bp]: layoutsBp },
        };
        saveLayout(next);
        return next;
      });
    },
    [breakpoint, saveLayout],
  );

  // dnd-kit drop dispatcher: `overId` is either a `grp:<groupId>` header or a
  // bare `PanelId` tab. Same group ⇒ reorder; different group (or a header) ⇒
  // merge. Resolved against the active breakpoint's groups. A drop on the open grid
  // surface (tear-off) is handled separately by `MapLayoutGrid` and falls through
  // here as a no-op (its `overId` matches no `grp:` prefix and no member).
  const handlePanelDrop = useCallback(
    (activePanel: PanelId, overId: string) => {
      const groupsBp = layout.groups[breakpoint] ?? [];
      if (overId.startsWith('grp:')) {
        mergePanelIntoGroup(activePanel, overId.slice(4));
        return;
      }
      const overPanel = overId as PanelId;
      const overGroup = groupsBp.find((g) => g.members.includes(overPanel));
      const sourceGroup = groupsBp.find((g) => g.members.includes(activePanel));
      if (!overGroup || !sourceGroup) return;
      if (overGroup.id === sourceGroup.id) {
        reorderTab(sourceGroup.id, activePanel, overPanel);
      } else {
        mergePanelIntoGroup(activePanel, overGroup.id);
      }
    },
    [layout.groups, breakpoint, mergePanelIntoGroup, reorderTab],
  );

  // Reset to the shipped arrangement. Clone so later immutable updates can never
  // mutate the shared `DEFAULT_MAP_LAYOUT` constant.
  const handleResetLayout = useCallback(() => {
    const next = structuredClone(DEFAULT_MAP_LAYOUT);
    setLayout(next);
    saveLayout(next);
  }, [saveLayout]);

  // Download the current arrangement as a shareable JSON file. The exported blob
  // is exactly `MapLayoutConfig` — the same shape the import validator accepts.
  const handleExportLayout = useCallback(() => {
    const blob = new Blob([JSON.stringify(layout, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'aperture-layout.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [layout]);

  // Hidden picker for importing someone else's exported layout file.
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const handleImportFile = useCallback(
    async (file: File) => {
      let raw: unknown;
      try {
        raw = JSON.parse(await file.text());
      } catch {
        toast.error('Not a valid layout file.');
        return;
      }
      // Re-validate the untrusted file at this boundary; `ensurePanelsPlaced`
      // then back-fills any panels absent from a layout saved by another build.
      const parsed = mapLayoutConfigSchema.safeParse(raw);
      if (!parsed.success) {
        toast.error('This file is not a valid Aperture layout.');
        return;
      }
      const next = ensurePanelsPlaced(dedupeGroups(migrateLayout(parsed.data)));
      setLayout(next);
      saveLayout(next);
      toast.success('Layout imported.');
    },
    [saveLayout],
  );

  const handleNavigateToSig = useCallback((systemId: string, sigId: string) => {
    setSelected({ kind: 'system', id: systemId });
    setSelectedSystemIds(new Set([systemId]));
    if (activeChainIdRef.current) {
      // Chain mode: the free-canvas flow instance is unmounted — focus the
      // occurrence through the chain canvas instead (no-op when the system
      // has no occurrence in the open chain).
      requestChainFocus(systemId);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      setFlashSigId(sigId);
      flashTimer.current = setTimeout(() => setFlashSigId(null), 3000);
      return;
    }
    const inst = flowInstance.current;
    const node = inst?.getNode(systemId);
    if (inst && node) {
      const w = node.measured?.width ?? node.width ?? 0;
      const h = node.measured?.height ?? node.height ?? 0;
      // Snap (no animation) to the system, preserving the current zoom level.
      inst.setCenter(node.position.x + w / 2, node.position.y + h / 2, {
        zoom: inst.getZoom(),
        duration: 0,
      });
    }
    if (flashTimer.current) clearTimeout(flashTimer.current);
    setFlashSigId(sigId);
    flashTimer.current = setTimeout(() => setFlashSigId(null), 3000);
  }, [requestChainFocus]);

  useMapSubscription(Number(data.map.id));

  // ---- Realtime apply (with dedupe of our own optimistic echoes) ----------
  // Every envelope is delivered exactly once via the listener registry, so a
  // same-tick burst (e.g. a wormhole jump's system.added + connection.create +
  // characterUpdate) applies all of them in order — no coalescing drop.
  useRealtimeEvents(
    useCallback((envelope: Envelope) => {
      if (envelope.task !== 'mapUpdate') return;
      const loadResult = mapUpdateLoadSchema.safeParse(envelope.load);
      if (!loadResult.success || !loadResult.data.data) return;
      const payload = loadResult.data.data;
      if (appliedEventIds.current.has(payload.eventId)) return;
      appliedEventIds.current.add(payload.eventId);
      setViewData((prev) => applyEvent(prev, payload));
      hydrateAddedSystems([payload]);
      // Share mint/revoke carries no canvas state, so it never reaches
      // `applyEvent` — the header indicator tracks it directly.
      if (payload.kind === 'share.created') {
        const badge: LiveShareBadge = {
          id: payload.shareId,
          label: payload.label,
          expiresAt: payload.expiresAt,
        };
        setLiveShares((prev) =>
          prev.some((s) => s.id === badge.id) ? prev : [badge, ...prev],
        );
      } else if (payload.kind === 'share.revoked') {
        setLiveShares((prev) => prev.filter((s) => s.id !== payload.shareId));
      }
    }, [hydrateAddedSystems]),
  );

  // ---- On-error resync failsafe ------------------------------------------
  //
  // A rollback can't fix every drift — e.g. an orphaned signature whose DB row
  // was cascade-deleted with its connection. When a mutation fails we refetch
  // the authoritative snapshot and reset the view. Guarded by an in-flight ref
  // so a burst of failures collapses into a single refetch; the dedupe set is
  // cleared because the fresh snapshot is the new baseline (any racing echo
  // re-applies idempotently via applyEvent).
  const resyncInFlight = useRef(false);
  const resync = useCallback(async () => {
    if (resyncInFlight.current) return;
    resyncInFlight.current = true;
    try {
      const result = await fetchMapSnapshot(data.map.id);
      if (result.ok) {
        appliedEventIds.current.clear();
        setViewData(result.data);
      }
    } finally {
      resyncInFlight.current = false;
    }
  }, [data.map.id]);

  // On a socket reconnect (open after a degraded/closed gap), the SharedWorker
  // resumes only NEW events — anything committed during the disconnect is lost.
  // Refetch the authoritative snapshot so the canvas converges to DB truth. The
  // initial mount-open does not fire (page-load snapshot is already fresh).
  useReconnectResync(resync);

  // ---- Optimistic-apply helpers (PATCH/DELETE) ---------------------------
  //
  // For PATCH/DELETE we apply locally first, snapshot for rollback, and dedupe
  // the realtime echo by its returned eventId. POST helpers (system add /
  // connection create / signature create) await the server payload and apply
  // through the normal path.
  const runOptimistic = useCallback(
    async (
      optimistic: MapEventPayload,
      run: () => Promise<
        { ok: true; data: MapEventPayload; eventId: number } | { ok: false; error: string }
      >,
    ) => {
      let snapshot: MapViewData | null = null;
      setViewData((prev) => {
        snapshot = prev;
        return applyEvent(prev, optimistic);
      });
      const result = await run();
      if (result.ok) {
        appliedEventIds.current.add(result.eventId);
      } else if (snapshot) {
        // Immediate rollback for responsiveness; resync reconciles deeper drift.
        setViewData(snapshot);
        void resync();
      }
    },
    [resync],
  );

  const awaitServer = useCallback(
    async (
      run: () => Promise<
        { ok: true; data: MapEventPayload; eventId: number } | { ok: false; error: string }
      >,
    ) => {
      const result = await run();
      if (!result.ok) {
        void resync();
        return;
      }
      appliedEventIds.current.add(result.eventId);
      setViewData((prev) => applyEvent(prev, result.data));
      hydrateAddedSystems([result.data]);
    },
    [resync, hydrateAddedSystems],
  );

  // Apply N event payloads in commit order and register each eventId in the
  // dedupe set — the bulk equivalent of `awaitServer`. Used by signature paste,
  // import, Thera sync, subchain delete, and manual add (system + gate links).
  const onBulkPaste = useCallback((payloads: MapEventPayload[]) => {
    if (payloads.length === 0) return;
    for (const p of payloads) appliedEventIds.current.add(p.eventId);
    setViewData((prev) => payloads.reduce(applyEvent, prev));
    hydrateAddedSystems(payloads);

    const flashes: Record<string, 'created' | 'updated'> = {};
    for (const p of payloads) {
      if (p.kind === 'signature.create') flashes[p.id] = 'created';
      else if (p.kind === 'signature.update') flashes[p.id] = 'updated';
    }
    if (Object.keys(flashes).length > 0) {
      if (pasteFlashTimer.current) clearTimeout(pasteFlashTimer.current);
      setPasteFlash(flashes);
      pasteFlashTimer.current = setTimeout(() => setPasteFlash({}), 2500);
    }
  }, [hydrateAddedSystems]);

  // ---- xyflow → server callbacks -----------------------------------------
  const mapId = viewData.map.id;

  const onNodesChange = useCallback((changes: NodeChange<CanvasNode>[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
  }, []);

  // Commit the post-drag positions of every selected system. xyflow drags all
  // selected nodes in unison (same delta, formation preserved), writing their
  // live positions into `nodes` via onNodesChange; we read those back, snap
  // each, and PATCH it. The collision nudge runs only against *non-selected*
  // systems so an intra-group overlap never deforms the group. Unchanged
  // positions are skipped.
  const commitGroupMove = useCallback(() => {
    // Read live positions from xyflow's store (authoritative + synchronous at
    // dragStop) rather than the React `nodes` state, which can lag a frame.
    const live = flowInstance.current?.getNodes() ?? [];
    const occupiedOthers: Point[] = viewData.systems
      .filter((s) => !selectedSystemIds.has(s.id))
      .map((s) => ({ x: s.positionX, y: s.positionY }));
    for (const id of selectedSystemIds) {
      const node = live.find((n) => n.id === id);
      const existing = viewData.systems.find((s) => s.id === id);
      if (!node || !existing) continue;
      const snapped = snapPointToGrid(node.position);
      const final = occupiedOthers.some((o) => overlaps(snapped, o, MANUAL_SLOT))
        ? findOpenPosition(snapped, occupiedOthers, MANUAL_SLOT)
        : snapped;
      if (existing.positionX === final.x && existing.positionY === final.y) continue;
      const patch: UpdateSystemBody = { positionX: final.x, positionY: final.y };
      runOptimistic(
        { kind: 'system.updated', eventId: 0, id, positionX: final.x, positionY: final.y },
        () => updateSystemOnServer({ mapId, mapSystemId: id, patch }),
      );
    }
  }, [mapId, viewData.systems, selectedSystemIds, runOptimistic]);

  const onNodeDragStop = useCallback(
    (_event: React.MouseEvent | unknown, node: Node) => {
      // Notes drag independently and may overlap anything — snap, then commit the
      // position optimistically (no collision nudge). Notes aren't tracked in
      // `selectedSystemIds`, but xyflow still group-drags every node it selected
      // (e.g. a box-select over several notes) in unison, so commit each selected
      // note — not just the grabbed one, or the others snap back on release. Read
      // the live store (authoritative at dragStop); the grabbed node is always
      // included even if its `selected` flag hasn't landed yet. The real
      // `ap_map_note.id` lives on `data.id` (the xyflow id is namespaced).
      if (node.type === 'note') {
        const live = flowInstance.current?.getNodes() ?? [];
        const draggedNotes = live.filter(
          (n) => n.type === 'note' && (n.selected || n.id === node.id),
        );
        for (const noteNode of draggedNotes) {
          const noteId = (noteNode.data as MapNoteNodeData).id;
          const note = viewData.notes.find((n) => n.id === noteId);
          if (!note) continue;
          const snapped = snapPointToGrid(noteNode.position);
          if (note.positionX === snapped.x && note.positionY === snapped.y) continue;
          runOptimistic(
            {
              kind: 'note.updated',
              eventId: 0,
              id: noteId,
              title: note.title,
              positionX: snapped.x,
              positionY: snapped.y,
              // Carry the current attribution so the optimistic apply doesn't blank
              // "last edited by"; the authoritative echo overwrites it with the actor.
              lastEditedByCharacterId: note.lastEditedByCharacterId,
              lastEditedByName: note.lastEditedByName,
              updatedAt: new Date().toISOString(),
            },
            () =>
              updateNoteOnServer({
                mapId,
                noteId,
                patch: { positionX: snapped.x, positionY: snapped.y },
              }),
          );
        }
        return;
      }
      // Dragging any member of a multi-selection moves the whole group; commit
      // every selected system's new position, not just the grabbed node.
      if (selectedSystemIds.size > 1 && selectedSystemIds.has(node.id)) {
        commitGroupMove();
        return;
      }
      const existing = viewData.systems.find((s) => s.id === node.id);
      if (!existing) return;
      // Snap the drop, then nudge to the nearest free slot only if it landed on
      // another node. Searching from the snapped drop keeps the nudge minimal.
      const snapped = snapPointToGrid(node.position);
      const occupiedOthers: Point[] = viewData.systems
        .filter((s) => s.id !== node.id)
        .map((s) => ({ x: s.positionX, y: s.positionY }));
      const final = occupiedOthers.some((o) => overlaps(snapped, o, MANUAL_SLOT))
        ? findOpenPosition(snapped, occupiedOthers, MANUAL_SLOT)
        : snapped;
      if (existing.positionX === final.x && existing.positionY === final.y) return;
      const patch: UpdateSystemBody = { positionX: final.x, positionY: final.y };
      runOptimistic(
        {
          kind: 'system.updated',
          eventId: 0,
          id: node.id,
          positionX: final.x,
          positionY: final.y,
        },
        () => updateSystemOnServer({ mapId, mapSystemId: node.id, patch }),
      );
    },
    [mapId, viewData.systems, viewData.notes, selectedSystemIds, commitGroupMove, runOptimistic],
  );

  const onConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target || params.source === params.target) return;
      awaitServer(() =>
        createConnectionOnServer({
          mapId,
          body: {
            sourceMapSystemId: params.source!,
            targetMapSystemId: params.target!,
            scope: 'wh',
          },
        }),
      );
    },
    [mapId, awaitServer],
  );

  // Manually place a system on the map (no wormhole jump). Anchor on the
  // selected system's position when one is selected, else the viewport centre
  // (falling back to (0,0) before the instance is ready), then settle into the
  // nearest open, grid-aligned slot so adds never overlap existing nodes.
  // POST → fold the returned payloads (the new system + any auto-created gate
  // links to systems already on the map) like a bulk paste.
  const onAddSystem = useCallback(
    (systemId: number) => {
      const occupied: Point[] = viewData.systems.map((s) => ({ x: s.positionX, y: s.positionY }));
      // A chain tab is open: the add charts into it (settled design — manual
      // adds join the active chain). Parent = the selected occurrence's member,
      // else the chain's root, else the add becomes the root. The free-canvas
      // position anchors on the parent's canonical spot (the chain-mode
      // viewport is a different plane, so cursor/viewport anchors don't apply).
      if (activeChain) {
        pendingAddPoint.current = null;
        const realMembers = viewData.chainMembers.filter(
          (m) => m.chainId === activeChain.id && m.pointerChainId === null,
        );
        const selectedMember =
          selected?.kind === 'system'
            ? realMembers.find((m) => m.mapSystemId === selected.id)
            : undefined;
        const parentMember = selectedMember ?? realMembers.find((m) => m.parentMemberId === null);
        const parentSystem = parentMember
          ? viewData.systems.find((s) => s.id === parentMember.mapSystemId)
          : undefined;
        const anchorPoint: Point = parentSystem
          ? { x: parentSystem.positionX, y: parentSystem.positionY }
          : { x: 0, y: 0 };
        const pos = findOpenPosition(anchorPoint, occupied);
        void addSystemOnServer({
          mapId,
          systemId,
          positionX: pos.x,
          positionY: pos.y,
          chainId: activeChain.id,
          ...(parentMember ? { parentMemberId: parentMember.id } : {}),
        }).then((result) => {
          if (result.ok) onBulkPaste(result.data.payloads);
        });
        return;
      }
      let anchor: Point | null = null;
      const pending = pendingAddPoint.current;
      if (pending) {
        pendingAddPoint.current = null;
        const inst = flowInstance.current;
        if (inst) anchor = inst.screenToFlowPosition({ x: pending.x, y: pending.y });
      }
      if (!anchor && selected?.kind === 'system') {
        const sel = viewData.systems.find((s) => s.id === selected.id);
        if (sel) anchor = { x: sel.positionX, y: sel.positionY };
      }
      if (!anchor) {
        anchor = { x: 0, y: 0 };
        const inst = flowInstance.current;
        const wrap = flowWrapperRef.current;
        if (inst && wrap) {
          const rect = wrap.getBoundingClientRect();
          anchor = inst.screenToFlowPosition({
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
          });
        }
      }
      const pos = findOpenPosition(anchor, occupied);
      void addSystemOnServer({
        mapId,
        systemId,
        positionX: pos.x,
        positionY: pos.y,
      }).then((result) => {
        if (result.ok) onBulkPaste(result.data.payloads);
      });
    },
    [mapId, onBulkPaste, selected, viewData.systems, viewData.chainMembers, activeChain],
  );

  // Pane "Add system" entry point: remember the cursor point so `onAddSystem`
  // places the chosen system there, then open the existing picker dialog.
  const onAddSystemAt = useCallback((clientX: number, clientY: number) => {
    pendingAddPoint.current = { x: clientX, y: clientY };
    setContextMenu(null);
    setAddSystemOpen(true);
  }, []);

  // ---- Note callbacks ----------------------------------------------------
  // Select a note into the inspector (wired to the node's double-click via the
  // sync block's `data.onOpen`). Stable for the component lifetime.
  const onOpenNote = useCallback((noteId: string) => {
    setSelected({ kind: 'note', id: noteId });
    setSelectedSystemIds(new Set());
  }, []);

  // Pane "Add note here": convert the cursor's client point to flow coords, snap,
  // and POST immediately (notes need no picker dialog). The awaited payload folds
  // the new note in; the user double-clicks it to edit.
  const onAddNoteAt = useCallback(
    (clientX: number, clientY: number) => {
      setContextMenu(null);
      const inst = flowInstance.current;
      const point: Point = inst
        ? inst.screenToFlowPosition({ x: clientX, y: clientY })
        : { x: 0, y: 0 };
      const pos = snapPointToGrid(point);
      awaitServer(() =>
        addNoteOnServer({
          mapId,
          body: { title: 'New note', positionX: pos.x, positionY: pos.y },
        }),
      );
    },
    [mapId, awaitServer],
  );

  const onNotePatch = useCallback(
    (noteId: string, patch: UpdateNoteBody) => {
      const note = viewData.notes.find((n) => n.id === noteId);
      // `note.updated` always carries title + editor attribution + updatedAt; the
      // changed fields ride from `patch`. Optimistic attribution keeps the current
      // values (the authoritative echo replaces them with the real actor).
      const opt: MapEventPayload = {
        kind: 'note.updated',
        eventId: 0,
        id: noteId,
        title: note?.title ?? '',
        lastEditedByCharacterId: note?.lastEditedByCharacterId ?? null,
        lastEditedByName: note?.lastEditedByName ?? null,
        updatedAt: new Date().toISOString(),
        ...patch,
      };
      runOptimistic(opt, () => updateNoteOnServer({ mapId, noteId, patch }));
    },
    [mapId, viewData.notes, runOptimistic],
  );

  const onNoteRemove = useCallback(
    (noteId: string) => {
      const note = viewData.notes.find((n) => n.id === noteId);
      runOptimistic(
        { kind: 'note.deleted', eventId: 0, id: noteId, title: note?.title ?? '' },
        () => deleteNoteOnServer({ mapId, noteId }),
      );
      setSelected(null);
    },
    [mapId, viewData.notes, runOptimistic],
  );

  // Click selection is driven by direct handlers (they own single + Ctrl+click
  // toggle), while `onSelectionChange` is used only as a box-select reconciler
  // (see below). The two don't fight because the reconciler ignores size<=1 and
  // no-ops when xyflow's set already matches ours.
  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      // Notes select singly into the inspector — no multi-select / group semantics.
      if (node.type === 'note') {
        setSelected({ kind: 'note', id: (node.data as MapNoteNodeData).id });
        setSelectedSystemIds(new Set());
        return;
      }
      // Ctrl/Cmd+click toggles the node in the group. The inspector primary is
      // cleared whenever 2+ are selected — a multi-select group drives no
      // inspector / per-system module (which would otherwise thrash on refetch);
      // a lone survivor re-populates it.
      if (event.ctrlKey || event.metaKey) {
        const next = new Set(selectedSystemIds);
        if (next.has(node.id)) next.delete(node.id);
        else next.add(node.id);
        setSelectedSystemIds(next);
        setSelected(next.size === 1 ? { kind: 'system', id: next.values().next().value! } : null);
        return;
      }
      setSelected({ kind: 'system', id: node.id });
      setSelectedSystemIds(new Set([node.id]));
    },
    [selectedSystemIds],
  );

  const onEdgeClick = useCallback((_event: React.MouseEvent, edge: Edge) => {
    setSelected({ kind: 'connection', id: edge.id });
    setSelectedSystemIds(new Set());
  }, []);

  const onPaneClick = useCallback(() => {
    setSelected(null);
    setSelectedSystemIds(new Set());
  }, []);

  // Right-click handlers. Each suppresses the native browser menu and stores the
  // cursor point + target; selection is intentionally left untouched.
  const onNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
    event.preventDefault();
    if (node.type === 'note') {
      setContextMenu({
        kind: 'note',
        id: (node.data as MapNoteNodeData).id,
        x: event.clientX,
        y: event.clientY,
      });
      return;
    }
    setContextMenu({ kind: 'system', id: node.id, x: event.clientX, y: event.clientY });
  }, []);

  const onEdgeContextMenu = useCallback((event: React.MouseEvent, edge: Edge) => {
    event.preventDefault();
    setContextMenu({ kind: 'connection', id: edge.id, x: event.clientX, y: event.clientY });
  }, []);

  const onEndpointContextMenu = useCallback(
    (connectionId: string, end: ConnectionEnd, clientX: number, clientY: number) => {
      setContextMenu({ kind: 'connectionEnd', id: connectionId, end, x: clientX, y: clientY });
    },
    [],
  );

  const onPaneContextMenu = useCallback((event: MouseEvent | React.MouseEvent) => {
    event.preventDefault();
    setContextMenu({ kind: 'pane', x: event.clientX, y: event.clientY });
  }, []);

  const onSelectionStart = useCallback(() => {
    boxSelecting.current = true;
  }, []);

  const onSelectionEnd = useCallback(() => {
    boxSelecting.current = false;
    // Mixed multi-selection is unsupported: if the box caught systems *and* notes,
    // prioritize systems and drop the notes from xyflow's selection — otherwise the
    // notes group-drag with the systems but commit through a different path and
    // rubber-band back on release. A pure-note box is left intact (its multi-note
    // drag reads xyflow's selection directly). Done once at box end so it never
    // fights xyflow's per-move re-selection during the draw.
    const live = flowInstance.current?.getNodes() ?? [];
    const hasSystem = live.some((n) => n.type === 'system' && n.selected);
    const hasNote = live.some((n) => n.type === 'note' && n.selected);
    if (hasSystem && hasNote) {
      setNodes((prev) =>
        prev.map((n) => (n.type === 'note' && n.selected ? { ...n, selected: false } : n)),
      );
    }
  }, []);

  // Box-select-only reconciler. xyflow fires `onSelectionChange` for *every*
  // selection mutation — including the echoes of our own click handlers — so we
  // adopt only while a drag box is active (`boxSelecting`). Adopting on click
  // echoes would fight the click handlers and loop. Single/empty stay owned by
  // the click/pane handlers; the diff check skips a no-op rebuild. The inspector
  // primary is cleared (same rule as Ctrl+click) so the box drag doesn't thrash
  // the per-system modules as nodes enter the rectangle.
  const onSelectionChange = useCallback(
    ({ nodes: selNodes }: OnSelectionChangeParams) => {
      if (!boxSelecting.current) return;
      // `selectedSystemIds` holds system ids only — group ops (move, "Remove N")
      // route through the systems endpoints. Notes caught by the box select
      // singly into the inspector, never the group; drop them here.
      const ids = selNodes.filter((n) => n.type === 'system').map((n) => n.id);
      if (ids.length <= 1) return;
      if (ids.length === selectedSystemIds.size && ids.every((id) => selectedSystemIds.has(id))) {
        return;
      }
      setSelectedSystemIds(new Set(ids));
      setSelected(null);
    },
    [selectedSystemIds],
  );

  // ---- Inspector callbacks -----------------------------------------------
  const onSystemPatch = useCallback(
    (mapSystemId: string, patch: UpdateSystemBody) => {
      const opt: MapEventPayload = {
        kind: 'system.updated',
        eventId: 0,
        id: mapSystemId,
        ...patch,
      };
      runOptimistic(opt, () => updateSystemOnServer({ mapId, mapSystemId, patch }));
    },
    [mapId, runOptimistic],
  );

  const onSystemRemove = useCallback(
    (mapSystemId: string) => {
      runOptimistic({ kind: 'system.removed', eventId: 0, id: mapSystemId }, () =>
        removeSystemOnServer({ mapId, mapSystemId }),
      );
      setSelected(null);
      setSelectedSystemIds(new Set());
    },
    [mapId, runOptimistic],
  );

  // Group delete — driven by the floating "Remove N" button only. There is
  // deliberately no Delete/Backspace keybind: a stray backspace (e.g. while an
  // input is unfocused) must never wipe systems off the map. Loops the existing
  // single-item DELETE endpoint (the onBulkPaste precedent: small, hand-selected
  // groups need no batch endpoint).
  // The Home system and any locked systems are protected from group delete: the
  // server rejects deleting them anyway (Home with a toast, locked outright), so
  // exempting them here avoids the visual delete-then-reappear flicker. Drives
  // both the "Remove N" count and the delete loop.
  const deletableSelectedSystemIds = useMemo(() => {
    const homeId = viewData.map.homeMapSystemId;
    const locked = new Set(viewData.systems.filter((s) => s.locked).map((s) => s.id));
    return [...selectedSystemIds].filter((id) => id !== homeId && !locked.has(id));
  }, [selectedSystemIds, viewData.map.homeMapSystemId, viewData.systems]);

  // How many of the current selection are locked (and so excluded from the group
  // delete) — feeds the "Remove N" button's hint so the count discrepancy is
  // explained rather than silent.
  const lockedSelectedCount = useMemo(() => {
    const locked = new Set(viewData.systems.filter((s) => s.locked).map((s) => s.id));
    return [...selectedSystemIds].filter((id) => locked.has(id)).length;
  }, [selectedSystemIds, viewData.systems]);

  const removeSelectedSystems = useCallback(() => {
    for (const id of deletableSelectedSystemIds) {
      runOptimistic({ kind: 'system.removed', eventId: 0, id }, () =>
        removeSystemOnServer({ mapId, mapSystemId: id }),
      );
    }
    setSelected(null);
    setSelectedSystemIds(new Set());
  }, [mapId, runOptimistic, deletableSelectedSystemIds]);

  const onConnectionPatch = useCallback(
    (connectionId: string, patch: UpdateConnectionBody) => {
      const opt: MapEventPayload = {
        kind: 'connection.update',
        eventId: 0,
        id: connectionId,
        ...patch,
      };
      runOptimistic(opt, () => updateConnectionOnServer({ mapId, connectionId, patch }));
    },
    [mapId, runOptimistic],
  );

  const onConnectionDelete = useCallback(
    (connectionId: string) => {
      runOptimistic({ kind: 'connection.delete', eventId: 0, id: connectionId }, () =>
        deleteConnectionOnServer({ mapId, connectionId }),
      );
      setSelected(null);
    },
    [mapId, runOptimistic],
  );

  const onSignatureCreate = useCallback(
    (body: CreateSignatureBody) => {
      awaitServer(() => createSignatureOnServer({ mapId, body }));
    },
    [mapId, awaitServer],
  );

  const onSignaturePatch = useCallback(
    (signatureId: string, patch: UpdateSignatureBody) => {
      const opt: MapEventPayload = {
        kind: 'signature.update',
        eventId: 0,
        id: signatureId,
        ...patch,
      };
      runOptimistic(opt, () => updateSignatureOnServer({ mapId, signatureId, patch }));
    },
    [mapId, runOptimistic],
  );

  // If a deleted sig resolved to a wormhole, build the "delete the subchain
  // behind it?" offer. Head = the connection's far end; anchor mirrors the two
  // context-menu paths (Home when set, else the sig's own system — always a
  // neighbour of head). Returns null on any missing piece or an empty subchain.
  // Computed against the current (pre-removal) graph, so callers must invoke it
  // before folding the delete into `viewData`.
  const buildSubchainSigOffer = useCallback(
    (sig: MapSignature | undefined): SubchainSigOffer | null => {
      if (!sig || sig.mapConnectionId == null) return null;
      const conn = viewData.connections.find((c) => c.id === sig.mapConnectionId);
      if (!conn) return null;
      const headId = conn.source === sig.mapSystemId ? conn.target : conn.source;
      const anchorId = viewData.map.homeMapSystemId ?? sig.mapSystemId;
      const ids = computeSubchain({
        systems: viewData.systems,
        connections: viewData.connections,
        headId,
        anchorId,
      });
      if (ids.size === 0) return null;
      const head = viewData.systems.find((s) => s.id === headId);
      return {
        headId,
        anchorId,
        headName: head ? head.alias?.trim() || head.name : headId,
        count: ids.size,
      };
    },
    [viewData],
  );

  const onSignatureDelete = useCallback(
    (signatureId: string) => {
      const sig = viewData.signatures.find((s) => s.id === signatureId);
      runOptimistic({ kind: 'signature.delete', eventId: 0, id: signatureId }, () =>
        deleteSignatureOnServer({ mapId, signatureId }),
      );
      const offer = buildSubchainSigOffer(sig);
      if (offer) setSubchainSigPrompts((q) => [...q, offer]);
    },
    [mapId, runOptimistic, viewData, buildSubchainSigOffer],
  );

  // Scan committed paste payloads for wormhole sigs whose remembered connection
  // is currently dormant — i.e. absent from the (pre-fold) view — and turn each
  // into a restore offer. A re-pasted surviving sig commits a `signature.update`
  // carrying a full `snapshot`; a brand-new sig commits `signature.create`.
  // De-duped by connection id; multiple wh sigs → multiple offers.
  const buildRestoreOffers = useCallback(
    (payloads: MapEventPayload[]): RestoreConnOffer[] => {
      const offers: RestoreConnOffer[] = [];
      const seen = new Set<string>();
      for (const p of payloads) {
        const body =
          p.kind === 'signature.update' ? p.snapshot : p.kind === 'signature.create' ? p : null;
        if (!body) continue;
        if (body.groupKey !== 'wormhole') continue;
        const connId = body.mapConnectionId;
        if (connId == null || seen.has(connId)) continue;
        // Present in the view ⇒ confirmed/visible, nothing to restore.
        if (viewData.connections.some((c) => c.id === connId)) continue;
        seen.add(connId);
        const far =
          body.leadsToMapSystemId != null
            ? viewData.systems.find((s) => s.id === body.leadsToMapSystemId)
            : undefined;
        const targetName = far
          ? far.alias?.trim() || far.name
          : (body.wormholeCode ?? 'wormhole');
        offers.push({ connId, targetName });
      }
      return offers;
    },
    [viewData],
  );

  // Fold a signature paste into state, then offer to restore any dormant
  // connection the paste re-confirmed (built from the pre-fold graph). Used by
  // both signature-paste entry points (the CTRL+V hotkey and the panel dialog).
  const onSignaturePasteResult = useCallback(
    (payloads: MapEventPayload[]) => {
      const offers = buildRestoreOffers(payloads);
      onBulkPaste(payloads);
      if (offers.length > 0) setRestoreConnPrompts((q) => [...q, ...offers]);
    },
    [onBulkPaste, buildRestoreOffers],
  );

  // Fold a lazy-delete paste into state, then offer the subchain prompt for each
  // wormhole sig the paste removed — the same prompt the row trash icon raises —
  // plus a restore offer for any dormant connection it re-confirmed. Offers are
  // built from the pre-fold graph, then `onBulkPaste` applies the changes.
  const onLazyDeletePasteResult = useCallback(
    (payloads: MapEventPayload[]) => {
      const offers: SubchainSigOffer[] = [];
      for (const p of payloads) {
        if (p.kind !== 'signature.delete') continue;
        const offer = buildSubchainSigOffer(viewData.signatures.find((s) => s.id === p.id));
        if (offer) offers.push(offer);
      }
      const restoreOffers = buildRestoreOffers(payloads);
      onBulkPaste(payloads);
      if (offers.length > 0) setSubchainSigPrompts((q) => [...q, ...offers]);
      if (restoreOffers.length > 0) setRestoreConnPrompts((q) => [...q, ...restoreOffers]);
    },
    [onBulkPaste, buildSubchainSigOffer, buildRestoreOffers, viewData],
  );

  // ---- Delete subchain ----------------------------------------------------
  // Compute the doomed set from the current view (head + everything orphaned
  // from the keep-side anchor), highlight it, and open the confirm dialog. The
  // server recomputes the set authoritatively on confirm.
  const openSubchainPreview = useCallback(
    (headId: string, anchorId: string) => {
      const ids = computeSubchain({
        systems: viewData.systems,
        connections: viewData.connections,
        headId,
        anchorId,
      });
      if (ids.size === 0) return;
      const head = viewData.systems.find((s) => s.id === headId);
      setSelected(null);
      setSelectedSystemIds(new Set(ids));
      setSubchainPreview({
        headId,
        anchorId,
        headName: head ? head.alias?.trim() || head.name : headId,
        count: ids.size,
      });
    },
    [viewData],
  );

  const onDeleteSubchain = useCallback(
    (headId: string) => {
      const homeId = viewData.map.homeMapSystemId;
      if (homeId === null) return; // the menu only offers this when a Home is set
      openSubchainPreview(headId, homeId);
    },
    [viewData.map.homeMapSystemId, openSubchainPreview],
  );

  const onDeleteSubchainPick = useCallback(
    (headId: string, anchorId: string) => openSubchainPreview(headId, anchorId),
    [openSubchainPreview],
  );

  const onCancelSubchain = useCallback(() => {
    setSubchainPreview(null);
    setSelectedSystemIds(new Set());
  }, []);

  const onConfirmSubchain = useCallback(async () => {
    if (!subchainPreview) return;
    const { headId, anchorId } = subchainPreview;
    setSubchainPreview(null);
    const result = await deleteSubchainOnServer({
      mapId,
      headMapSystemId: headId,
      anchorMapSystemId: anchorId,
    });
    if (result.ok) onBulkPaste(result.data.payloads);
    setSelectedSystemIds(new Set());
  }, [subchainPreview, mapId, onBulkPaste]);

  const dismissSubchainSig = useCallback(() => {
    setSubchainSigPrompts((q) => q.slice(1));
  }, []);

  const onConfirmSubchainSig = useCallback(async () => {
    const active = subchainSigPrompts[0];
    if (!active) return;
    setSubchainSigPrompts((q) => q.slice(1));
    const result = await deleteSubchainOnServer({
      mapId,
      headMapSystemId: active.headId,
      anchorMapSystemId: active.anchorId,
    });
    if (result.ok) onBulkPaste(result.data.payloads);
  }, [subchainSigPrompts, mapId, onBulkPaste]);

  const dismissRestoreConn = useCallback(() => {
    setRestoreConnPrompts((q) => q.slice(1));
  }, []);

  const onConfirmRestoreConn = useCallback(async () => {
    const active = restoreConnPrompts[0];
    if (!active) return;
    setRestoreConnPrompts((q) => q.slice(1));
    const result = await restoreConnectionOnServer({ mapId, connectionId: active.connId });
    if (result.ok) onBulkPaste(result.data.payloads);
  }, [restoreConnPrompts, mapId, onBulkPaste]);

  // ---- Delete disconnected -----------------------------------------------
  // Compute the systems cut off from the Home, highlight them, and open the
  // confirm dialog. The server recomputes the set authoritatively on confirm.
  const onDeleteDisconnected = useCallback(() => {
    const homeId = viewData.map.homeMapSystemId;
    if (homeId === null) return; // the menu only offers this when a Home is set
    const ids = computeDisconnected({
      systems: viewData.systems,
      connections: viewData.connections,
      homeId,
    });
    if (ids.size === 0) return;
    setSelected(null);
    setSelectedSystemIds(new Set(ids));
    setDisconnectedPreview({ count: ids.size });
  }, [viewData]);

  const onCancelDisconnected = useCallback(() => {
    setDisconnectedPreview(null);
    setSelectedSystemIds(new Set());
  }, []);

  const onConfirmDisconnected = useCallback(async () => {
    if (!disconnectedPreview) return;
    setDisconnectedPreview(null);
    const result = await deleteDisconnectedOnServer({ mapId });
    if (result.ok) onBulkPaste(result.data.payloads);
    setSelectedSystemIds(new Set());
  }, [disconnectedPreview, mapId, onBulkPaste]);

  // Ping: fire-and-forget broadcast. No optimistic apply — the underglow arrives
  // over realtime for everyone (this client included) via `MapUnderglowBridge`.
  const onPingSystem = useCallback(
    (mapSystemId: string) => {
      void pingSystemOnServer({ mapId, mapSystemId });
    },
    [mapId],
  );

  const onMoveEnd = useCallback(
    (_: MouseEvent | TouchEvent | null, vp: Viewport) => {
      lastViewportRef.current = vp;
      localStorage.setItem(`aperture:map:${mapId}:viewport`, JSON.stringify(vp));
    },
    [mapId],
  );

  const onAliasOrTagCommit = useCallback(
    (mapSystemId: string, field: 'alias' | 'tag', next: string | null) => {
      onSystemPatch(mapSystemId, { [field]: next });
    },
    [onSystemPatch],
  );

  // ---- xyflow nodes/edges ------------------------------------------------
  //
  // `nodes` is xyflow-managed via `applyNodeChanges` (so the visual drag is
  // smooth — without `onNodesChange` xyflow would emit position events with
  // nowhere to land). When `viewData.systems` or `selectedSystemIds` change we
  // reconcile xyflow's nodes state against them, preserving each node's
  // in-flight drag position (xyflow sets `dragging: true` mid-drag) and
  // xyflow-internal fields (`measured`, etc.) by spreading the existing node
  // — without that xyflow would re-measure on every sync and the nodes
  // briefly flicker out. We sync during render (rather than in an effect) so
  // React discards the pre-sync render before commit instead of cascading.
  // `onAliasOrTagCommit` isn't in the sync key because it's stable for the
  // component's lifetime (its dep chain bottoms out at `mapId` + `useCallback`s
  // with empty deps).
  const [lastSync, setLastSync] = useState<{
    systems: MapViewData['systems'];
    notes: MapViewData['notes'];
    selectedSystemIds: Set<string>;
    // The note-node halo is driven by the inspector `selected` ref (notes have no
    // multi-select set), so a note selection change must trigger a re-sync.
    selected: SelectionRef | null;
    intel: Record<number, SystemIntelSummary>;
    systemNotes: Record<number, SystemNote[]>;
  } | null>(null);
  if (
    !lastSync ||
    lastSync.systems !== viewData.systems ||
    lastSync.notes !== viewData.notes ||
    lastSync.selectedSystemIds !== selectedSystemIds ||
    lastSync.selected !== selected ||
    // `intel` is replaced by reference when a live-added system's data backfills;
    // re-sync so its decorators (sov/FW/incursion) appear without a systems change.
    lastSync.intel !== intel ||
    // Same for `systemNotes` — the node's notes indicator tracks CRUD + backfill.
    lastSync.systemNotes !== systemNotes
  ) {
    setLastSync({
      systems: viewData.systems,
      notes: viewData.notes,
      selectedSystemIds,
      selected,
      intel,
      systemNotes,
    });
    setNodes((prev) => {
      const prevById = new Map(prev.map((n) => [n.id, n]));
      return [
        ...viewData.systems.map((s) => {
          const existing = prevById.get(s.id);
          const position = existing?.dragging
            ? existing.position
            : { x: s.positionX, y: s.positionY };
          return {
            ...(existing ?? {}),
            id: s.id,
            type: 'system' as const,
            position,
            data: {
              ...s,
              onAliasOrTagCommit,
              isHome: s.id === viewData.map.homeMapSystemId,
              inFactionWarfare: intel[s.systemId]?.factionWar != null,
              hasIncursion: intel[s.systemId]?.incursion != null,
              hasNotes: (systemNotes[s.systemId] ?? []).length > 0,
            },
            selected: selectedSystemIds.has(s.id),
            draggable: !s.locked,
          };
        }),
        ...viewData.notes.map((n) => {
          const existing = prevById.get(noteNodeId(n.id));
          const position = existing?.dragging
            ? existing.position
            : { x: n.positionX, y: n.positionY };
          return {
            ...(existing ?? {}),
            id: noteNodeId(n.id),
            type: 'note' as const,
            position,
            data: { ...n, onOpen: onOpenNote },
            selected: selected?.kind === 'note' && selected.id === n.id,
            draggable: !n.locked,
          };
        }),
      ];
    });
  }

  const edges = useMemo<Edge<ConnectionEdgeData>[]>(() => {
    const whByConn = buildWormholeByConnection(viewData.signatures);

    return viewData.connections.map((c) => {
      const wh = whByConn.get(c.id) ?? null;
      return {
        id: c.id,
        type: 'connection',
        source: c.source,
        target: c.target,
        data: {
          ...c,
          mapId: viewData.map.id,
          wormholeTypeId: wh?.typeId ?? null,
          wormholeCode: wh?.code ?? null,
          onEndpointContextMenu,
        },
        selected: selected?.kind === 'connection' && selected.id === c.id,
      };
    });
  }, [viewData.connections, viewData.signatures, viewData.map.id, selected, onEndpointContextMenu]);

  // ---- Chain mode derivations + handlers ---------------------------------
  //
  // The active chain's generated tree — pure derivation from viewData, re-run
  // when membership/system/connection state or the orientation changes. The
  // mobile view is the same derivation with touch-sized params and root-top
  // forced (phones are portrait; the orientation pref is a desktop concern).
  const chainModel = useMemo(() => {
    if (!activeChain) return null;
    return buildChainCanvas({
      chainId: activeChain.id,
      chains: visibleChains,
      members: viewData.chainMembers,
      systems: viewData.systems,
      liveConnectionIds: new Set(viewData.connections.map((c) => c.id)),
      params: mobileChainActive ? MOBILE_CHAIN_TILE_PARAMS : CHAIN_TILE_PARAMS,
      orientation: mobileChainActive ? 'root-top' : chainView.orientation,
    });
  }, [
    activeChain,
    visibleChains,
    viewData.chainMembers,
    viewData.systems,
    viewData.connections,
    chainView.orientation,
    mobileChainActive,
  ]);

  // Occurrence tiles reuse the `system` node type with the canonical row's data
  // (full SystemNode affordances: status ring, presence, sig/intel indicators,
  // inline alias/tag edit), keyed `chainId:mapSystemId`; selection reflects the
  // canonical `selectedSystemIds`. Pointer-leaves are non-selectable pills.
  const chainNodes = useMemo<ChainCanvasNode[]>(() => {
    if (!chainModel) return [];
    return [
      ...chainModel.occurrences.map((o) => ({
        id: o.id,
        type: 'system' as const,
        position: { x: o.x, y: o.y },
        data: {
          ...o.system,
          onAliasOrTagCommit,
          isHome: o.mapSystemId === viewData.map.homeMapSystemId,
          inFactionWarfare: intel[o.system.systemId]?.factionWar != null,
          hasIncursion: intel[o.system.systemId]?.incursion != null,
          hasNotes: (systemNotes[o.system.systemId] ?? []).length > 0,
        },
        selected: selectedSystemIds.has(o.mapSystemId),
        draggable: false,
      })),
      ...chainModel.pointers.map((p) => ({
        id: p.id,
        type: 'chainPointer' as const,
        position: { x: p.x, y: p.y },
        data: {
          memberId: p.memberId,
          targetChainId: p.targetChainId,
          targetChainName: p.targetChainName,
          isLoop: p.isLoop,
          targetMapSystemId: p.targetMapSystemId,
          targetSystemName: p.targetSystemName,
        },
        selectable: false,
        draggable: false,
      })),
    ];
  }, [
    chainModel,
    intel,
    systemNotes,
    selectedSystemIds,
    viewData.map.homeMapSystemId,
    onAliasOrTagCommit,
  ]);

  // Tree edges: a live backing connection renders through the real
  // ConnectionEdge (its id IS the connection id, so edge selection drives the
  // canonical inspector); a link with no live connection renders as a muted
  // dashed default edge.
  const chainEdges = useMemo<Edge[]>(() => {
    if (!chainModel) return [];
    const connById = new Map(viewData.connections.map((c) => [c.id, c]));
    const whByConn = buildWormholeByConnection(viewData.signatures);
    return chainModel.edges.map((e): Edge => {
      const conn = e.connectionId != null ? connById.get(e.connectionId) : undefined;
      if (!conn) {
        return {
          id: e.id,
          source: e.sourceNodeId,
          target: e.targetNodeId,
          selectable: false,
          style: {
            stroke: 'var(--muted-foreground)',
            strokeDasharray: '4 4',
            strokeWidth: 1.5,
            opacity: 0.5,
          },
        };
      }
      const wh = whByConn.get(conn.id) ?? null;
      return {
        id: e.id,
        type: 'connection',
        source: e.sourceNodeId,
        target: e.targetNodeId,
        data: {
          ...conn,
          mapId: viewData.map.id,
          wormholeTypeId: wh?.typeId ?? null,
          wormholeCode: wh?.code ?? null,
          onEndpointContextMenu,
        },
        selected: selected?.kind === 'connection' && selected.id === conn.id,
      };
    });
  }, [
    chainModel,
    viewData.connections,
    viewData.signatures,
    viewData.map.id,
    selected,
    onEndpointContextMenu,
  ]);

  // Drawer / All-list cards for the mobile chain view — the same blob-content
  // derivation the forest blobs use, so the summaries agree; distance badges
  // join at render from the shared `chainDistanceBadges` record.
  const mobileChainCards = useMemo(() => {
    if (!mobileChainActive) return [];
    return buildMobileChainCards({
      chains: visibleChains,
      members: viewData.chainMembers,
      systems: viewData.systems,
      criticalConnectionIds: new Set(
        viewData.connections.filter((c) => c.eolStage === 'critical').map((c) => c.id),
      ),
    });
  }, [
    mobileChainActive,
    visibleChains,
    viewData.chainMembers,
    viewData.systems,
    viewData.connections,
  ]);

  // Pointer-leaf navigation: switch to the target chain's tab focused on the
  // target system (a loop stays in the current tab). Selection maps onto the
  // canonical model so the inspector and sidebar modules follow.
  const openPointerTarget = useCallback(
    (p: ChainPointerNodeData) => {
      if (!p.isLoop && !visibleChains.some((c) => c.id === p.targetChainId)) {
        toast.info('That chain is not shared with you.');
        return;
      }
      if (!p.isLoop) updateChainView({ activeChainId: p.targetChainId });
      setSelected({ kind: 'system', id: p.targetMapSystemId });
      setSelectedSystemIds(new Set([p.targetMapSystemId]));
      requestChainFocus(p.targetMapSystemId);
    },
    [visibleChains, updateChainView, requestChainFocus],
  );

  // Chain-mode click handlers: occurrence clicks select the CANONICAL system
  // (the xyflow id is `chainId:mapSystemId`; `data.id` is the map-system id),
  // so every module keyed on the selection works unchanged.
  const onChainNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (node.type === 'chainPointer') {
        openPointerTarget(node.data as ChainPointerNodeData);
        return;
      }
      const mapSystemId = (node.data as SystemNodeData).id;
      setSelected({ kind: 'system', id: mapSystemId });
      setSelectedSystemIds(new Set([mapSystemId]));
    },
    [openPointerTarget],
  );

  const onChainEdgeClick = useCallback((_event: React.MouseEvent, edge: Edge) => {
    // Only live connections are selectable (their edge id is the connection id);
    // dashed fallback edges carry `chainedge:` ids and `selectable: false`.
    if (edge.id.startsWith('chainedge:')) return;
    setSelected({ kind: 'connection', id: edge.id });
    setSelectedSystemIds(new Set());
  }, []);

  // Charting a draw inside a chain tab: the same connection POST as the free
  // canvas, carrying the chain context so the membership write-through accretes
  // (the `chain.member.added` arrives over realtime).
  const onChainConnect = useCallback(
    (params: Connection) => {
      if (!activeChain || !chainModel) return;
      const src = chainModel.occurrences.find((o) => o.id === params.source);
      const tgt = chainModel.occurrences.find((o) => o.id === params.target);
      if (!src || !tgt || src.mapSystemId === tgt.mapSystemId) return;
      awaitServer(() =>
        createConnectionOnServer({
          mapId,
          body: {
            sourceMapSystemId: src.mapSystemId,
            targetMapSystemId: tgt.mapSystemId,
            scope: 'wh',
            chainId: activeChain.id,
            sourceMemberId: src.memberId,
          },
        }),
      );
    },
    [mapId, awaitServer, activeChain, chainModel],
  );

  const onChainNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
    event.preventDefault();
    if (node.type !== 'system') return;
    setContextMenu({
      kind: 'system',
      id: (node.data as SystemNodeData).id,
      x: event.clientX,
      y: event.clientY,
    });
  }, []);

  const onChainEdgeContextMenu = useCallback((event: React.MouseEvent, edge: Edge) => {
    event.preventDefault();
    if (edge.id.startsWith('chainedge:')) return;
    setContextMenu({ kind: 'connection', id: edge.id, x: event.clientX, y: event.clientY });
  }, []);

  // Chain mode has no pane menu (its "Add system here" semantics belong to the
  // free canvas) — just suppress the native browser menu.
  // The free-canvas pane menu is position-bound (add-at-cursor, notes, paste
  // targets), which a generated layout can't honor — so a chain/forest pane
  // right-click opens the Add System dialog directly instead of a menu.
  // `onAddSystem` threads the active chain (All/forest ⇒ chainless/Unassigned);
  // an empty chain's first add becomes its root.
  const onChainPaneContextMenu = useCallback((event: MouseEvent | React.MouseEvent) => {
    event.preventDefault();
    setAddSystemOpen(true);
  }, []);

  // ---- Chain lifecycle (tab strip callbacks) -----------------------------
  const onChainSelect = useCallback(
    (chainId: string | null) => {
      // Drop any stale focus request: a remounting ChainCanvas resets its
      // applied-token guard, so a leftover request would re-center instead of
      // letting the fresh tab fit its tree.
      setChainFocus(null);
      updateChainView({ activeChainId: chainId });
    },
    [updateChainView],
  );

  const onChainOrientationChange = useCallback(
    (orientation: ChainLayoutOrientation) => updateChainView({ orientation }),
    [updateChainView],
  );

  // Await-then-apply (like `awaitServer`), plus activating the new tab. A
  // create failure has no optimistic state to reconcile, so no resync.
  const onChainCreate = useCallback(
    async (name: string, kind: ChainKind) => {
      const result = await createChainOnServer({ mapId, name, kind });
      if (!result.ok) return;
      appliedEventIds.current.add(result.eventId);
      setViewData((prev) => applyEvent(prev, result.data));
      if (result.data.kind === 'chain.created') updateChainView({ activeChainId: result.data.id });
    },
    [mapId, updateChainView],
  );

  const onChainRename = useCallback(
    (chainId: string, name: string) => {
      runOptimistic(
        { kind: 'chain.renamed', eventId: 0, id: chainId, name, updatedAt: new Date().toISOString() },
        () => renameChainOnServer({ mapId, chainId, name }),
      );
    },
    [mapId, runOptimistic],
  );

  const onChainDelete = useCallback(
    (chainId: string) => {
      const chain = viewData.chains.find((c) => c.id === chainId);
      runOptimistic({ kind: 'chain.deleted', eventId: 0, id: chainId, name: chain?.name ?? '' }, () =>
        deleteChainOnServer({ mapId, chainId }),
      );
      // Deleting the open chain falls back to the All forest — the viewer was
      // in chain-land; dropping to the free canvas would be a mode switch.
      if (activeChainIdRef.current === chainId) updateChainView({ activeChainId: ALL_CHAINS_TAB });
    },
    [mapId, runOptimistic, viewData.chains, updateChainView],
  );

  // ---- All-view forest derivations + handlers (Stage 5) ------------------
  //
  // Geometry comes from the full tree footprints (never re-packed by zoom or
  // expansion), so pan/zoom stays smooth; the LOD blobs swap in per chain via
  // `shouldCollapseChain` inside `buildForestCanvas`.
  const forestModel = useMemo(() => {
    // The mobile All tab renders the chain-card list, never the forest — skip
    // the whole-forest derivation on a phone.
    if (!isForestTab || mobileChainActive) return null;
    return buildForestCanvas({
      chains: visibleChains,
      members: viewData.chainMembers,
      systems: viewData.systems,
      liveConnectionIds: new Set(viewData.connections.map((c) => c.id)),
      criticalConnectionIds: new Set(
        viewData.connections.filter((c) => c.eolStage === 'critical').map((c) => c.id),
      ),
      zoom: forestZoom,
      threshold: chainBlobThreshold,
      expandedChainIds,
      params: CHAIN_TILE_PARAMS,
      orientation: chainView.orientation,
      viewportWidth: forestViewportWidth,
      blockGap: CHAIN_FOREST_BLOCK_GAP,
    });
  }, [
    isForestTab,
    mobileChainActive,
    visibleChains,
    viewData.chainMembers,
    viewData.systems,
    viewData.connections,
    forestZoom,
    chainBlobThreshold,
    expandedChainIds,
    chainView.orientation,
    forestViewportWidth,
  ]);

  const forestNodes = useMemo<ChainForestCanvasNode[]>(() => {
    if (!forestModel) return [];
    const systemData = (system: MapSystemNode, mapSystemId: string): SystemNodeData => ({
      ...system,
      onAliasOrTagCommit,
      isHome: mapSystemId === viewData.map.homeMapSystemId,
      inFactionWarfare: intel[system.systemId]?.factionWar != null,
      hasIncursion: intel[system.systemId]?.incursion != null,
      hasNotes: (systemNotes[system.systemId] ?? []).length > 0,
    });
    return [
      ...forestModel.labels.map((l) => ({
        id: `chainlbl:${l.chainId ?? 'unassigned'}`,
        type: 'chainLabel' as const,
        position: { x: l.x, y: l.y - CHAIN_FOREST_LABEL_OFFSET },
        data: {
          chainId: l.chainId,
          label: l.label,
          kind: l.kind,
          collapsible: l.collapsible,
          maxWidth: l.maxWidth,
          onToggleExpand: onToggleChainExpand,
        } satisfies ChainLabelNodeData,
        selectable: false,
        draggable: false,
      })),
      ...forestModel.blobs.map((b) => ({
        id: `chainblob:${b.chainId}`,
        type: 'chainBlob' as const,
        position: { x: b.x, y: b.y },
        data: {
          content: b.content,
          width: b.width,
          height: b.height,
          expandable: b.expandable,
          kind: b.kind,
          distance: chainDistanceBadges?.[b.chainId],
          onToggleExpand: onToggleChainExpand,
        } satisfies ChainBlobNodeData,
        selected: selected?.kind === 'chain' && selected.id === b.chainId,
        draggable: false,
      })),
      ...forestModel.occurrences.map((o) => ({
        id: o.id,
        type: 'system' as const,
        position: { x: o.x, y: o.y },
        data: systemData(o.system, o.mapSystemId),
        selected: selectedSystemIds.has(o.mapSystemId),
        draggable: false,
      })),
      ...forestModel.pointers.map((p) => ({
        id: p.id,
        type: 'chainPointer' as const,
        position: { x: p.x, y: p.y },
        data: {
          memberId: p.memberId,
          targetChainId: p.targetChainId,
          targetChainName: p.targetChainName,
          isLoop: p.isLoop,
          targetMapSystemId: p.targetMapSystemId,
          targetSystemName: p.targetSystemName,
        },
        selectable: false,
        draggable: false,
      })),
      ...forestModel.unassigned.map((tile) => ({
        id: tile.mapSystemId,
        type: 'system' as const,
        position: { x: tile.x, y: tile.y },
        data: systemData(tile.system, tile.mapSystemId),
        selected: selectedSystemIds.has(tile.mapSystemId),
        draggable: false,
      })),
    ];
  }, [
    forestModel,
    intel,
    systemNotes,
    selected,
    selectedSystemIds,
    viewData.map.homeMapSystemId,
    onAliasOrTagCommit,
    onToggleChainExpand,
    chainDistanceBadges,
  ]);

  // Forest edge ids are member-keyed (one connection can back links in several
  // chains at once, and xyflow ids must be unique) — canonical selection and
  // the endpoint context menu resolve through the connection carried in `data`.
  const forestEdges = useMemo<Edge[]>(() => {
    if (!forestModel) return [];
    const connById = new Map(viewData.connections.map((c) => [c.id, c]));
    const whByConn = buildWormholeByConnection(viewData.signatures);
    return forestModel.edges.map((e): Edge => {
      const conn = e.connectionId != null ? connById.get(e.connectionId) : undefined;
      if (!conn) {
        return {
          id: e.id,
          source: e.sourceNodeId,
          target: e.targetNodeId,
          selectable: false,
          style: {
            stroke: 'var(--muted-foreground)',
            strokeDasharray: '4 4',
            strokeWidth: 1.5,
            opacity: 0.5,
          },
        };
      }
      const wh = whByConn.get(conn.id) ?? null;
      return {
        id: e.id,
        type: 'connection',
        source: e.sourceNodeId,
        target: e.targetNodeId,
        data: {
          ...conn,
          mapId: viewData.map.id,
          wormholeTypeId: wh?.typeId ?? null,
          wormholeCode: wh?.code ?? null,
          // ConnectionEdge passes its own (member-keyed) edge id here; the
          // menu needs the canonical connection id.
          onEndpointContextMenu: (_edgeId: string, end: ConnectionEnd, x: number, y: number) =>
            onEndpointContextMenu(conn.id, end, x, y),
        },
        selected: selected?.kind === 'connection' && selected.id === conn.id,
      };
    });
  }, [
    forestModel,
    viewData.connections,
    viewData.signatures,
    viewData.map.id,
    selected,
    onEndpointContextMenu,
  ]);

  const onForestNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (node.type === 'chainPointer') {
        openPointerTarget(node.data as ChainPointerNodeData);
        return;
      }
      if (node.type === 'chainBlob') {
        const chainId = (node.data as ChainBlobNodeData).content.chainId;
        setSelected({ kind: 'chain', id: chainId });
        setSelectedSystemIds(new Set());
        return;
      }
      if (node.type === 'chainLabel') {
        const chainId = (node.data as ChainLabelNodeData).chainId;
        if (chainId) {
          setSelected({ kind: 'chain', id: chainId });
          setSelectedSystemIds(new Set());
        }
        return;
      }
      const mapSystemId = (node.data as SystemNodeData).id;
      setSelected({ kind: 'system', id: mapSystemId });
      setSelectedSystemIds(new Set([mapSystemId]));
    },
    [openPointerTarget],
  );

  const onForestNodeDoubleClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      const chainId =
        node.type === 'chainBlob'
          ? (node.data as ChainBlobNodeData).content.chainId
          : node.type === 'chainLabel'
            ? (node.data as ChainLabelNodeData).chainId
            : null;
      if (chainId) onChainSelect(chainId);
    },
    [onChainSelect],
  );

  const onForestEdgeClick = useCallback((_event: React.MouseEvent, edge: Edge) => {
    const connectionId = (edge.data as { id?: string } | undefined)?.id;
    if (!connectionId) return; // dashed fallback edges carry no connection
    setSelected({ kind: 'connection', id: connectionId });
    setSelectedSystemIds(new Set());
  }, []);

  const onForestNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
    event.preventDefault();
    if (node.type !== 'system') return;
    setContextMenu({
      kind: 'system',
      id: (node.data as SystemNodeData).id,
      x: event.clientX,
      y: event.clientY,
    });
  }, []);

  const onForestEdgeContextMenu = useCallback((event: React.MouseEvent, edge: Edge) => {
    event.preventDefault();
    const connectionId = (edge.data as { id?: string } | undefined)?.id;
    if (!connectionId) return;
    setContextMenu({ kind: 'connection', id: connectionId, x: event.clientX, y: event.clientY });
  }, []);

  const selectedSystem: MapSystemNode | null = useMemo(() => {
    if (selected?.kind !== 'system') return null;
    return viewData.systems.find((s) => s.id === selected.id) ?? null;
  }, [selected, viewData.systems]);

  // EVE solar-system ids already placed — lets the add dialog flag duplicates.
  const existingSystemIds = useMemo(
    () => new Set(viewData.systems.map((s) => s.systemId)),
    [viewData.systems],
  );

  // Visible map systems for the settings dialog's Auto-tagging Home picker.
  const manageSystems = useMemo(
    () =>
      [...viewData.systems]
        .map((s) => ({ id: s.id, name: s.name, alias: s.alias }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [viewData.systems],
  );

  // ---- Structure-intel callbacks -----------------------------------------
  //
  // Plain REST (no map event, no realtime echo): await the server, then update
  // local state with the returned row. Failures already toast via the client
  // wrappers, so we just leave local state untouched.
  const sortByName = (a: StructureIntel, b: StructureIntel) => a.name.localeCompare(b.name);

  const onStructureCreate = useCallback(
    async (values: StructureFormValues) => {
      if (!selectedSystem) return;
      const systemId = selectedSystem.systemId;
      const result = await createStructureOnServer({ systemId, ...values });
      if (!result.ok) return;
      setStructures((prev) => ({
        ...prev,
        [systemId]: [...(prev[systemId] ?? []), result.data].sort(sortByName),
      }));
    },
    [selectedSystem],
  );

  const onStructurePatch = useCallback(async (structureId: string, values: StructureFormValues) => {
    const result = await updateStructureOnServer({ structureId, patch: values });
    if (!result.ok) return;
    const updated = result.data;
    setStructures((prev) => ({
      ...prev,
      [updated.systemId]: (prev[updated.systemId] ?? [])
        .map((s) => (s.id === structureId ? updated : s))
        .sort(sortByName),
    }));
  }, []);

  const onStructureDelete = useCallback(
    async (structureId: string) => {
      if (!selectedSystem) return;
      const systemId = selectedSystem.systemId;
      const result = await deleteStructureOnServer({ structureId });
      if (!result.ok) return;
      setStructures((prev) => ({
        ...prev,
        [systemId]: (prev[systemId] ?? []).filter((s) => s.id !== structureId),
      }));
    },
    [selectedSystem],
  );

  // ---- Global system-note callbacks ---------------------------------------
  //
  // Same plain-REST shape as structures. Lists stay newest-first, matching the
  // read-side order.
  const sortNewestFirst = (a: SystemNote, b: SystemNote) =>
    b.createdAt.localeCompare(a.createdAt);

  const onSystemNoteCreate = useCallback(
    async (values: SystemNoteFormValues) => {
      if (!selectedSystem) return;
      const systemId = selectedSystem.systemId;
      const result = await createSystemNoteOnServer({ systemId, ...values });
      if (!result.ok) return;
      setSystemNotes((prev) => ({
        ...prev,
        [systemId]: [result.data, ...(prev[systemId] ?? [])].sort(sortNewestFirst),
      }));
    },
    [selectedSystem],
  );

  const onSystemNotePatch = useCallback(async (noteId: string, patch: UpdateSystemNoteBody) => {
    const result = await updateSystemNoteOnServer({ noteId, patch });
    if (!result.ok) return;
    const updated = result.data;
    setSystemNotes((prev) => ({
      ...prev,
      [updated.systemId]: (prev[updated.systemId] ?? []).map((n) =>
        n.id === noteId ? updated : n,
      ),
    }));
  }, []);

  // Jump target for the notes browser: focus the system if it's on this map.
  const onJumpToSystem = useCallback(
    (systemId: number) => {
      const target = viewData.systems.find((s) => s.systemId === systemId);
      if (!target) {
        toast.info('That system is not on this map.');
        return;
      }
      setSelected({ kind: 'system', id: target.id });
      setSelectedSystemIds(new Set([target.id]));
      if (activeChainIdRef.current) {
        // Chain mode: center the occurrence through the chain canvas (no-op
        // when the system has no occurrence in the open chain).
        requestChainFocus(target.id);
        return;
      }
      const inst = flowInstance.current;
      const node = inst?.getNode(target.id);
      if (inst && node) {
        const w = node.measured?.width ?? node.width ?? 0;
        const h = node.measured?.height ?? node.height ?? 0;
        inst.setCenter(node.position.x + w / 2, node.position.y + h / 2, {
          zoom: inst.getZoom(),
          duration: 0,
        });
      }
    },
    [viewData.systems, requestChainFocus],
  );

  // Keyboard selection movement: graph-adjacent neighbor in the pressed
  // direction first (within a generous cone), else nearest system by position
  // in that direction; with nothing selected, land on Home (or the first
  // system). Positions come from the live xyflow nodes.
  const onMoveSelection = useCallback(
    (dir: MoveDirection) => {
      const inst = flowInstance.current;
      const current = selectedSystem;
      if (!current) {
        const start =
          viewData.systems.find((s) => s.id === viewData.map.homeMapSystemId) ??
          viewData.systems[0];
        if (start) onJumpToSystem(start.systemId);
        return;
      }
      const posOf = (id: string) => {
        const n = inst?.getNode(id);
        return n ? { x: n.position.x, y: n.position.y } : null;
      };
      const cur = posOf(current.id);
      if (!cur) return;
      const vec = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir] as [
        number,
        number,
      ];
      const pick = (ids: Iterable<string>) => {
        let best: { id: string; d: number } | null = null;
        for (const id of ids) {
          if (id === current.id) continue;
          const p = posOf(id);
          if (!p) continue;
          const dx = p.x - cur.x;
          const dy = p.y - cur.y;
          const proj = dx * vec[0] + dy * vec[1];
          if (proj <= 0) continue;
          const ortho = Math.abs(dx * vec[1]) + Math.abs(dy * vec[0]);
          if (ortho > proj * 1.75) continue;
          const d = Math.hypot(dx, dy);
          if (!best || d < best.d) best = { id, d };
        }
        return best?.id ?? null;
      };
      const neighbors = new Set<string>();
      for (const c of viewData.connections) {
        if (c.source === current.id) neighbors.add(c.target);
        if (c.target === current.id) neighbors.add(c.source);
      }
      const nextId = pick(neighbors) ?? pick(viewData.systems.map((s) => s.id));
      if (!nextId) return;
      const next = viewData.systems.find((s) => s.id === nextId);
      if (next) onJumpToSystem(next.systemId);
    },
    [selectedSystem, viewData.systems, viewData.connections, viewData.map.homeMapSystemId, onJumpToSystem],
  );

  const onClearSelection = useCallback(() => {
    setSelected(null);
    setSelectedSystemIds(new Set());
  }, []);

  // Command-palette action context: the current selection plus the exact
  // callbacks the equivalent buttons use (see `keyboardActions.ts`).
  const selectedConnection = useMemo(
    () =>
      selected?.kind === 'connection'
        ? (viewData.connections.find((c) => c.id === selected.id) ?? null)
        : null,
    [selected, viewData.connections],
  );
  const openAddSystem = useCallback(() => setAddSystemOpen(true), []);
  const paletteContext = useMemo<KeyboardActionContext>(
    () => ({
      selectedSystem,
      selectedConnection,
      homeMapSystemId: viewData.map.homeMapSystemId,
      systems: viewData.systems,
      onSystemPatch,
      onSystemRemove,
      onConnectionPatch,
      onConnectionDelete,
      openAddSystem,
      jumpToSystem: onJumpToSystem,
    }),
    [
      selectedSystem,
      selectedConnection,
      viewData.map.homeMapSystemId,
      viewData.systems,
      onSystemPatch,
      onSystemRemove,
      onConnectionPatch,
      onConnectionDelete,
      openAddSystem,
      onJumpToSystem,
    ],
  );

  // Mobile node action sheet (light charting): the same registry the palette
  // renders, with the selected occurrence's INBOUND chain connection standing
  // in for an edge selection — a phone user taps nodes, never edges, so the
  // Connection group operates on the tree edge targeting the selected member.
  const mobileInboundConnection = useMemo(() => {
    if (!mobileChainActive) return null;
    const connectionId = resolveInboundConnectionId(chainModel, selectedSystem?.id ?? null);
    if (connectionId === null) return null;
    return viewData.connections.find((c) => c.id === connectionId) ?? null;
  }, [mobileChainActive, chainModel, selectedSystem, viewData.connections]);

  // The sheet builds its actions from this context itself (the CommandPalette
  // pattern — the registry runs in the consuming component).
  const mobileSheetContext = useMemo<KeyboardActionContext>(
    () => ({ ...paletteContext, selectedConnection: mobileInboundConnection }),
    [paletteContext, mobileInboundConnection],
  );

  const onSystemNoteDelete = useCallback(
    async (noteId: string) => {
      if (!selectedSystem) return;
      const systemId = selectedSystem.systemId;
      const result = await deleteSystemNoteOnServer({ noteId });
      if (!result.ok) return;
      setSystemNotes((prev) => ({
        ...prev,
        [systemId]: (prev[systemId] ?? []).filter((n) => n.id !== noteId),
      }));
    },
    [selectedSystem],
  );

  // Panels the user hasn't hidden, in registry order. Order is cosmetic — the
  // grid positions by each item's `i`, not by child order.
  // One grid cell per group in the active breakpoint whose members aren't all
  // hidden. `layout.groups[breakpoint]` may be undefined before the first
  // breakpoint report resolves against a hand-authored blob.
  const visibleGroups = (layout.groups[breakpoint] ?? []).filter((g) =>
    g.members.some((m) => !layout.hidden.includes(m)),
  );

  // The JSX for one panel's body. The canvas keeps its own positioned wrapper
  // (overlays + menu + dialog); the rest are the existing sidebar/signature
  // modules with unchanged props.
  const panelContent = (id: PanelId) => {
    switch (id) {
      case 'canvas':
        return (
          <div className="flex h-full flex-col overflow-hidden rounded-lg ring-1 ring-foreground/10">
            <ChainTabStrip
              chains={visibleChains}
              activeChainId={resolvedChainTab}
              canManage={canManage}
              orientation={chainView.orientation}
              distances={chainDistanceBadges}
              onSelect={onChainSelect}
              onOrientationChange={onChainOrientationChange}
              onCreate={onChainCreate}
              onRename={onChainRename}
              onDelete={onChainDelete}
            />
            {activeChain === null && !isForestTab ? (
            <div ref={flowWrapperRef} className="relative min-h-0 flex-1">
            {selectedSystemIds.size > 1 &&
              deletableSelectedSystemIds.length > 0 &&
              !subchainPreview &&
              !disconnectedPreview && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={removeSelectedSystems}
                  title={
                    lockedSelectedCount > 0
                      ? `${lockedSelectedCount} locked system${lockedSelectedCount > 1 ? 's' : ''} excluded — unlock to remove`
                      : undefined
                  }
                  className="nodrag nopan absolute right-2 top-2 z-10"
                >
                  <Trash2 />
                  Remove {deletableSelectedSystemIds.length}
                  {lockedSelectedCount > 0 && (
                    <span className="ml-1 text-[10px] opacity-80">({lockedSelectedCount} locked)</span>
                  )}
                </Button>
              )}
            <TransitSignaturePrompt
              systems={viewData.systems}
              connections={viewData.connections}
              signatures={viewData.signatures}
              viewerCharacters={viewerCharacters}
              onPatchSignature={onSignaturePatch}
              onConnectionPatch={onConnectionPatch}
            />
            {subchainSigPrompts[0] && (
              <SubchainDeletePrompt
                headName={subchainSigPrompts[0].headName}
                count={subchainSigPrompts[0].count}
                onConfirm={onConfirmSubchainSig}
                onDismiss={dismissSubchainSig}
              />
            )}
            {restoreConnPrompts[0] && (
              <RestoreConnectionPrompt
                targetName={restoreConnPrompts[0].targetName}
                onConfirm={onConfirmRestoreConn}
                onDismiss={dismissRestoreConn}
              />
            )}
            {subchainPreview && (
              <SubchainDeletePrompt
                lead="Delete subchain beyond"
                headName={subchainPreview.headName}
                count={subchainPreview.count}
                onConfirm={onConfirmSubchain}
                onDismiss={onCancelSubchain}
              />
            )}
            {disconnectedPreview && (
              <SubchainDeletePrompt
                lead="Delete systems disconnected from Home"
                count={disconnectedPreview.count}
                onConfirm={onConfirmDisconnected}
                onDismiss={onCancelDisconnected}
              />
            )}
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
              onSelectionStart={onSelectionStart}
              onSelectionEnd={onSelectionEnd}
              onSelectionChange={onSelectionChange}
              onInit={(inst) => {
                flowInstance.current = inst;
              }}
              onNodesChange={onNodesChange}
              onNodeDragStop={onNodeDragStop}
              onConnect={onConnect}
              snapToGrid
              snapGrid={[GRID_SIZE, GRID_SIZE]}
              nodesDraggable
              nodesConnectable
              selectionKeyCode={['Control', 'Meta']}
              multiSelectionKeyCode={['Control', 'Meta']}
              selectionMode={SelectionMode.Partial}
              deleteKeyCode={null}
              connectionMode={ConnectionMode.Loose}
              edgesFocusable
              colorMode="dark"
              fitView={lastViewportRef.current === null}
              defaultViewport={lastViewportRef.current ?? undefined}
              zoomOnScroll={false}
              preventScrolling={false}
              onMoveEnd={onMoveEnd}
              proOptions={{ hideAttribution: true }}
            >
              <Background />
              <Controls showInteractive={false} />
            </ReactFlow>
            </div>
            ) : activeChain === null ? (
              // Only the forest tab reaches here with no active chain.
              <div ref={forestWrapperRef} className="relative min-h-0 flex-1">
                <ChainForestCanvas
                  nodes={forestNodes}
                  edges={forestEdges}
                  focus={chainFocus}
                  onNodeClick={onForestNodeClick}
                  onNodeDoubleClick={onForestNodeDoubleClick}
                  onEdgeClick={onForestEdgeClick}
                  onPaneClick={onPaneClick}
                  onNodeContextMenu={onForestNodeContextMenu}
                  onEdgeContextMenu={onForestEdgeContextMenu}
                  onPaneContextMenu={onChainPaneContextMenu}
                  onZoom={onForestZoom}
                />
              </div>
            ) : (
              <div className="relative min-h-0 flex-1">
                <ChainCanvas
                  key={activeChain.id}
                  nodes={chainNodes}
                  edges={chainEdges}
                  focus={chainFocus}
                  onNodeClick={onChainNodeClick}
                  onEdgeClick={onChainEdgeClick}
                  onPaneClick={onPaneClick}
                  onConnect={onChainConnect}
                  onNodeContextMenu={onChainNodeContextMenu}
                  onEdgeContextMenu={onChainEdgeContextMenu}
                  onPaneContextMenu={onChainPaneContextMenu}
                />
              </div>
            )}
            <MapContextMenu
              target={contextMenu}
              onClose={() => setContextMenu(null)}
              systems={viewData.systems}
              connections={viewData.connections}
              homeMapSystemId={viewData.map.homeMapSystemId}
              selectedSystemIds={selectedSystemIds}
              onSystemPatch={onSystemPatch}
              onSystemRemove={onSystemRemove}
              onSystemRemoveSelected={removeSelectedSystems}
              onConnectionPatch={onConnectionPatch}
              onConnectionDelete={onConnectionDelete}
              onAddSystemAt={onAddSystemAt}
              onDeleteSubchain={onDeleteSubchain}
              onDeleteSubchainPick={onDeleteSubchainPick}
              onDeleteDisconnected={onDeleteDisconnected}
              onPingSystem={onPingSystem}
              notes={viewData.notes}
              onAddNoteAt={onAddNoteAt}
              onNotePatch={onNotePatch}
              onNoteRemove={onNoteRemove}
            />
          </div>
        );
      case 'signatures':
        return (
          <SignatureModule
            mapId={mapId}
            system={selectedSystem}
            signatures={viewData.signatures}
            connections={viewData.connections}
            systems={viewData.systems}
            onCreate={onSignatureCreate}
            onPatch={onSignaturePatch}
            onDelete={onSignatureDelete}
            onConnectionPatch={onConnectionPatch}
            onBulkPaste={onSignaturePasteResult}
            flashSigId={flashSigId}
            pasteFlash={pasteFlash}
          />
        );
      case 'sigSearch':
        return (
          <SignatureSearchModule
            signatures={viewData.signatures}
            systems={viewData.systems}
            filters={sigSearchFilters}
            onFiltersChange={setSigSearchFilters}
            onNavigate={handleNavigateToSig}
          />
        );
      case 'inspector':
        return (
          <InspectorModule
            selected={selected}
            viewData={viewData}
            chainDistances={chainDistanceBadges}
            onSystemPatch={onSystemPatch}
            onSystemRemove={onSystemRemove}
            onConnectionPatch={onConnectionPatch}
            onConnectionDelete={onConnectionDelete}
            onNotePatch={onNotePatch}
            onNoteRemove={onNoteRemove}
          />
        );
      case 'route':
        return (
          <RoutePlannerModule
            mapId={mapId}
            selectedSystemId={selectedSystem?.systemId ?? null}
            initialPrefs={routePrefs}
            initialDestinations={routeDestinations}
            connections={viewData.connections}
          />
        );
      case 'intel':
        return (
          <IntelModule
            system={selectedSystem}
            intel={selectedSystem ? intel[selectedSystem.systemId] : undefined}
          />
        );
      case 'structure':
        return (
          <StructureModule
            system={selectedSystem}
            structures={selectedSystem ? (structures[selectedSystem.systemId] ?? []) : []}
            onCreate={onStructureCreate}
            onPatch={onStructurePatch}
            onDelete={onStructureDelete}
          />
        );
      case 'systemNotes':
        return (
          <SystemNotesModule
            system={selectedSystem}
            notes={selectedSystem ? (systemNotes[selectedSystem.systemId] ?? []) : []}
            onCreate={onSystemNoteCreate}
            onPatch={onSystemNotePatch}
            onDelete={onSystemNoteDelete}
            onJumpToSystem={onJumpToSystem}
          />
        );
      case 'killStats':
        return (
          <KillStatsModule
            system={selectedSystem}
            stats={selectedSystem ? stats[selectedSystem.systemId] : undefined}
          />
        );
      case 'systemGraph':
        return <SystemGraphModule system={selectedSystem} />;
      case 'systemKillboard':
        return <SystemKillboardModule system={selectedSystem} />;
      case 'tags':
        return <TagsModule viewData={viewData} selectedSystemId={selectedSystem?.id ?? null} />;
      case 'thera':
        return <TheraModule mapId={mapId} viewData={viewData} onBulkPaste={onBulkPaste} />;
    }
  };

  const panelHeaderRight = (id: PanelId): ReactNode => {
    if (id === 'signatures') {
      return (
        <SignatureModuleHeaderActions
          mapId={mapId}
          system={selectedSystem}
          signatures={viewData.signatures}
          onBulkPaste={onSignaturePasteResult}
          lazyDelete={lazyDeleteSigs}
          onLazyDeleteChange={setLazyDeleteSigs}
        />
      );
    }
    return undefined;
  };

  return (
    <MapPresenceProvider initial={data.presence}>
      <MapActiveCharProvider viewerCharacters={viewerCharacters} mainCharacterId={mainCharacterId}>
      <MapTravelProvider>
        <MapUnderglowProvider>
        <MapSignatureIndicatorProvider
          signatures={viewData.signatures}
          prefs={signatureIndicators}
        >
        {travelAnimation && (
          <TravelBridge systems={viewData.systems} connections={viewData.connections} />
        )}
        <MapUnderglowBridge systems={viewData.systems} />
        <ChainDistanceBridge
          mapId={mapId}
          hasChains={visibleChains.length > 0}
          onDistances={setChainDistances}
        />
        {mobileChainActive && resolvedChainTab !== null ? (
          // Phone-width chain mode: the full-screen mobile view replaces the
          // whole dashboard. The tab strip, hotkeys, command palette, and
          // paste hotkey do not mount; realtime folding and the bridges above
          // keep running, so the tree and drawer stay live.
          <MobileChainView
            activeChainId={resolvedChainTab}
            chainName={activeChain?.name ?? null}
            cards={mobileChainCards}
            distances={chainDistanceBadges}
            nodes={chainNodes}
            edges={chainEdges}
            onSelectChain={onChainSelect}
            onNodeClick={onChainNodeClick}
            onEdgeClick={onChainEdgeClick}
            onPaneClick={onPaneClick}
            selectedSystem={selectedSystem}
            sheetContext={mobileSheetContext}
            selectedSystemNotes={
              selectedSystem ? (systemNotes[selectedSystem.systemId] ?? []) : []
            }
            onAddNote={onSystemNoteCreate}
            onClearSelection={onClearSelection}
          />
        ) : (
        <>
        <CommandPalette context={paletteContext} />
        <MapHotkeys
          context={paletteContext}
          onMoveSelection={onMoveSelection}
          onClearSelection={onClearSelection}
        />
        <SignaturePasteHotkey
          mapId={mapId}
          selectedSystem={selectedSystem}
          systems={viewData.systems}
          viewerCharacterIds={viewerCharacterIds}
          onBulkPaste={onSignaturePasteResult}
          lazyDelete={lazyDeleteSigs}
          onLazyDeleteConsume={() => setLazyDeleteSigs(false)}
          onLazyDeletePasteResult={onLazyDeletePasteResult}
        />
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-1">
            <div className="flex min-w-0 items-center gap-2">
              <div className="min-w-0">
                <div className="font-heading truncate text-base font-semibold tracking-tight">
                  {viewData.map.name}
                </div>
                <div className="text-muted-foreground truncate text-xs capitalize">
                  {viewData.map.type} · {viewData.map.scope} · {viewData.systems.length} systems
                </div>
              </div>
              <MapShareIndicator shares={liveShares} />
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <ActiveCharSelector />
              <PilotRosterButton viewData={viewData} />
              <SystemOverlayButton viewData={viewData} />
              <Menu>
                <MenuTrigger
                  render={
                    <Button variant="ghost" size="sm">
                      <LayoutDashboard />
                      Panels
                    </Button>
                  }
                />
                <MenuContent>
                  {PANELS.map((p) => (
                    <MenuCheckboxItem
                      key={p.id}
                      checked={!layout.hidden.includes(p.id)}
                      onCheckedChange={() => handleToggleVisible(p.id)}
                    >
                      {p.title}
                    </MenuCheckboxItem>
                  ))}
                  <MenuSeparator />
                  <MenuItem icon={<Download className="size-3.5" />} onClick={handleExportLayout}>
                    Export layout
                  </MenuItem>
                  <MenuItem
                    icon={<Upload className="size-3.5" />}
                    onClick={() => importInputRef.current?.click()}
                  >
                    Import layout
                  </MenuItem>
                  <MenuItem icon={<RotateCcw className="size-3.5" />} onClick={handleResetLayout}>
                    Reset layout
                  </MenuItem>
                </MenuContent>
              </Menu>
              <input
                ref={importInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  // Reset so re-selecting the same file fires `change` again.
                  e.target.value = '';
                  if (file) void handleImportFile(file);
                }}
              />
              <Button variant="ghost" size="sm" onClick={() => setMapInfoOpen(true)}>
                <Info />
                Map info
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSettingsOpen(true)}>
                <Settings />
                Settings
              </Button>
              {capabilities.includes('audit_view') && (
                <Button variant="ghost" size="sm" onClick={() => setAuditOpen(true)}>
                  <ScrollText />
                  Audit log
                </Button>
              )}
            </div>
          </div>
          <PanelDndContext onDragEnd={handlePanelDrop}>
            <MapLayoutGrid
              layouts={layout.layouts}
              onLayoutChange={handleLayoutChange}
              onBreakpointChange={setBreakpoint}
              onTearOff={tearOffTab}
            >
              {visibleGroups.map((g) => (
                <div key={g.id}>
                  <MapPanelGroup
                    group={g}
                    hidden={layout.hidden}
                    onSetActive={handleSetActiveTab}
                    onHideMember={handleHide}
                    renderContent={panelContent}
                    renderHeaderRight={panelHeaderRight}
                    contentClassName={(id) =>
                      id === 'canvas' ? 'min-h-0 flex-1 overflow-hidden p-0' : undefined
                    }
                  />
                </div>
              ))}
            </MapLayoutGrid>
          </PanelDndContext>
        </div>

        <MapInfoDialog open={mapInfoOpen} onOpenChange={setMapInfoOpen} viewData={viewData} />
        <MapSettingsDialog
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          mapId={mapId}
          settings={settings}
          canManage={canManage}
          capabilities={capabilities}
          systems={manageSystems}
          onImported={onBulkPaste}
        />
        {capabilities.includes('audit_view') && (
          <MapAuditDialog
            open={auditOpen}
            onOpenChange={setAuditOpen}
            mapId={mapId}
            mapName={settings.name}
          />
        )}
        <AddSystemDialog
          open={addSystemOpen}
          onOpenChange={setAddSystemOpen}
          mapId={mapId}
          existingSystemIds={existingSystemIds}
          onAdd={onAddSystem}
        />
        </>
        )}
        </MapSignatureIndicatorProvider>
        </MapUnderglowProvider>
      </MapTravelProvider>
      </MapActiveCharProvider>
    </MapPresenceProvider>
  );
}
