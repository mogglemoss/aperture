## SystemNotesBrowserDialog

**Purpose:** Deployment-wide notes browser — search every global system note by body text or system name and jump to a result's system.
**File:** `src/components/sidebar/SystemNotesBrowserDialog.tsx`

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| open | boolean | yes | Dialog visibility |
| onOpenChange | (open: boolean) => void | yes | Dialog open/close |
| onJumpToSystem | (systemId: number) => void | yes | Called with a clicked result's EVE system id |

### Renders
A dialog with a search input (icon, inline spinner while searching) and a scrollable result list. Each result is a button showing the system name, category chip (if any), a 3-line-clamped markdown body preview, and author · age.

### Behaviour & Interactions
- Debounced search (250ms) via `searchSystemNotesOnServer`; queries under 2 chars show a hint and clear results without a request. Stale responses are dropped via a sequence counter.
- Results are newest-first and capped server-side.
- The search UI is mounted only while the dialog is open, so query/results reset on each open.
- Whether a clicked system can actually be focused is the parent's concern (`MapCanvas` toasts when the system isn't on the current map).

### Depends On
- `searchSystemNotesOnServer` (`@/lib/system-notes/client`).
- `NoteContent` — markdown preview; `CategoryChip` (`./SystemNotesModule`).
- `Dialog` primitives, `Input`.

### Local State
- `query: string`, `results: SystemNoteSearchResult[]`, `searching: boolean`.
