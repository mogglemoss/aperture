## route.ts (GET /api/system-notes/search)

**Purpose:** Deployment-wide global system-note search for the notes browser.
**File:** `src/app/api/system-notes/search/route.ts`

---

### GET /api/system-notes/search?q=<text>
Auth: `requireSystemNoteMutate(session)` — any authenticated character (read access follows write access). Substring match on note body or system name via `searchSystemNotes`, newest first, capped server-side (`NOTE_SEARCH_LIMIT`).

**Query:** `q` — trimmed, clipped to 100 chars; under 2 chars returns `{ ok: true, data: [] }` without touching the DB.

**Responses:** `200 { ok: true, data: SystemNoteSearchResult[] }`; `401` not signed in.
