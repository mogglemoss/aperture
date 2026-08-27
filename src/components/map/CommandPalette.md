## CommandPalette

**Purpose:** ⌘K / Ctrl-K command palette for the map page — context-aware actions on the current selection plus map-global entries and jump-to-system, all dispatching the same callbacks their button counterparts use.
**File:** `src/components/map/CommandPalette.tsx`

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| context | KeyboardActionContext | yes | Selection + callbacks (built by `MapCanvas`) |

### Renders
A `CommandDialog` (cmdk via `ui/command`) with a search input and grouped action list (System / Connection / Map / Jump to system).

### Behaviour & Interactions
- Opens/toggles on ⌘K / Ctrl-K via a document-level keydown listener that ignores editable targets (`SignaturePasteHotkey` idiom) — an input's own ⌘K stays native.
- The action list is rebuilt from `buildPaletteActions` each time the palette opens, so labels reflect live selection state (e.g. "Unlock X" vs "Lock X").
- Selecting an entry closes the palette, then performs the action.
- cmdk's built-in filtering matches on label + keywords (`value` carries both).

### Depends On
- `buildPaletteActions` / `KeyboardActionContext` (`@/lib/map/keyboardActions`).
- `ui/command` primitives (cmdk wrapped in the project `Dialog`).
