## route.ts (PATCH / DELETE /api/system-notes/[noteId])

**Purpose:** Edit or remove a global system-note row.
**File:** `src/app/api/system-notes/[noteId]/route.ts`

---

### PATCH /api/system-notes/[noteId]
Auth: `requireSystemNoteMutate(session)` — any authenticated character. Body (Zod): any of `body` 1–2000, `category` nullable (validated against the `apertureConfig.SYSTEM_NOTE_CATEGORIES` keys), `locked` boolean; at least one key required. Calls `updateSystemNote` (which also writes an `update` audit event), then `withAuthorName(row)`.

**Responses:** `200 { ok: true, data: SystemNote }`; `400` invalid id / JSON / body / empty patch; `401` not signed in; `404` unknown note id; `409` note is locked (only the bare `{ locked: false }` unlock is accepted while locked).

### DELETE /api/system-notes/[noteId]
Auth: same. Calls `deleteSystemNote` (hard delete; the audit event keeps the full pre-delete snapshot).

**Responses:** `200 { ok: true, data: { id } }`; `400` invalid id; `401` not signed in; `404` unknown note id; `409` note is locked.
