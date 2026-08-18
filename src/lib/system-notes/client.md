## client.ts

**Purpose:** Browser-side fetch wrappers for the global system-note REST routes.
**File:** `src/lib/system-notes/client.ts`

Unlike the map mutations these carry no `eventId` (notes emit no realtime event): the caller awaits the returned `SystemNote` and splices it into local state directly. Network/error handling + toasts live in `requestJson`.

---

### createSystemNoteOnServer(body: CreateSystemNoteBody): Promise<FetchResult<SystemNote>>
`POST /api/system-notes` with `{ systemId, body }`.

### updateSystemNoteOnServer(args: { noteId: string; patch: UpdateSystemNoteBody }): Promise<FetchResult<SystemNote>>
`PATCH /api/system-notes/[noteId]` with `{ body }`.

### deleteSystemNoteOnServer(args: { noteId: string }): Promise<FetchResult<{ id: string }>>
`DELETE /api/system-notes/[noteId]`.
