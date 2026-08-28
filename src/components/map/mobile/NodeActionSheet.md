## NodeActionSheet

**Purpose:** Mobile light-charting surface — a bottom action sheet opened by tapping an occurrence in the mobile chain view, offering the light-edit set (system status / rally / lock, EOL / mass on the inbound connection) plus read/add system notes.
**File:** `src/components/map/mobile/NodeActionSheet.tsx`

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| system | MapSystemNode \| null | yes | The selected canonical system; the sheet is open ⇔ non-null. |
| context | KeyboardActionContext | yes | Action context built by `MapCanvas` with `selectedConnection` = the occurrence's inbound connection; the sheet derives its actions from it via `buildMobileSheetActions` (System + inbound-Connection groups, destructive entries excluded — the `CommandPalette` pattern). |
| notes | SystemNote[] | yes | Global system notes for the selected system, newest first. |
| onAddNote | (values: SystemNoteFormValues) => void | yes | Add a note to the selected system (`MapCanvas`'s notes-CRUD create). |
| onClose | () => void | yes | Sheet dismissed — the owner clears the canonical selection. |

### Renders
A bottom `Sheet` (max 80dvh, scrollable): header (alias-or-name, security · name · region line), then action buttons in a two-column grid under "System" and — when an inbound connection resolved — "Inbound connection" section headings, then a "Notes" section (read-only note list: category chip, markdown body, author · age) with an "Add note" button opening the reused `SystemNoteDialog` in add mode.

### Behaviour & Interactions
- The sheet stays open across action taps so several quick edits land in one visit; labels re-render from the optimistic state (e.g. "Set rally" becomes "Clear rally").
- Every action dispatches the shared registry's callback — the same server call as the desktop buttons/palette/keys; the sheet invents no mutation paths.
- Deliberately no remove/delete actions (a phone tap sheet is exactly where a mis-tap wipes a system — the no-bare-delete-key invariant) and no note edit/delete/lock (read/add only). Full charting stays desktop.
- Dismissing the sheet (backdrop tap / close button) fires `onClose`.

### Depends On
- `Sheet` primitives (`@/components/ui/sheet`), `Button`
- `NoteContent` (`@/components/map/NoteContent`) — markdown note bodies
- `CategoryChip`, `SystemNoteDialog`, `SystemNoteFormValues` (`@/components/sidebar/SystemNotesModule`)
- `formatAgoFromMs` (`@/lib/map/relativeTime`)
- `buildMobileSheetActions` (`@/lib/map/chains/mobile`)
- `KeyboardActionContext` / `PaletteAction` types (`@/lib/map/keyboardActions`); `MapSystemNode`, `SystemNote` types from `@/types`

### Local State
- `noteDialogOpen: boolean` — whether the add-note dialog is open.
