import {
  EOL_STAGE_LABELS,
  EOL_STAGES,
  SYSTEM_STATUSES,
  WH_MASS_LABELS,
  WH_MASSES,
} from '@/lib/map/enumLabels';
import type { UpdateConnectionBody, UpdateSystemBody } from '@/lib/map/client';
import type { MapConnectionEdge, MapSystemNode } from '@/types';

/**
 * The shared action registry behind the command palette (and the Stage 2
 * single-key bindings): one place that turns the current selection into the
 * list of invocable actions, each dispatching the exact callback its button
 * counterpart uses — this module invents no mutation paths of its own. Pure
 * and client-safe.
 */

export type PaletteAction = {
  id: string;
  label: string;
  /** Palette section heading. */
  group: 'System' | 'Connection' | 'Map' | 'Jump to system';
  /** Extra filter-match terms beyond the label. */
  keywords?: string[];
  perform: () => void;
};

export type KeyboardActionContext = {
  /** The single selected system, if the selection is a system. */
  selectedSystem: MapSystemNode | null;
  /** The selected connection, if the selection is a connection. */
  selectedConnection: MapConnectionEdge | null;
  /** `ap_map_system.id` of the map's Home, which must not be removable here. */
  homeMapSystemId: string | null;
  /** Every visible system, for the jump group. */
  systems: MapSystemNode[];
  onSystemPatch: (mapSystemId: string, patch: UpdateSystemBody) => void;
  onSystemRemove: (mapSystemId: string) => void;
  onConnectionPatch: (connectionId: string, patch: UpdateConnectionBody) => void;
  onConnectionDelete: (connectionId: string) => void;
  openAddSystem: () => void;
  /** Select + snap-center an on-map system by EVE system id. */
  jumpToSystem: (systemId: number) => void;
};

const STATUS_LABELS: Record<(typeof SYSTEM_STATUSES)[number], string> = {
  unknown: 'Unknown',
  friendly: 'Friendly',
  occupied: 'Occupied',
  hostile: 'Hostile',
  empty: 'Empty',
  unscanned: 'Unscanned',
};

export function buildPaletteActions(ctx: KeyboardActionContext): PaletteAction[] {
  const actions: PaletteAction[] = [];
  const system = ctx.selectedSystem;
  const conn = ctx.selectedConnection;

  if (system) {
    const name = system.alias?.trim() || system.name;
    for (const status of SYSTEM_STATUSES) {
      if (status === system.status) continue;
      actions.push({
        id: `system-status-${status}`,
        label: `Set status: ${STATUS_LABELS[status]}`,
        group: 'System',
        keywords: ['status', name],
        perform: () => ctx.onSystemPatch(system.id, { status }),
      });
    }
    actions.push({
      id: 'system-lock',
      label: system.locked ? `Unlock ${name}` : `Lock ${name}`,
      group: 'System',
      keywords: ['lock', 'locked'],
      perform: () => ctx.onSystemPatch(system.id, { locked: !system.locked }),
    });
    actions.push({
      id: 'system-rally',
      label: system.rallyAt ? `Clear rally on ${name}` : `Set rally on ${name}`,
      group: 'System',
      keywords: ['rally', 'ping'],
      perform: () =>
        ctx.onSystemPatch(system.id, {
          rallyAt: system.rallyAt ? null : new Date().toISOString(),
        }),
    });
    // Home and locked systems are not removable — mirror the group-delete
    // guard rather than offering an action the server would refuse.
    if (!system.locked && system.id !== ctx.homeMapSystemId) {
      actions.push({
        id: 'system-remove',
        label: `Remove ${name} from map`,
        group: 'System',
        keywords: ['delete', 'remove'],
        perform: () => ctx.onSystemRemove(system.id),
      });
    }
  }

  if (conn) {
    for (const stage of EOL_STAGES) {
      if (stage === conn.eolStage) continue;
      actions.push({
        id: `conn-eol-${stage}`,
        label: `Connection EOL: ${EOL_STAGE_LABELS[stage]}`,
        group: 'Connection',
        keywords: ['eol', 'end of life', 'expire'],
        perform: () => ctx.onConnectionPatch(conn.id, { eolStage: stage }),
      });
    }
    for (const mass of WH_MASSES) {
      if (mass === conn.massStatus) continue;
      actions.push({
        id: `conn-mass-${mass}`,
        label: `Connection mass: ${WH_MASS_LABELS[mass]}`,
        group: 'Connection',
        keywords: ['mass', 'reduced', 'crit'],
        perform: () => ctx.onConnectionPatch(conn.id, { massStatus: mass }),
      });
    }
    actions.push({
      id: 'conn-delete',
      label: 'Delete connection',
      group: 'Connection',
      keywords: ['remove', 'collapse'],
      perform: () => ctx.onConnectionDelete(conn.id),
    });
  }

  actions.push({
    id: 'map-add-system',
    label: 'Add system…',
    group: 'Map',
    keywords: ['new', 'manual'],
    perform: ctx.openAddSystem,
  });

  for (const s of ctx.systems) {
    actions.push({
      id: `jump-${s.systemId}`,
      label: s.alias?.trim() ? `${s.alias.trim()} (${s.name})` : s.name,
      group: 'Jump to system',
      keywords: ['jump', 'go to', 'focus'],
      perform: () => ctx.jumpToSystem(s.systemId),
    });
  }

  return actions;
}
