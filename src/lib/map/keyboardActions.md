## keyboardActions.ts

**Purpose:** The shared action registry behind the command palette, the single-key bindings, and the mobile node action sheet (via `buildMobileSheetActions`): turns the current selection into the list of invocable actions, each dispatching the exact callback its button counterpart uses. Pure, client-safe; invents no mutation paths.
**File:** `src/lib/map/keyboardActions.ts`

---

### PaletteAction
`{ id, label, group: 'System' | 'Connection' | 'Map' | 'Jump to system', keywords?, perform() }`.

### KeyboardActionContext
The selection plus callbacks: `selectedSystem`, `selectedConnection`, `homeMapSystemId`, `systems`, `onSystemPatch`, `onSystemRemove`, `onConnectionPatch`, `onConnectionDelete`, `openAddSystem`, `jumpToSystem`.

### buildPaletteActions(ctx): PaletteAction[]
- **System** (single selected system): set status (every `SYSTEM_STATUSES` value except the current), lock/unlock, set/clear rally, remove — remove is offered only when the system is neither locked nor the map's Home (mirrors the group-delete guard; the server refuses both anyway).
- **Connection** (selected connection): EOL stage (every `EOL_STAGES` value except current), mass status (every `WH_MASSES` value except current), delete.
- **Map**: "Add system…" (opens `AddSystemDialog`).
- **Jump to system**: one entry per visible system (alias + name), calling `jumpToSystem(systemId)`.

### KEY_BINDINGS
The bare-key binding list (`{ keys, does }[]`) — the single reference both the `MapHotkeys` handler and its `?` overlay render from. Deliberately contains no remove/delete key; lock is capital `L` because lowercase `l` is vim-right.

### cycleNext(values, current)
The next value in a cycle list, wrapping.

### Depends On
- `enumLabels.ts` (client-safe enum value lists + labels), `UpdateSystemBody` / `UpdateConnectionBody` (`@/lib/map/client`).
