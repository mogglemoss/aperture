'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  buildPaletteActions,
  type KeyboardActionContext,
  type PaletteAction,
} from '@/lib/map/keyboardActions';

/**
 * ⌘K / Ctrl-K command palette for the map page. Lists the actions the current
 * selection affords (from `buildPaletteActions`) plus map-global ones, and a
 * jump-to-system group over every visible system; executing an entry dispatches
 * the exact callback its button counterpart uses, then closes.
 *
 * The open hotkey is a document-level listener that ignores editable targets
 * (an input's own ⌘K stays native) — the `SignaturePasteHotkey` idiom.
 */
export function CommandPalette({ context }: { context: KeyboardActionContext }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const chord = e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey);
      const slash = e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey;
      if (!chord && !slash) return;
      if (isEditable(e.target)) return;
      if (e.target instanceof HTMLElement && e.target.closest('[role="dialog"]')) return;
      e.preventDefault();
      setOpen((prev) => !prev);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // Rebuilt per open so labels reflect the live selection state; cheap (≤ a few
  // hundred entries).
  const actions = useMemo(() => (open ? buildPaletteActions(context) : []), [open, context]);
  const groups = useMemo(() => {
    const byGroup = new Map<PaletteAction['group'], PaletteAction[]>();
    for (const a of actions) (byGroup.get(a.group) ?? byGroup.set(a.group, []).get(a.group))!.push(a);
    return [...byGroup.entries()];
  }, [actions]);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or system name…" />
      <CommandList>
        <CommandEmpty>No matching command.</CommandEmpty>
        {groups.map(([group, entries]) => (
          <CommandGroup key={group} heading={group}>
            {entries.map((a) => (
              <CommandItem
                key={a.id}
                value={`${a.label} ${a.keywords?.join(' ') ?? ''}`}
                onSelect={() => {
                  setOpen(false);
                  a.perform();
                }}
              >
                {a.label}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return target.isContentEditable;
}
