'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EOL_STAGES, SYSTEM_STATUSES, WH_MASSES } from '@/lib/map/enumLabels';
import { cycleNext, KEY_BINDINGS, type KeyboardActionContext } from '@/lib/map/keyboardActions';

export type MoveDirection = 'up' | 'down' | 'left' | 'right';

/**
 * Bare-key operations on the map page — the hot loop without the mouse. The
 * bindings are `KEY_BINDINGS` (one source for the handler and the `?` overlay);
 * every mutation goes through the same context callbacks the buttons and the
 * palette use. There is deliberately no remove/delete key (see `KEY_BINDINGS`).
 *
 * A single document-level keydown listener that stands down for editable
 * targets, anything inside an open dialog, and chords with modifiers (except
 * shift, which `L` needs) — so typing, dialogs, and browser shortcuts are
 * never shadowed.
 */
export function MapHotkeys({
  context,
  onMoveSelection,
  onClearSelection,
}: {
  context: KeyboardActionContext;
  onMoveSelection: (dir: MoveDirection) => void;
  onClearSelection: () => void;
}) {
  const [helpOpen, setHelpOpen] = useState(false);

  // One stable listener reading live props through a ref (the
  // SignaturePasteHotkey idiom).
  const latest = useRef({ context, onMoveSelection, onClearSelection });
  useEffect(() => {
    latest.current = { context, onMoveSelection, onClearSelection };
  });

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isEditable(e.target)) return;
      if (target(e)?.closest('[role="dialog"]')) return;

      const { context: ctx, onMoveSelection, onClearSelection } = latest.current;
      const system = ctx.selectedSystem;
      const conn = ctx.selectedConnection;

      const move: Record<string, MoveDirection> = {
        h: 'left',
        j: 'down',
        k: 'up',
        l: 'right',
        ArrowLeft: 'left',
        ArrowDown: 'down',
        ArrowUp: 'up',
        ArrowRight: 'right',
      };

      switch (e.key) {
        case 'Escape':
          onClearSelection();
          return;
        case '?':
          e.preventDefault();
          setHelpOpen((prev) => !prev);
          return;
        case 's':
          if (system) {
            e.preventDefault();
            ctx.onSystemPatch(system.id, { status: cycleNext(SYSTEM_STATUSES, system.status) });
          }
          return;
        case 'L':
          if (system) {
            e.preventDefault();
            ctx.onSystemPatch(system.id, { locked: !system.locked });
          }
          return;
        case 'r':
          if (system) {
            e.preventDefault();
            ctx.onSystemPatch(system.id, {
              rallyAt: system.rallyAt ? null : new Date().toISOString(),
            });
          }
          return;
        case 'e':
          if (conn) {
            e.preventDefault();
            ctx.onConnectionPatch(conn.id, { eolStage: cycleNext(EOL_STAGES, conn.eolStage) });
          }
          return;
        case 'm':
          if (conn) {
            e.preventDefault();
            ctx.onConnectionPatch(conn.id, { massStatus: cycleNext(WH_MASSES, conn.massStatus) });
          }
          return;
        default: {
          const dir = move[e.key];
          if (dir) {
            e.preventDefault();
            onMoveSelection(dir);
          }
        }
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Keys act on the current selection.</DialogDescription>
        </DialogHeader>
        <table className="text-sm">
          <tbody>
            {KEY_BINDINGS.map((b) => (
              <tr key={b.keys}>
                <td className="py-1 pr-4 font-mono text-xs whitespace-nowrap text-muted-foreground">
                  {b.keys}
                </td>
                <td className="py-1">{b.does}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DialogContent>
    </Dialog>
  );
}

function target(e: KeyboardEvent): HTMLElement | null {
  return e.target instanceof HTMLElement ? e.target : null;
}

function isEditable(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  const tag = t.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return t.isContentEditable;
}
