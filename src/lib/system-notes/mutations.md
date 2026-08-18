## mutations.ts

**Purpose:** Create/update/delete for global system notes; every mutation also writes one `ap_system_note_event` audit row in the same transaction.
**File:** `src/lib/system-notes/mutations.ts`

Notes are deployment-global manual intel with no `map_id`, so they do NOT go through `commitMapEvent` / `ap_map_event` and emit no realtime event — a plain REST resource. Deletes are hard deletes; the audit row carries the full pre-delete snapshot so the intel stays recoverable.

---

### createSystemNote(input: CreateSystemNoteInput): Promise<ApSystemNote>
Inserts a note + a `create` audit event (payload: full row snapshot). Returns the new row.

**Parameters:**
- `input` — `{ systemId, body, characterId }`; `characterId` stamps both the row's `created_by_character_id` and the audit event.

---

### updateSystemNote(input: UpdateSystemNoteInput): Promise<ApSystemNote | null>
Replaces the note body (`updated_at` bumps) + an `update` audit event carrying the new body. Returns the updated row, or null if the id does not exist (no event written).

---

### deleteSystemNote(input: DeleteSystemNoteInput): Promise<ApSystemNote | null>
Hard-deletes a note + a `delete` audit event holding the full pre-delete snapshot. Returns the deleted row, or null if the id did not exist.
