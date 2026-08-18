## SystemNotesModule

**Purpose:** Sidebar module listing global system notes for the selected system, with add/edit/delete.
**File:** `src/components/sidebar/SystemNotesModule.tsx`

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| system | MapSystemNode \| null | yes | Selected system; null shows the empty state |
| notes | SystemNote[] | yes | Notes for the selected system, newest first (sliced by the parent) |
| onCreate | (body: string) => void | yes | Add a note (parent supplies the systemId) |
| onPatch | (noteId: string, body: string) => void | yes | Edit a note's body |
| onDelete | (noteId: string) => void | yes | Delete a note |

### Renders
A `Card` with a right-aligned "Add" button (only when a system is selected) and a list of note rows (body rendered `pre-wrap`, author + relative age line), each with edit/delete icon buttons. The panel name ("System Notes") comes from the surrounding `MapPanelGroup` chrome — no in-card title.

### Behaviour & Interactions
- Empty states: "Select a system…" (no system) / "No notes recorded." (none).
- "Add" / edit open an internal create/edit dialog (single textarea, max 2000 chars; save disabled while empty; the dialog notes the entry is visible from every map).
- Notes are keyed on the static system, not the map — the same list appears wherever the system is on any map.
- **Not realtime-synced** — another user's note edits appear on the next page load (notes are deployment-global, not map-scoped).

### Local State
- `dialogOpen: boolean`, `editing: SystemNote | null` (null ⇒ add mode).
