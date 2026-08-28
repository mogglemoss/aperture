## useIsPhoneViewport.ts

**Purpose:** Phone-width viewport test for the mobile chain view — true below the dashboard's `sm`/`md` boundary.
**File:** `src/components/map/mobile/useIsPhoneViewport.ts`

---

### useIsPhoneViewport(): boolean
True ⇔ the window matches `(max-width: PANEL_BREAKPOINTS.md - 1)` — i.e. the width range where the dashboard grid would report the `sm` breakpoint. Implemented as a `matchMedia` store via `useSyncExternalStore` (re-renders on crossing, SSR snapshot `false` — the client corrects on first render without a hydration mismatch).

Reads the window rather than the grid's `onBreakpointChange` because the mobile chain view unmounts the grid entirely: the render decision must precede and outlive the grid's own measurement. The grid measures its container (a few px narrower than the window); at phone scale the two always agree on `sm`.

### Depends On
- `PANEL_BREAKPOINTS` (`@/lib/map/layout/panels`)
