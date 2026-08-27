## MapHotkeys

**Purpose:** Bare-key operations on the map page — status/lock/rally on the selected system, EOL/mass cycling on the selected connection, hjkl/arrow selection movement, Esc clear, and the `?` shortcuts overlay.
**File:** `src/components/map/MapHotkeys.tsx`

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| context | KeyboardActionContext | yes | Selection + mutation callbacks (shared with the palette) |
| onMoveSelection | (dir: MoveDirection) => void | yes | Move selection one system in a direction |
| onClearSelection | () => void | yes | Clear the selection (Esc) |

### Renders
Nothing visible except the `?` overlay: a small dialog tabling `KEY_BINDINGS`.

### Behaviour & Interactions
- One stable document-level keydown listener (live props via ref — the `SignaturePasteHotkey` idiom). Stands down for editable targets, anything inside an open `[role="dialog"]`, and any chord with meta/ctrl/alt (shift stays available — `L` needs it).
- Keys and what they do are `KEY_BINDINGS` in `keyboardActions.ts` — the handler and the overlay render from the same list so they cannot drift.
- Cycles use `cycleNext` over the `enumLabels` value lists; every mutation goes through the same context callbacks the buttons and palette use.
- There is deliberately no remove/delete key — a stray keypress must never wipe systems off the map; removal stays in the palette.

### Exports
- `MoveDirection` — `'up' | 'down' | 'left' | 'right'`.

### Depends On
- `KEY_BINDINGS` / `cycleNext` / `KeyboardActionContext` (`@/lib/map/keyboardActions`), `enumLabels` value lists, `Dialog` primitives.
