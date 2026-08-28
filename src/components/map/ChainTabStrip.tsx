'use client';

import { useMemo, useState } from 'react';
import {
  ArrowDownFromLine,
  ArrowRightFromLine,
  Anchor,
  ChevronDown,
  Pencil,
  Plus,
  Search,
  Trash2,
  User,
  Users,
  X,
} from 'lucide-react';
import type { ChainDistanceBadge, ChainKind, ChainLayoutOrientation, MapChain } from '@/types';
import { formatChainDistanceTooltip } from '@/lib/map/chains/distance';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/menu';
import { apertureConfig } from '../../../aperture.config';

// Chain tab strip (nomadic-chains): "Canvas" + "All" + one tab per visible
// chain, wrapping onto multiple rows at corp scale. The tabs ARE the
// chain-mode toggle — "Canvas" shows the hand-arranged free canvas, "All" the
// forest render of every visible chain (the default whenever the map has any
// chain), a chain tab swaps in the ChainCanvas tree. Personal-chain lifecycle
// is open to anyone; shared chains are offered only to managers (the server
// re-checks every call).

/**
 * Sentinel tab id for the All-view forest. Safe against chain ids (bigserial
 * numeric strings); `null` stays the free canvas so a stored pre-forest
 * preference keeps its meaning.
 */
export const ALL_CHAINS_TAB = 'all';

/** An on-map system offered as a chain anchor in the create dialog. */
export type ChainAnchorOption = {
  /** `ap_map_system.id` as a string. */
  id: string;
  name: string;
  alias: string | null;
};

/** How many anchor-search matches the create dialog lists. */
const ANCHOR_RESULT_CAP = 8;

export function ChainTabStrip({
  chains,
  activeChainId,
  canManage,
  orientation,
  distances,
  systems,
  defaultAnchorId,
  onSelect,
  onOrientationChange,
  onCreate,
  onRename,
  onDelete,
}: {
  /** Visible chains in tab order (shared first, then personal, by creation — `sortChainsForTabs`). */
  chains: MapChain[];
  /** Active tab: a chain id, `ALL_CHAINS_TAB` for the forest, null for the free canvas. */
  activeChainId: string | null;
  /** Whether the viewer manages the map — offers the shared kind and shared-chain rename/delete. */
  canManage: boolean;
  orientation: ChainLayoutOrientation;
  /**
   * Chains-near-me gate jumps per chain id (undefined ⇒ distances unknown, no
   * badges; a null value ⇒ no gate-reachable k-space exit, rendered "—").
   */
  distances?: Record<string, ChainDistanceBadge | null>;
  /** On-map systems offered as anchor candidates in the create dialog. */
  systems: ChainAnchorOption[];
  /** Default anchor pick (the creator's current tracked location when it's on the map), or null. */
  defaultAnchorId: string | null;
  onSelect: (chainId: string | null) => void;
  onOrientationChange: (orientation: ChainLayoutOrientation) => void;
  onCreate: (name: string, kind: ChainKind, anchorMapSystemId: string | null) => void;
  onRename: (chainId: string, name: string) => void;
  onDelete: (chainId: string) => void;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createKind, setCreateKind] = useState<ChainKind>('personal');
  // Whether the user has typed into the name field — an untouched name follows
  // the anchor pick (Tripwire-style: the chain is named after its entrance).
  const [createNameTouched, setCreateNameTouched] = useState(false);
  const [createAnchor, setCreateAnchor] = useState<ChainAnchorOption | null>(null);
  const [anchorQuery, setAnchorQuery] = useState('');
  const [renameTarget, setRenameTarget] = useState<MapChain | null>(null);
  const [renameName, setRenameName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<MapChain | null>(null);

  const nameMax = apertureConfig.MAP_CHAIN_NAME_MAX_LENGTH;

  const anchorMatches = useMemo(() => {
    const q = anchorQuery.trim().toLowerCase();
    if (!q) return [];
    return systems
      .filter(
        (s) => s.name.toLowerCase().includes(q) || (s.alias?.toLowerCase().includes(q) ?? false),
      )
      .slice(0, ANCHOR_RESULT_CAP);
  }, [systems, anchorQuery]);

  const openCreate = () => {
    const anchor = defaultAnchorId ? (systems.find((s) => s.id === defaultAnchorId) ?? null) : null;
    setCreateAnchor(anchor);
    setCreateName(anchor ? anchor.name.slice(0, nameMax) : '');
    setCreateNameTouched(false);
    setAnchorQuery('');
    setCreateKind('personal');
    setCreateOpen(true);
  };

  const pickAnchor = (anchor: ChainAnchorOption | null) => {
    setCreateAnchor(anchor);
    setAnchorQuery('');
    if (!createNameTouched) setCreateName(anchor ? anchor.name.slice(0, nameMax) : '');
  };

  const submitCreate = () => {
    const name = createName.trim();
    if (!name) return;
    onCreate(name, canManage ? createKind : 'personal', createAnchor?.id ?? null);
    setCreateOpen(false);
  };

  const submitRename = () => {
    const name = renameName.trim();
    if (!renameTarget || !name) return;
    if (name !== renameTarget.name) onRename(renameTarget.id, name);
    setRenameTarget(null);
  };

  const tabClass = (active: boolean) =>
    `flex h-6 items-center gap-1 rounded-md px-2 text-xs transition-colors ${
      active
        ? 'bg-accent font-medium text-foreground'
        : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
    }`;

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-foreground/10 bg-card/50 px-1.5 py-1">
      <button
        type="button"
        className={tabClass(activeChainId === null)}
        onClick={() => onSelect(null)}
        title="Free canvas — manual layout"
      >
        Canvas
      </button>
      <button
        type="button"
        className={tabClass(activeChainId === ALL_CHAINS_TAB)}
        onClick={() => onSelect(ALL_CHAINS_TAB)}
        title="Every chain side by side"
      >
        All
      </button>
      {chains.map((chain) => {
        const active = chain.id === activeChainId;
        const manageable = chain.kind === 'personal' || canManage;
        const distance = distances?.[chain.id];
        return (
          <div key={chain.id} className="flex items-center">
            <button
              type="button"
              className={tabClass(active)}
              onClick={() => onSelect(chain.id)}
              title={chain.kind === 'shared' ? 'Shared chain' : 'Personal chain'}
            >
              {chain.kind === 'shared' ? (
                <Users className="size-3 shrink-0 opacity-70" />
              ) : (
                <User className="size-3 shrink-0 opacity-70" />
              )}
              <span className="max-w-40 truncate">{chain.name}</span>
              {distance !== undefined && (
                <span
                  className="shrink-0 rounded bg-foreground/10 px-1 text-[10px] tabular-nums leading-4 text-muted-foreground"
                  title={formatChainDistanceTooltip(distance)}
                >
                  {distance ? `${distance.jumps}j` : '—'}
                </span>
              )}
            </button>
            {active && manageable && (
              <Menu>
                <MenuTrigger
                  render={
                    <button
                      type="button"
                      className="ml-0.5 flex h-6 w-4 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                      aria-label={`Chain actions: ${chain.name}`}
                    >
                      <ChevronDown className="size-3" />
                    </button>
                  }
                />
                <MenuContent>
                  <MenuItem
                    icon={<Pencil className="size-3.5" />}
                    onClick={() => {
                      setRenameName(chain.name);
                      setRenameTarget(chain);
                    }}
                  >
                    Rename
                  </MenuItem>
                  <MenuItem
                    icon={<Trash2 className="size-3.5" />}
                    onClick={() => setDeleteTarget(chain)}
                  >
                    Delete
                  </MenuItem>
                </MenuContent>
              </Menu>
            )}
          </div>
        );
      })}
      <button
        type="button"
        className="flex h-6 items-center gap-1 rounded-md px-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
        onClick={openCreate}
        title="New chain"
      >
        <Plus className="size-3.5" />
      </button>
      {activeChainId !== null && (
        <button
          type="button"
          className="ml-auto flex h-6 items-center gap-1 rounded-md px-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
          onClick={() => onOrientationChange(orientation === 'root-top' ? 'root-left' : 'root-top')}
          title={
            orientation === 'root-top'
              ? 'Root on top, depth downward — click for root left'
              : 'Root on the left, depth rightward — click for root top'
          }
        >
          {orientation === 'root-top' ? (
            <ArrowDownFromLine className="size-3.5" />
          ) : (
            <ArrowRightFromLine className="size-3.5" />
          )}
        </button>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New chain</DialogTitle>
            <DialogDescription>
              A chain is a named tree of systems layered over the map — charting from its tab grows
              it. Anchoring it on a system adopts that system&apos;s existing wormhole subtree.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              submitCreate();
            }}
          >
            {createAnchor ? (
              <div className="flex h-9 items-center gap-2 rounded-md px-3 text-sm ring-1 ring-foreground/10">
                <Anchor className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">
                  {createAnchor.name}
                  {createAnchor.alias && (
                    <span className="ml-1.5 text-xs text-muted-foreground">{createAnchor.alias}</span>
                  )}
                </span>
                <button
                  type="button"
                  className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
                  onClick={() => pickAnchor(null)}
                  aria-label="Clear anchor"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={anchorQuery}
                    placeholder="Anchor system (on-map, optional)"
                    onChange={(e) => setAnchorQuery(e.target.value)}
                    className="pl-8"
                  />
                </div>
                {anchorMatches.length > 0 && (
                  <ul className="max-h-40 overflow-auto rounded-md ring-1 ring-foreground/10">
                    {anchorMatches.map((s) => (
                      <li key={s.id}>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 border-t border-foreground/10 px-3 py-1.5 text-left text-xs first:border-t-0 hover:bg-muted/40"
                          onClick={() => pickAnchor(s)}
                        >
                          <span className="truncate font-medium text-foreground">{s.name}</span>
                          {s.alias && (
                            <span className="truncate text-muted-foreground">{s.alias}</span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <Input
              autoFocus
              value={createName}
              maxLength={nameMax}
              placeholder="Chain name"
              onChange={(e) => {
                setCreateName(e.target.value);
                setCreateNameTouched(true);
              }}
            />
            {canManage && (
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant={createKind === 'personal' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setCreateKind('personal')}
                >
                  <User />
                  Personal
                </Button>
                <Button
                  type="button"
                  variant={createKind === 'shared' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setCreateKind('shared')}
                >
                  <Users />
                  Shared
                </Button>
              </div>
            )}
            <DialogFooter>
              <Button type="submit" size="sm" disabled={createName.trim().length === 0}>
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={renameTarget !== null} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename chain</DialogTitle>
          </DialogHeader>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              submitRename();
            }}
          >
            <Input
              autoFocus
              value={renameName}
              maxLength={nameMax}
              onChange={(e) => setRenameName(e.target.value)}
            />
            <DialogFooter>
              <Button type="submit" size="sm" disabled={renameName.trim().length === 0}>
                Rename
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete “{deleteTarget?.name}”?</DialogTitle>
            <DialogDescription>
              Removes the tab and its tree. Systems stay on the map — a chain never owns them.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (deleteTarget) onDelete(deleteTarget.id);
                setDeleteTarget(null);
              }}
            >
              <Trash2 />
              Delete chain
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
