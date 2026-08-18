'use client';

import { useState } from 'react';
import { NotebookPen, Pencil, Plus, Trash2 } from 'lucide-react';
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
import { formatAgoFromMs } from '@/lib/map/relativeTime';
import type { MapSystemNode, SystemNote } from '@/types';

/**
 * Sidebar module for global system notes on the selected system. Lists notes
 * newest first, opens a dialog to add/edit, and deletes. Notes are keyed on the
 * static system (not the map), so intel written here is readable from every map
 * whenever the system is encountered again. Deployment-global and not
 * realtime-synced — another user's edits show on the next page load (see
 * `src/lib/system-notes/read.ts`).
 */
export function SystemNotesModule({
  system,
  notes,
  onCreate,
  onPatch,
  onDelete,
}: {
  system: MapSystemNode | null;
  notes: SystemNote[];
  onCreate: (body: string) => void;
  onPatch: (noteId: string, body: string) => void;
  onDelete: (noteId: string) => void;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SystemNote | null>(null);

  function openAdd() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(note: SystemNote) {
    setEditing(note);
    setDialogOpen(true);
  }

  function onSubmit(body: string) {
    if (editing) onPatch(editing.id, body);
    else onCreate(body);
  }

  return (
    <Card size="sm">
      {system ? (
        <CardHeader className="flex flex-row items-center justify-end">
          <Button size="xs" variant="outline" className="gap-1" onClick={openAdd}>
            <Plus className="size-3" />
            Add
          </Button>
        </CardHeader>
      ) : null}
      <CardContent className="flex flex-col gap-2 text-xs">
        {!system ? (
          <p className="text-muted-foreground">Select a system to see its notes.</p>
        ) : notes.length === 0 ? (
          <p className="text-muted-foreground">No notes recorded.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {notes.map((n) => (
              <li
                key={n.id}
                className="flex items-start justify-between gap-2 rounded border border-border p-2"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex items-start gap-1.5">
                    <NotebookPen className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
                    <span className="whitespace-pre-wrap break-words">{n.body}</span>
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {n.createdByName ? `${n.createdByName} · ` : ''}
                    {relativeTime(n.createdAt)}
                  </span>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label="Edit note"
                    onClick={() => openEdit(n)}
                  >
                    <Pencil className="size-3" />
                  </Button>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label="Delete note"
                    onClick={() => onDelete(n.id)}
                  >
                    <Trash2 className="size-3" />
                  </Button>
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
  onSubmit: (body: string) => void;
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
            onSubmit={(body) => {
              onSubmit(body);
              onOpenChange(false);
            }}
            onCancel={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function NoteForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial?: SystemNote;
  onSubmit: (body: string) => void;
  onCancel: () => void;
}) {
  const [body, setBody] = useState(initial?.body ?? '');
  const trimmed = body.trim();

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (trimmed) onSubmit(trimmed);
      }}
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="system-note-body" className="text-sm font-medium">
          Note
        </label>
        <textarea
          id="system-note-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="POS on moon 4, hostile Fortizar off D-scan, good farm hole…"
          rows={5}
          maxLength={2000}
          autoFocus
          className="rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        />
      </div>
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
