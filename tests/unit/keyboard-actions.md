## keyboard-actions.test.ts

**Purpose:** Unit guard for the keyboard/palette action registry: `cycleNext` wraps; `buildPaletteActions` skips the current status, never offers remove for a locked or Home system, dispatches the context callbacks verbatim, and lists every visible system in the jump group.
**File:** `tests/unit/keyboard-actions.test.ts`

Pure — no DB, no DOM; contexts are stubbed with `vi.fn()`.
