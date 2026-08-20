'use client';

import { useMemo, useState } from 'react';
import { Lock, LockOpen, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { NoteContent } from '@/components/map/NoteContent';
import { NOTE_TEXT_COLOR_NAMES } from '@/lib/map/noteMarkdown';
import { SystemNotesBrowserDialog } from './SystemNotesBrowserDialog';
import { formatAgoFromMs } from '@/lib/map/relativeTime';
import { cn } from '@/lib/utils';
import { apertureConfig } from '../../../aperture.config';
import type { UpdateSystemNoteBody } from '@/lib/system-notes/client';
import type { MapSystemNode, SystemNote } from '@/types';

export type SystemNoteFormValues = {
  body: string;
  category: string | null;
  locked: boolean;
};

/**
 * The fixed chip palette. Deliberately closed and spelled out as full literal
 * class strings so Tailwind's scanner keeps every colour available regardless
 * of which ones the deployment's config picks. `SYSTEM_NOTE_CATEGORIES` colour
 * keys type-check against this record.
 */
const CHIP_PALETTE = {
  sky: 'bg-sky-500/15 text-sky-500 ring-sky-500/30',
  violet: 'bg-violet-500/15 text-violet-500 ring-violet-500/30',
  emerald: 'bg-emerald-500/15 text-emerald-500 ring-emerald-500/30',
  amber: 'bg-amber-500/15 text-amber-500 ring-amber-500/30',
  red: 'bg-red-500/15 text-red-500 ring-red-500/30',
  orange: 'bg-orange-500/15 text-orange-500 ring-orange-500/30',
  blue: 'bg-blue-500/15 text-blue-500 ring-blue-500/30',
  cyan: 'bg-cyan-500/15 text-cyan-500 ring-cyan-500/30',
  pink: 'bg-pink-500/15 text-pink-500 ring-pink-500/30',
  gray: 'bg-gray-500/15 text-gray-500 ring-gray-500/30',
} as const;

/** The deployment's category vocabulary (see `aperture.config.ts`). */
export const NOTE_CATEGORIES = apertureConfig.SYSTEM_NOTE_CATEGORIES;

function chipClasses(categoryKey: string): string {
  const def = NOTE_CATEGORIES.find((c) => c.key === categoryKey);
  // A key absent from the current config (edited vocabulary) stays legible
  // as a neutral chip.
  return def ? CHIP_PALETTE[def.color] : CHIP_PALETTE.gray;
}

export function CategoryChip({
  category,
  className,
}: {
  category: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full px-1.5 py-px text-[10px] font-medium capitalize ring-1',
        chipClasses(category),
        className,
      )}
    >
      {category}
    </span>
  );
}

/**
 * Sidebar module for global system notes on the selected system. Lists notes
 * newest first (bodies render as markdown), with an optional category chip and
 * filter row, per-note lock toggle, add/edit/delete, and a deployment-wide
 * notes browser behind the search button. Notes are keyed on the static system
 * (not the map), so intel written here is readable from every map whenever the
 * system is encountered again. Deployment-global and not realtime-synced —
 * another user's edits show on the next page load (see
 * `src/lib/system-notes/read.ts`).
 */
export function SystemNotesModule({
  system,
  notes,
  onCreate,
  onPatch,
  onDelete,
  onJumpToSystem,
}: {
  system: MapSystemNode | null;
  notes: SystemNote[];
  onCreate: (values: SystemNoteFormValues) => void;
  onPatch: (noteId: string, patch: UpdateSystemNoteBody) => void;
  onDelete: (noteId: string) => void;
  /** Focus a system on the current map by EVE system id (from the browser). */
  onJumpToSystem: (systemId: number) => void;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [browserOpen, setBrowserOpen] = useState(false);
  const [editing, setEditing] = useState<SystemNote | null>(null);
  const [filter, setFilter] = useState<string | null>(null);

  // A filter chosen on one system must not silently hide another system's
  // notes behind a chip that is no longer rendered. Reset during render (not
  // in an effect) so the switched-to system never paints filtered.
  const [filterSystemId, setFilterSystemId] = useState(system?.systemId ?? null);
  if (filterSystemId !== (system?.systemId ?? null)) {
    setFilterSystemId(system?.systemId ?? null);
    setFilter(null);
  }

  // Only offer filter chips for categories actually present — config order
  // first, then any keys the current config no longer lists (neutral chips).
  const presentCategories = useMemo(() => {
    const present = new Set(notes.map((n) => n.category).filter((c): c is string => c !== null));
    const known = NOTE_CATEGORIES.map((c) => c.key).filter((k) => present.has(k));
    const unknown = [...present].filter((k) => !NOTE_CATEGORIES.some((c) => c.key === k)).sort();
    return [...known, ...unknown];
  }, [notes]);
  const visible = filter ? notes.filter((n) => n.category === filter) : notes;

  function openAdd() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(note: SystemNote) {
    setEditing(note);
    setDialogOpen(true);
  }

  function onSubmit(values: SystemNoteFormValues) {
    if (editing) onPatch(editing.id, values);
    else onCreate(values);
  }

  return (
    <Card size="sm">
      <CardHeader className="flex flex-row items-center justify-end gap-1">
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label="Search all system notes"
          onClick={() => setBrowserOpen(true)}
        >
          <Search className="size-3" />
        </Button>
        {system ? (
          <Button size="xs" variant="outline" className="gap-1" onClick={openAdd}>
            <Plus className="size-3" />
            Add
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-xs">
        {presentCategories.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => setFilter(null)}
              className={cn(
                'rounded-full px-1.5 py-px text-[10px] font-medium ring-1 ring-border',
                filter === null ? 'bg-accent text-accent-foreground' : 'text-muted-foreground',
              )}
            >
              All
            </button>
            {presentCategories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setFilter(filter === c ? null : c)}
                className={cn(filter === c ? '' : 'opacity-60 hover:opacity-100')}
              >
                <CategoryChip category={c} />
              </button>
            ))}
          </div>
        ) : null}
        {!system ? (
          <p className="text-muted-foreground">Select a system to see its notes.</p>
        ) : visible.length === 0 ? (
          <p className="text-muted-foreground">
            {notes.length === 0 ? 'No notes recorded.' : 'No notes in this category.'}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {visible.map((n) => (
              <li key={n.id} className="rounded border border-border p-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    {n.category ? <CategoryChip category={n.category} className="self-start" /> : null}
                    <NoteContent content={n.body} className="text-foreground" />
                    <span className="text-[10px] text-muted-foreground">
                      {n.createdByName ? `${n.createdByName} · ` : ''}
                      {relativeTime(n.createdAt)}
                      {n.lastEditedByName && n.updatedAt !== n.createdAt
                        ? ` · edited by ${n.lastEditedByName} ${relativeTime(n.updatedAt)}`
                        : ''}
                    </span>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label={n.locked ? 'Unlock note' : 'Lock note'}
                      onClick={() => onPatch(n.id, { locked: !n.locked })}
                    >
                      {n.locked ? (
                        <Lock className="size-3 text-amber-500" />
                      ) : (
                        <LockOpen className="size-3" />
                      )}
                    </Button>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label="Edit note"
                      disabled={n.locked}
                      onClick={() => openEdit(n)}
                    >
                      <Pencil className="size-3" />
                    </Button>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label="Delete note"
                      disabled={n.locked}
                      onClick={() => onDelete(n.id)}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      {system ? (
        <SystemNoteDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          systemName={system.alias?.trim() || system.name}
          initial={editing ?? undefined}
          onSubmit={onSubmit}
        />
      ) : null}
      <SystemNotesBrowserDialog
        open={browserOpen}
        onOpenChange={setBrowserOpen}
        onJumpToSystem={(systemId) => {
          setBrowserOpen(false);
          onJumpToSystem(systemId);
        }}
      />
    </Card>
  );
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  return formatAgoFromMs(Date.now() - then, 'long');
}

/** Create/edit dialog for a global system note. `initial` present ⇒ edit mode. */
function SystemNoteDialog({
  open,
  onOpenChange,
  systemName,
  initial,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  systemName: string;
  initial?: SystemNote;
  onSubmit: (values: SystemNoteFormValues) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit note' : 'Add note'}</DialogTitle>
          <DialogDescription>
            Global note for {systemName} — visible from every map.
          </DialogDescription>
        </DialogHeader>
        {/* The dialog popup unmounts on close, so NoteForm remounts (and re-seeds
            from `initial`) on each open. */}
        {open ? (
          <NoteForm
            initial={initial}
            onSubmit={(values) => {
              onSubmit(values);
              onOpenChange(false);
            }}
            onCancel={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

const NO_CATEGORY = 'none';

function NoteForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial?: SystemNote;
  onSubmit: (values: SystemNoteFormValues) => void;
  onCancel: () => void;
}) {
  const [body, setBody] = useState(initial?.body ?? '');
  // A stored key the current config no longer lists can't be offered by the
  // Select (and the server would reject it); it coerces to None, so saving
  // visibly clears the legacy category rather than 400ing.
  const [category, setCategory] = useState<string>(() => {
    const c = initial?.category;
    return c && NOTE_CATEGORIES.some((d) => d.key === c) ? c : NO_CATEGORY;
  });
  const [locked, setLocked] = useState(initial?.locked ?? false);
  const trimmed = body.trim();

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!trimmed) return;
        onSubmit({
          body: trimmed,
          category: category === NO_CATEGORY ? null : category,
          locked,
        });
      }}
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="system-note-category" className="text-sm font-medium">
          Category
        </label>
        <Select value={category} onValueChange={(v) => setCategory(v ?? NO_CATEGORY)}>
          <SelectTrigger id="system-note-category" className="w-40 capitalize">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_CATEGORY}>None</SelectItem>
            {NOTE_CATEGORIES.map((c) => (
              <SelectItem key={c.key} value={c.key} className="capitalize">
                {c.key}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="system-note-body" className="text-sm font-medium">
          Note
        </label>
        <textarea
          id="system-note-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Good farm hole, active locals in EU time, watch the C5 static…"
          rows={5}
          maxLength={2000}
          autoFocus
          className="rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        />
        <p className="text-[10px] text-muted-foreground">
          Markdown supported (bold, lists, links, headings), plus colour tags:{' '}
          {NOTE_TEXT_COLOR_NAMES.map((name) => `[${name}]`).join(' ')}
        </p>
      </div>
      <label className="flex items-center gap-1.5 text-sm">
        <input type="checkbox" checked={locked} onChange={(e) => setLocked(e.target.checked)} />
        <span>Locked</span>
      </label>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={!trimmed}>
          {initial ? 'Save' : 'Add note'}
        </Button>
      </DialogFooter>
    </form>
  );
}
