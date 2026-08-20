## SystemNotesModule

**Purpose:** Sidebar module for global system notes on the selected system — markdown bodies, category chips with a filter row, per-note lock, add/edit/delete, and the deployment-wide notes browser.
**File:** `src/components/sidebar/SystemNotesModule.tsx`

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| system | MapSystemNode \| null | yes | Selected system; null shows the empty state |
| notes | SystemNote[] | yes | Notes for the selected system (sliced by the parent, newest first) |
| onCreate | (values: SystemNoteFormValues) => void | yes | Add a note (parent supplies the systemId) |
| onPatch | (noteId: string, patch: UpdateSystemNoteBody) => void | yes | Edit a note — body/category from the dialog, or a bare lock toggle |
| onDelete | (noteId: string) => void | yes | Delete a note |
| onJumpToSystem | (systemId: number) => void | yes | Focus a system on the current map (from a browser result) |

### Renders
A `Card` with a header search button (opens the notes browser) and — when a system is selected — an "Add" button; then an optional filter row of category chips (only categories present in the list, plus "All"; config order first, then any keys the current config no longer lists), and the note list. Each note row shows its category chip (if any), the body rendered as markdown via `NoteContent` (GFM + colour tags), an attribution line (author · age, plus "edited by X" when a later editor differs), and lock / edit / delete icon buttons.

### Behaviour & Interactions
- Empty states: "Select a system…" (no system) / "No notes recorded." (none) / "No notes in this category." (filter excludes all).
- The lock button toggles `locked` via `onPatch(id, { locked })`; edit and delete are disabled while locked (the server also rejects them with a 409).
- Clicking a filter chip filters to that category; clicking it again (or "All") clears the filter. Filter state is local and per-panel.
- "Add" / edit open a dialog with a category `Select` (None + the configured vocabulary), a 2000-char textarea (help text lists the markdown support and colour-tag names), and a Locked checkbox (same idiom as the map-note inspector) — so a note can be created locked or locked/unlocked while editing. Editing a note whose stored category the config no longer lists coerces the Select to None (the server rejects legacy keys), so saving visibly clears it.
- The category filter resets to "All" when the selected system changes — a chip chosen on one system must not hide another system's notes.
- The category vocabulary comes from `apertureConfig.SYSTEM_NOTE_CATEGORIES` (`{ key, color }[]`); chip classes come from a fixed, closed palette record (full literal class strings so Tailwind keeps every colour available). A stored key absent from the current config renders as a neutral gray chip and still filters.
- A browser result jump closes the browser and calls `onJumpToSystem`.
- **Not realtime-synced** — another user's note edits appear on the next page load (notes are deployment-global, not map-scoped).

### Emits / Calls
- `onCreate` / `onPatch` / `onDelete` / `onJumpToSystem` as above.

### Depends On
- `NoteContent` (`@/components/map/NoteContent`) — markdown rendering.
- `NOTE_TEXT_COLOR_NAMES` (`@/lib/map/noteMarkdown`) — colour-tag help text.
- `SystemNotesBrowserDialog` — the deployment-wide search dialog.
- `Select` primitives, `Dialog` primitives, `Card`, `Button`.

### Exports
- `SystemNoteFormValues` — `{ body, category, locked }` dialog output.
- `NOTE_CATEGORIES` / `CategoryChip` — the configured vocabulary and the chip component (shared with the browser dialog).

### Local State
- `dialogOpen: boolean`, `editing: SystemNote | null` (null ⇒ add mode), `browserOpen: boolean`, `filter: string | null` (plus the previous system id, so the filter resets during render on system switch).
