## chain-distances/route.ts

**Purpose:** Chains-near-me endpoint (nomadic-chains) — unweighted gate jumps from the viewer's pilot to each visible chain's nearest k-space exit, feeding the tab / blob / inspector badges. Orientation only; `route-plan` owns real routing.
**File:** `src/app/api/map/[mapId]/chain-distances/route.ts`

---

### GET /api/map/[mapId]/chain-distances?characterId=N
View-guarded (`requireMapView`). `characterId` is the pilot to measure from and must be one of the viewer's own account characters (`ap_character.user_id` = the session's user) — a foreign character 404s so the endpoint can't probe other pilots' locations; a missing/non-numeric param → 400. The client passes its active-character pick — the same source the route planner uses.

Returns `{ ok: true, data: ChainDistances }` — `{ characterId, originSystemId | null, distances, nearestExits }`, keyed by chain id for every chain the viewer can see (every `shared` chain plus the session character's own `personal` chains — `loadMapForView`'s visibility rule). A `distances` value of null ⇔ the chain has no gate-reachable k-space exit (rendered "—", never 0); `nearestExits` names the argmin exit's solar-system id.

**Origin set:** a k-space pilot (per `isKspaceSecurity` on `universe_system.security`) is their own system; a J-space pilot is the k-space exits of whichever visible chains hold their current system as a real occurrence (min over pairs falls out of the multi-source BFS). An unlocated pilot (`status !== 'active'`, offline, or no `last_system_id`) — or a J-space pilot outside every visible chain — returns `originSystemId: null` with all-null distances (the client hides the badges).

**Read-only:** one multi-source BFS over `getGateGraph().adjacency` per request (O(V+E), no per-chain BFS); no DB writes, no `ap_map_event`, no cache beyond the memoized gate graph. Exits are gathered member-id ordered so the nearest-exit tie-break is deterministic (creation order). Compute lives in the pure `src/lib/map/chains/distance.ts`.
