## guard.ts

**Purpose:** Single authorization chokepoint for system-note mutations — any authenticated character may write; accountability comes from the audit log, not a gate.
**File:** `src/lib/system-notes/guard.ts`

---

### requireSystemNoteMutate(session: Session | null | undefined): SystemNoteGuard
Returns `{ ok: true, characterId }` for any signed-in session, else `{ ok: false, status: 401, error }`. Global system notes are deployment-global shared community data; the write policy lives here so tightening it later (e.g. to a corp right) is a one-place change.

**Returns:** `SystemNoteGuard` — discriminated on `ok`.
