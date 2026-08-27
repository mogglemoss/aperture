# Keyboard & Command Layer

**Goal:** Kill the "too many clicks" problem: a command palette plus single-key operations on the current selection, so every high-frequency mapping action is reachable without leaving the keyboard.
**References:** CLAUDE.md "Mutation pathways" (all actions route through existing Server Actions / API routes — this layer adds invocation surfaces, never new mutation paths), `src/components/map/MapCanvas.md` (selection model: `selected` / `selectedSystemIds`), `src/components/map/SignaturePasteHotkey.md` (the existing global-hotkey idiom: how it scopes to the map page and avoids firing inside inputs).

## Stage 1 — Command palette
**Mode:** Execute
**Status:** done — f259162
**Goal:** A ⌘K/Ctrl-K palette on the map page listing context-aware actions — selection-dependent entries (set status, toggle EOL stage, mass stage, lock, rally, remove) plus global ones (add system, jump to system by name/alias — reusing the sig-search jump, open notes browser, open settings) — each dispatching the exact callback the equivalent button already uses.
**References:** `src/components/map/MapCanvas.md`, `src/components/sidebar/InspectorModule.md` (the per-system action vocabulary and their commit callbacks), shadcn/ui Command component (add via the project's component pipeline).
**Touches:** new `src/components/map/CommandPalette.tsx` (+ `.md`), `src/components/map/MapCanvas.tsx` (mount + wire callbacks), `package.json` only if the Command primitive needs `cmdk`.
**Done when:** palette opens/closes on the hotkey anywhere on the map page except inside text inputs; every listed action performs the identical mutation as its button counterpart (spot-check via the audit log); `pnpm typecheck && pnpm lint && pnpm test` green.

## Stage 2 — Single-key operations + graph navigation
**Mode:** Execute
**Status:** todo
**Goal:** With a system selected: bare keys for the hot loop (e.g. `e` cycle EOL stage, `m` cycle mass, `l` lock toggle, `r` rally toggle, `x`/`Del` remove with the existing confirm, `n` focus the note add dialog, `/` open the palette pre-filtered). `h/j/k/l` + arrows move selection to the nearest connected system in that direction (graph-adjacent first, falling back to nearest by position); `Esc` clears selection. A `?` overlay lists the bindings.
**References:** `src/components/map/MapCanvas.md` (selection + callbacks), Stage 1's palette (shares the action registry so bindings and palette entries can't drift apart).
**Touches:** new `src/lib/map/keyboardActions.ts` (+ `.md`) — the shared action registry; `src/components/map/MapCanvas.tsx`; `src/components/map/CommandPalette.tsx`.
**Done when:** the listed keys act on the selected system and never fire while any input/textarea/dialog has focus; hjkl traverses a 10-system chain end to end; the `?` overlay matches the actual bindings; checks green.

## Manual verification
_(worked by the user once, after the run — the plan is not complete until it passes)_
- **Stage 1** — palette actions vs. button actions: pick three (EOL, lock, remove) and confirm identical results and audit-log entries.
- **Stage 2** — hold the map with one hand on the keyboard through a full scan-in (paste, tag, EOL-mark, note): no mouse needed except node dragging; typing in the note dialog never triggers map keys.

## Notes
_(appended by executing sessions — non-obvious findings only)_
