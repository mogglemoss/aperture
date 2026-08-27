# Nomadic Chains

**Goal:** A Tripwire-class chain model for corps with no home hole: chains as named trees rooted at k-space entrances, an all-seeing forest view plus ad-hoc tabs (personal, or director-shared for ops), over the existing single corp map — one shared graph, occurrences layered on top.
**References:** CLAUDE.md "Mutation pathways" / "Realtime" / "Database"; `src/db/schema/ap/map_system.md`, `map_connection.md`, `map_event.md`; `src/components/map/MapCanvas.md`; `src/lib/map/mutations/systems.md`, `connections.md`; `src/lib/map/applyEvent.md`.

---

## Settled design (decided in workshopping — not up for re-litigation by an executing session)

- **Canonical data, occurrence presentation.** `ap_map_system` stays UNIQUE per (map, system); signatures, status, alias, lock, notes remain per canonical row and are therefore shared across every occurrence (a deliberate improvement over Tripwire). Chains add an *occurrence layer*: `ap_map_chain` (tab identity) + `ap_map_chain_member` (tree position). The canvas in chain mode renders one node per **membership** (`chainId:mapSystemId` xyflow ids), not per system.
- **Chains are trees, never merged.** Root = the chain's anchor (typically its k-space entrance). Parent = the member you charted/jumped from. Depth is derived, not stored.
- **Pointer-leaf on cross-links (by fiat).** A connection whose far side already belongs to a different chain (or would revisit this chain — a loop) renders as a terminal pointer-leaf ("continues in *Chain B* →" / "loops to *X*"), never a recursive unfold. Clicking a pointer-leaf switches to that chain's tab focused on the target.
- **Tabs = chains.** `kind='personal'` (any active character may create/rename/delete their own, invisible to others) and `kind='shared'` (director-created via `canManageMap`, visible to every viewer — the "temporary corp op" case). One anchor per chain. The tab strip wraps/scrolls (Wingspan runs 2+ rows).
- **Layout is generated, not manual.** One layout engine: a tab renders one tree (root top, children fanned horizontally, depth vertical); the All view renders every chain side by side at natural width, horizontally scrollable. Chains can be *wide* (Thera: ~30 children at depth 1). Zoomed out, a chain collapses to a labeled blob ("Thera · 34 systems · 5 HS exits"). Free-canvas mode is untouched; chain mode is a per-user display toggle on the map page, no schema.
- **Tracking placement:** a tracked pilot's jump creates the new membership as a child of the membership they jumped *from* (the traversed connection identifies it). Manual adds/pastes join the chain whose tab is active; with no active chain they stay chainless (rendered under an "Unassigned" pseudo-column in the All view).
- **Membership is written at charting time, not derived** — the parent relation is *how it was charted*, which an undirected graph cannot reproduce. UNIQUE (chain_id, map_system_id): a system occurs at most once per chain; re-reaching it in the same chain is a loop pointer-leaf.
- **Realtime:** chain + membership mutations are ordinary map events (new `chain.*` event kinds inside `ap_map_event` — the WS task vocabulary is untouched; this is payload, not protocol). Personal chains fan out like everything else; non-owners simply don't render them.
- **Out of scope:** auto-tag schemes per chain (0121 stays Home-rooted), multi-anchor tabs (rejected), any change to the mutation pathways or WS task vocabulary.

---

## Stage 1 — Chain schema
**Mode:** Execute
**Status:** todo
**Goal:** `ap_map_chain` + `ap_map_chain_member` exist with the settled shape, migrated and typed.
**References:** `src/db/schema/ap/map_system.md`, `map_connection.md`, `structure.md` (audit-FK conventions), CLAUDE.md "Database".
**Touches:** `src/db/schema/ap/enums.ts` (+`chain_kind` pgEnum `personal|shared`), new `src/db/schema/ap/map_chain.ts` + `map_chain_member.ts` (+ companions), `src/db/schema/ap/user.ts` (`chain_blob_threshold`), `src/db/schema/index.ts`, `src/types/index.ts`, one migration + rollback.
**Spec:** `ap_user` gains `chain_blob_threshold` (`integer NOT NULL DEFAULT 15`) — the per-account chain-size collapse preference Stage 3's decision function consumes. `ap_map_chain`: id bigserial PK, map_id → ap_map CASCADE, name (≤40, app-layer), kind `chain_kind`, owner_character_id → ap_character CASCADE for `personal` (CHECK: personal ⇔ owner non-null, shared ⇔ owner null... shared keeps a `created_by_character_id` SET NULL audit column instead), created/updated timestamptz. `ap_map_chain_member`: id bigserial PK, chain_id → ap_map_chain CASCADE, map_system_id → ap_map_system CASCADE, parent_member_id → self CASCADE nullable (null ⇔ root), via_connection_id → ap_map_connection SET NULL nullable, pointer_chain_id → ap_map_chain SET NULL nullable (non-null ⇔ pointer-leaf), UNIQUE(chain_id, map_system_id), index on chain_id.
**Done when:** migration applies + rolls back on the dev DB; `pnpm typecheck && pnpm lint && pnpm test` green.

## Stage 2 — Chain lifecycle + membership write-through
**Mode:** Execute
**Status:** todo
**Goal:** Chains are creatable/renamable/deletable through guarded routes, memberships accrete automatically as charting happens, and every change fans out as map events.
**References:** `src/app/api/map/README.md`, `src/lib/map/mutations/systems.md` + `connections.md` + `core.md`, `src/lib/map/applyEvent.md`, `src/lib/auth/rights.md` (`canManageMap` for shared chains).
**Touches:** new `src/lib/map/mutations/chains.ts` (+ `.md`), new API routes under `src/app/api/map/[mapId]/chains/`, `src/lib/map/mutations/systems.ts` (accept optional `chainId` + source-membership context on create), `src/lib/map/applyEvent.ts`, `src/lib/map/client.ts`, event-kind registry.
**Spec:** create (personal: any viewer; shared: `requireMapManage`), rename, delete (delete removes memberships, never canonical systems). Membership write-through: system.added carrying a `chainId` (+ the source member for parentage) inserts a membership in the same transaction/event batch; a connection landing on a system already in another chain (or the same chain) inserts a pointer-leaf membership instead. Location-tracked jumps thread the source membership from the pilot's previous system's membership in the pilot's chain context. Connection/system removal prunes descendant memberships (CASCADE via parent FK does the tree; verify the event payloads let clients converge without reload).
**Done when:** two-browser test: personal chain invisible to the second user; shared chain live-appears; charting from a tab grows the right tree; cross-link produces a pointer-leaf row; checks green.

## Stage 3 — Forest layout engine + LOD spec
**Mode:** Execute
**Status:** todo
**Goal:** A pure, tested layout module: memberships in → positioned occurrence nodes + edges out, for one tree or the whole forest, plus the blob-collapse decision function.
**References:** this stage's spec below (the design is settled — do not re-derive it); Stage 1's `ap_map_chain_member` shape; `src/components/map/MapCanvas.md` only for the consuming render path's expectations (Stage 4).
**Touches:** new `src/lib/map/chains/layout.ts`, `src/lib/map/chains/collapse.ts` (+ companions), `tests/unit/chain-layout.test.ts` (+ companion). Pure modules — no components, no schema, no API.

**Spec (designed 2026-08-27):**
- **Tree layout** — hand-rolled recursive tidy-tree, no new dependency: a subtree's breadth is `max(nodeW, Σ children breadths + gaps)`, parent centered over its children's span, depth axis = `depth × (nodeH + gapY)`. O(n) over members. Children order deterministically by member id (creation order) so growth never shuffles siblings. Pointer-leaves lay out as fixed-size leaf pills. Node/gap dimensions are parameters (`{ nodeW, nodeH, gapX, gapY }`) — the module never imports UI constants.
- **Orientation** — computed in logical (breadth × depth) coordinates, transposed at the end: `root-top` (depth grows downward) or `root-left` (depth grows rightward). A per-user display preference (client-persisted with the map-layout prefs; no schema).
- **Forest packing** (All view) — each chain is a bounding block; shelf-packed into rows wrapping at a supplied viewport width (row height = tallest block in the row). Order: shared chains, then personal, each by creation order; the "Unassigned" pseudo-chain (chainless systems as a plain grid block) last. Order never keys on size, so growth doesn't teleport chains. Re-flow on resize is accepted.
- **Collapse decision** (`collapse.ts`) — pure function of `{ systemCount, zoom, threshold, expandedOverride }` with defined precedence: below the zoom cutoff (constant, ~0.35) every chain is a blob; above it, a chain blobs when `systemCount > threshold` unless the session-local expansion override is set. `threshold` is the viewer's `ap_user.chain_blob_threshold` (default 15 — Tripwire's default).
- **Blob content contract** (consumed by Stage 5's renderer): chain name, system count, k-space exit summary grouped by security class (e.g. "34 systems · 5 HS · 2 LS"), and presence of rally / EOL-critical flags. Hit behavior: click selects (chain summary in the sidebar), the expand affordance toggles the session override, double-click opens the chain's tab.
- **K-space roots and exits render visually distinct** from J-space occurrence tiles (the Tripwire oval-vs-rectangle legibility goal; Stage 4 picks the treatment).
- **Chain mode is not draggable** — the generated layout owns positions; manual drag belongs to the free-canvas mode only.
**Done when:** unit tests cover subtree-breadth math, sibling stability under an added child, both orientations agreeing under transpose, shelf-wrap at a given width, pointer-leaf sizing, and every collapse-precedence branch; `pnpm typecheck && pnpm lint && pnpm test` green. No UI is rendered by this stage.

## Stage 4 — Tab strip + single-chain view
**Mode:** Execute
**Status:** todo
**Goal:** The map page gains a wrapping tab strip (All + this viewer's chains + shared chains) and a chain-mode canvas that renders one chain as a generated tree with occurrence nodes; the free-canvas mode is untouched and remains the default.
**References:** `src/lib/map/chains/layout.md` + `collapse.md` (Stage 3's modules), `src/components/map/MapCanvas.md`, `src/components/map/SystemNode.md`.
**Touches:** `src/components/map/MapCanvas.tsx`, new `ChainTabStrip.tsx` + chain-mode render path (+ companions).
**Done when:** switching tabs re-renders in <100ms on a 40-system chain; occurrence nodes carry full SystemNode affordances (status, sigs, notes indicator); pointer-leaves render and navigate; charting inside the tab grows it live; checks green.

## Stage 5 — All-view forest + LOD blobs
**Mode:** Execute
**Status:** todo
**Goal:** The All tab renders every visible chain side by side (natural width, horizontal scroll) with per-chain blob collapse past the zoom threshold, holding 60fps pan at WDS scale.
**References:** `src/lib/map/chains/layout.md` + `collapse.md` (incl. the blob content contract), Stage 4's render path.
**Touches:** the chain-mode render path, `MapCanvas.tsx`.
**Done when:** a synthetic 1000-system / 30-chain fixture pans smoothly with blobs at low zoom and full tiles at high zoom; an "Unassigned" column carries chainless systems; checks green.

## Stage 6 — Scale ceiling
**Mode:** Execute
**Status:** todo
**Goal:** `MAX_SYSTEMS_PER_MAP` raised (target 1500) with load-path and payload measurements proving the map page, WS fanout, and paste flows hold at that size.
**References:** `aperture.config.md`, `src/lib/map/loadMap.md`, `src/lib/realtime/bus.md` (8KB pg_notify ceiling patterns).
**Touches:** `aperture.config.ts`, whatever the measurements implicate.
**Done when:** the Stage 5 fixture loads in <3s on nautilus and no payload exceeds the pg_notify ceiling; findings recorded in Notes.

## Stage 7 — Chains-near-me
**Design pass:** distance semantics (which tracked character; jumps via gate graph from location to each chain's *nearest* k-space exit of many; staleness), where it surfaces (tab badges? a panel?), and compute placement (server on load vs. on demand). Builds on `src/lib/map/routePlanner.md`, `gateGraph.md`.
**Status:** todo
**Goal:** Every chain answers "how far is this from me" — the orientation feature Tripwire lacks.

## Stage 8 — Mobile pass
**Design pass:** the phone layout for chain mode (single-chain view + tab drawer as the primary mobile surface; what the sm breakpoint dashboard drops). Explicit goal: better than Tripwire mobile, which is the bar on the floor.
**Status:** todo
**Goal:** A phone can follow and chart a chain without fighting the desktop dashboard.

## Manual verification
_(worked by the user once, after the run — the plan is not complete until it passes)_
- **Stage 2** — two accounts: personal chains stay private; a shared chain appears/disappears live for both; deleting a chain never deletes systems from the map.
- **Stage 4** — Wingspan-parity feel test on a real scanned chain: root on top, depth downward, pointer-leaf on a cross-link, tab switch speed.
- **Stage 5** — the All view at real corp scale reads as "Tripwire but coherent": chains separated, blobs legible, horizontal scroll natural.
- **Stage 7** — the badge for a chain you're sitting inside says 0; a chain across the map agrees with a hand-computed dotlan route.
- **Stage 8** — chart three systems into a chain from a phone.

## Notes
_(appended by executing sessions — non-obvious findings only)_
- The fork tracks upstream PR #242 (scoped system notes); if it merges mid-plan, resync before continuing — the note-side machinery this plan touches lightly (notes indicator on occurrence nodes) changes shape there.
