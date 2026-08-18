## read.ts

**Purpose:** Read-side queries shaping global system notes for the sidebar.
**File:** `src/lib/system-notes/read.ts`

---

### systemNotesForSystems(systemIds: number[]): Promise<Record<number, SystemNote[]>>
Global system notes for the given universe systems, keyed by `system_id`, newest first within each system. One batched query joins `ap_character` for the author name. Systems with no notes are absent from the record.

System notes have no realtime channel (deployment-global, not map-scoped): this snapshot is load-time only — a note another user adds appears on the next page load.

**Parameters:**
- `systemIds` — EVE solar-system ids visible in the map view.

**Returns:** `SystemNote[]` per system id: `{ id (string), systemId, body, createdByName, createdAt, updatedAt }`.

---

### withAuthorName(row: ApSystemNote): Promise<SystemNote>
Shapes a freshly written `ap_system_note` row into a `SystemNote` for the client, resolving `createdByName`. Used by the create/update routes so the client always receives a complete row to splice into local state.
