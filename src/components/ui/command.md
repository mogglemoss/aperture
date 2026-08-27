## command.tsx (ui primitive)

**Purpose:** shadcn-style wrappers around `cmdk` — `Command`, `CommandDialog` (cmdk inside the project's Base UI `Dialog`), `CommandInput`, `CommandList`, `CommandEmpty`, `CommandGroup`, `CommandItem`, `CommandSeparator`, `CommandShortcut`.
**File:** `src/components/ui/command.tsx`

`CommandDialog` takes `{ open, onOpenChange, children }` and renders a chrome-less `DialogContent` (`showCloseButton={false}`, zero padding). Items match on their `value` string; selection styling via cmdk's `data-selected` attribute.
