## route.ts (POST /api/system-notes)

**Purpose:** Create a global system-note row.
**File:** `src/app/api/system-notes/route.ts`

---

### POST /api/system-notes
Auth: `requireSystemNoteMutate(session)` — any authenticated character (401 if not signed in). Body (Zod): `systemId` int>0, `body` 1–2000, `category` enum (`intel`/`journal`/`pve`/`logistics`/`warning`) nullable optional. Calls `createSystemNote({ ...body, characterId })` (which also writes a `create` audit event), then `withAuthorName(row)`.

**Responses:** `200 { ok: true, data: SystemNote }`; `400` invalid JSON / body / FK violation (unknown system); `401` not signed in.

**Not a map event:** system notes are deployment-global (no `map_id`) so this emits no `ap_map_event` / realtime update.
