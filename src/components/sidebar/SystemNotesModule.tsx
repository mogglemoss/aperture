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
import type { UpdateSystemNoteBody } from '@/lib/system-notes/client';
import type { MapSystemNode, SystemNote, SystemNoteCategory } from '@/types';

export type SystemNoteFormValues = {
  body: string;
  category: SystemNoteCategory | null;
  locked: boolean;
};

/** Chip styling per category; the filter row and per-note chips share it. */
export const NOTE_CATEGORY_STYLES: Record<SystemNoteCategory, string> = {
  intel: 'bg-sky-500/15 text-sky-500 ring-sky-500/30',
  journal: 'bg-violet-500/15 text-violet-500 ring-violet-500/30',
  bounty: 'bg-emerald-500/15 text-emerald-500 ring-emerald-500/30',
  logistics: 'bg-amber-500/15 text-amber-500 ring-amber-500/30',
  warning: 'bg-red-500/15 text-red-500 ring-red-500/30',
};

export const NOTE_CATEGORIES = Object.keys(NOTE_CATEGORY_STYLES) as SystemNoteCategory[];

export function CategoryChip({
  category,
  className,
}: {
  category: SystemNoteCategory;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full px-1.5 py-px text-[10px] font-medium capitalize ring-1',
        NOTE_CATEGORY_STYLES[category],
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
  const [filter, setFilter] = useState<SystemNoteCategory | null>(null);

  // Only offer filter chips for categories actually present.
  const presentCategories = useMemo(
    () => NOTE_CATEGORIES.filter((c) => notes.some((n) => n.category === c)),
    [notes],
  );
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
  const [category, setCategory] = useState<string>(initial?.category ?? NO_CATEGORY);
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
          category: category === NO_CATEGORY ? null : (category as SystemNoteCategory),
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
              <SelectItem key={c} value={c} className="capitalize">
                {c}
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
