'use client';

import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { NoteContent } from '@/components/map/NoteContent';
import {
  CategoryChip,
  SystemNoteDialog,
  type SystemNoteFormValues,
} from '@/components/sidebar/SystemNotesModule';
import { formatAgoFromMs } from '@/lib/map/relativeTime';
import { buildMobileSheetActions } from '@/lib/map/chains/mobile';
import type { KeyboardActionContext, PaletteAction } from '@/lib/map/keyboardActions';
import type { MapSystemNode, SystemNote } from '@/types';

// Mobile node action sheet (nomadic-chains light charting): tapping an
// occurrence in the mobile chain view opens this bottom sheet with the
// light-edit set — status / rally / lock on the system, EOL / mass on the
// INBOUND connection — plus a read/add notes section, so a phone keeps intel
// current mid-roam. The actions are the shared registry
// (`buildMobileSheetActions`), so every mutation is the same server call as
// desktop; full charting (signature paste, connection drawing, add-system)
// stays a desktop concern. The sheet stays open across action taps so several
// quick edits land in one visit — the labels re-render from the optimistic
// state.

export function NodeActionSheet({
  system,
  context,
  notes,
  onAddNote,
  onClose,
}: {
  /** The selected canonical system; the sheet is open ⇔ non-null. */
  system: MapSystemNode | null;
  /** Action context whose `selectedConnection` is the occurrence's INBOUND connection (built by `MapCanvas`). */
  context: KeyboardActionContext;
  /** Global system notes for the selected system, newest first. */
  notes: SystemNote[];
  /** Add a note to the selected system (`MapCanvas`'s notes-CRUD create). */
  onAddNote: (values: SystemNoteFormValues) => void;
  /** Sheet dismissed — the owner clears the canonical selection. */
  onClose: () => void;
}) {
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const actions = useMemo(
    () => (system !== null ? buildMobileSheetActions(context) : []),
    [system, context],
  );
  const systemActions = actions.filter((a) => a.group === 'System');
  const connectionActions = actions.filter((a) => a.group === 'Connection');

  return (
    <Sheet
      open={system !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent side="bottom" className="max-h-[80dvh] gap-0">
        {system !== null && (
          <>
            <SheetHeader className="pb-2">
              <SheetTitle className="truncate">{system.alias?.trim() || system.name}</SheetTitle>
              <p className="text-muted-foreground truncate text-xs">
                {system.security}
                {system.alias?.trim() ? ` · ${system.name}` : ''} · {system.regionName}
              </p>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
              <ActionSection heading="System" actions={systemActions} />
              {connectionActions.length > 0 && (
                <ActionSection heading="Inbound connection" actions={connectionActions} />
              )}
              <div className="mt-4">
                <div className="mb-1.5 flex items-center justify-between">
                  <h3 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                    Notes
                  </h3>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1"
                    onClick={() => setNoteDialogOpen(true)}
                  >
                    <Plus className="size-3.5" />
                    Add note
                  </Button>
                </div>
                {notes.length === 0 ? (
                  <p className="text-muted-foreground text-xs">No notes recorded.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {notes.map((n) => (
                      <li key={n.id} className="rounded border border-border p-2 text-xs">
                        <div className="flex min-w-0 flex-col gap-1">
                          {n.category ? (
                            <CategoryChip category={n.category} className="self-start" />
                          ) : null}
                          <NoteContent content={n.body} className="text-foreground" />
                          <span className="text-[10px] text-muted-foreground">
                            {n.createdByName ? `${n.createdByName} · ` : ''}
                            {relativeTime(n.createdAt)}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <SystemNoteDialog
              open={noteDialogOpen}
              onOpenChange={setNoteDialogOpen}
              systemName={system.alias?.trim() || system.name}
              onSubmit={onAddNote}
            />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function ActionSection({ heading, actions }: { heading: string; actions: PaletteAction[] }) {
  return (
    <div className="mt-4 first:mt-0">
      <h3 className="text-muted-foreground mb-1.5 text-xs font-medium uppercase tracking-wide">
        {heading}
      </h3>
      <div className="grid grid-cols-2 gap-1.5">
        {actions.map((a) => (
          <Button
            key={a.id}
            variant="outline"
            size="sm"
            className="min-h-11 justify-start truncate text-left"
            onClick={() => a.perform()}
          >
            {a.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  return formatAgoFromMs(Date.now() - then, 'long');
}
