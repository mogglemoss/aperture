import type {
  MapChain,
  MapChainMember,
  MapConnectionEdge,
  MapNote,
  MapSignature,
  MapSystemNode,
  MapViewData,
} from '@/types';
import type { MapEventPayload } from '@/lib/realtime/protocol';

/**
 * Drop the given members plus their whole descendant closure — the client-side
 * mirror of the `parent_member_id ON DELETE CASCADE` (the server deletes only
 * the named members and lets Postgres cascade the subtrees, so the reducer must
 * walk them itself).
 */
function pruneMemberSubtrees(
  members: MapChainMember[],
  seedIds: Set<string>,
): MapChainMember[] {
  if (seedIds.size === 0) return members;
  const doomed = new Set(seedIds);
  let grew = true;
  while (grew) {
    grew = false;
    for (const m of members) {
      if (m.parentMemberId !== null && doomed.has(m.parentMemberId) && !doomed.has(m.id)) {
        doomed.add(m.id);
        grew = true;
      }
    }
  }
  return members.filter((m) => !doomed.has(m.id));
}

/**
 * Pure reducer: apply one realtime map event to the current canvas view state.
 * Returns a new `MapViewData` (never mutates). Called on the client inside a
 * `useState` + `useEffect` pair in `MapCanvas.tsx`.
 *
 * `map.create`, `map.delete`, `map.restore`, and `map.purge` have no canvas
 * representation; `map.delete` navigation is handled by the separate
 * `mapDeleted` WS task. `map.restore`/`map.purge` are admin-only events and
 * never reach an open user canvas (soft-deleted maps are already filtered out
 * for non-admin viewers), so the reducer treats them as no-ops.
 */
export function applyEvent(state: MapViewData, payload: MapEventPayload): MapViewData {
  switch (payload.kind) {
    case 'system.added': {
      // Pure node-body delta: `payload` structurally satisfies MapSystemNode
      // (contains all required fields). Signatures are NOT carried on the event —
      // the canvas hydrates a (re)added system's surviving sigs via
      // `fetchSystemSignatures` on receipt (kept the `pg_notify` payload small).
      const nodeData = payload as unknown as MapSystemNode;
      const exists = state.systems.some((s) => s.id === nodeData.id);
      const systems = exists
        ? state.systems.map((s) => (s.id === nodeData.id ? nodeData : s))
        : [...state.systems, nodeData];
      return { ...state, systems };
    }

    case 'system.removed':
      // Removal hides the system (visible=false) and orphans its connections +
      // signatures. The server load filters connections to visible-both-endpoint
      // pairs, so mirror that here — otherwise consumers that iterate connections
      // directly (SystemOverlay) keep showing the orphans as "Unknown" until reload.
      // Chain memberships of the system are pruned server-side in the same
      // transaction (subtrees cascade via the parent FK) with no event of their
      // own — mirror that prune too, descendant closure included.
      return {
        ...state,
        systems: state.systems.filter((s) => s.id !== payload.id),
        connections: state.connections.filter(
          (c) => c.source !== payload.id && c.target !== payload.id,
        ),
        signatures: state.signatures.filter((s) => s.mapSystemId !== payload.id),
        chainMembers: pruneMemberSubtrees(
          state.chainMembers,
          new Set(
            state.chainMembers.filter((m) => m.mapSystemId === payload.id).map((m) => m.id),
          ),
        ),
      };

    case 'system.updated': {
      return {
        ...state,
        systems: state.systems.map((s): MapSystemNode => {
          if (s.id !== payload.id) return s;
          const next = { ...s };
          if (payload.alias !== undefined) next.alias = payload.alias;
          if (payload.tag !== undefined) next.tag = payload.tag;
          if (payload.intelNotes !== undefined) next.intelNotes = payload.intelNotes;
          if (payload.status !== undefined) next.status = payload.status;
          if (payload.locked !== undefined) {
            next.locked = payload.locked;
            next.lockedByCharacterId = payload.lockedByCharacterId ?? null;
            next.lockedByName = payload.lockedByName ?? null;
          }
          if (payload.positionX !== undefined) next.positionX = payload.positionX;
          if (payload.positionY !== undefined) next.positionY = payload.positionY;
          if (payload.rallyAt !== undefined) next.rallyAt = payload.rallyAt;
          return next;
        }),
      };
    }

    case 'connection.create': {
      // payload structurally satisfies MapConnectionEdge.
      const edge = payload as MapConnectionEdge;
      const exists = state.connections.some((c) => c.id === edge.id);
      if (exists) {
        return {
          ...state,
          connections: state.connections.map((c) => (c.id === edge.id ? edge : c)),
        };
      }
      return { ...state, connections: [...state.connections, edge] };
    }

    case 'connection.update': {
      return {
        ...state,
        connections: state.connections.map((c): MapConnectionEdge => {
          if (c.id !== payload.id) return c;
          const next = { ...c };
          if (payload.scope !== undefined) next.scope = payload.scope;
          if (payload.massStatus !== undefined) next.massStatus = payload.massStatus;
          if (payload.jumpMassClass !== undefined) next.jumpMassClass = payload.jumpMassClass;
          if (payload.eolStage !== undefined) next.eolStage = payload.eolStage;
          if (payload.preserveMass !== undefined) next.preserveMass = payload.preserveMass;
          if (payload.isRolling !== undefined) next.isRolling = payload.isRolling;
          if (payload.isStatic !== undefined) next.isStatic = payload.isStatic;
          if (payload.sourceBubbled !== undefined) next.sourceBubbled = payload.sourceBubbled;
          if (payload.targetBubbled !== undefined) next.targetBubbled = payload.targetBubbled;
          if (payload.eolAt !== undefined) next.eolAt = payload.eolAt;
          return next;
        }),
      };
    }

    case 'connection.delete':
      return {
        ...state,
        connections: state.connections.filter((c) => c.id !== payload.id),
        // ap_map_signature.map_connection_id is ON DELETE CASCADE — Postgres
        // drops these rows when the connection goes, but only a connection.delete
        // event is emitted. Mirror the cascade so the client never keeps a
        // signature whose DB row is gone (deleting it would 400 "Signature not
        // found.").
        signatures: state.signatures.filter((s) => s.mapConnectionId !== payload.id),
        // ap_map_chain_member.via_connection_id is ON DELETE SET NULL — a
        // collapsed hole leaves the occurrence in place. Mirror the SET NULL.
        chainMembers: state.chainMembers.map((m) =>
          m.viaConnectionId === payload.id ? { ...m, viaConnectionId: null } : m,
        ),
      };

    case 'map.update': {
      if (payload.name === undefined) return state;
      return { ...state, map: { ...state.map, name: payload.name } };
    }

    case 'signature.create': {
      const sigData = payload as MapSignature;
      const exists = state.signatures.some((s) => s.id === sigData.id);
      if (exists) {
        return {
          ...state,
          signatures: state.signatures.map((s) => (s.id === sigData.id ? sigData : s)),
        };
      }
      return { ...state, signatures: [...state.signatures, sigData] };
    }

    case 'signature.update': {
      // Self-heal: when the full post-update snapshot rides the event, upsert it
      // (replace-by-id, else append) so a client missing this sig's baseline
      // materializes it instead of silently no-op'ing the merge-by-id below.
      if (payload.snapshot) {
        const snap = payload.snapshot as MapSignature;
        const exists = state.signatures.some((s) => s.id === snap.id);
        return {
          ...state,
          signatures: exists
            ? state.signatures.map((s) => (s.id === snap.id ? snap : s))
            : [...state.signatures, snap],
        };
      }
      return {
        ...state,
        signatures: state.signatures.map((s): MapSignature => {
          if (s.id !== payload.id) return s;
          const next = { ...s };
          if (payload.mapConnectionId !== undefined) next.mapConnectionId = payload.mapConnectionId;
          if (payload.sigId !== undefined) next.sigId = payload.sigId;
          if (payload.groupKey !== undefined) next.groupKey = payload.groupKey;
          if (payload.typeId !== undefined) next.typeId = payload.typeId;
          if (payload.eolStage !== undefined) next.eolStage = payload.eolStage;
          if (payload.wormholeCode !== undefined) next.wormholeCode = payload.wormholeCode;
          if (payload.name !== undefined) next.name = payload.name;
          if (payload.description !== undefined) next.description = payload.description;
          if (payload.expiresAt !== undefined) next.expiresAt = payload.expiresAt;
          if (payload.updatedAt !== undefined) next.updatedAt = payload.updatedAt;
          return next;
        }),
      };
    }

    case 'signature.delete':
      return { ...state, signatures: state.signatures.filter((s) => s.id !== payload.id) };

    case 'note.created': {
      // payload structurally satisfies MapNote (full body).
      const note = payload as unknown as MapNote;
      const exists = state.notes.some((n) => n.id === note.id);
      if (exists) {
        return { ...state, notes: state.notes.map((n) => (n.id === note.id ? note : n)) };
      }
      return { ...state, notes: [...state.notes, note] };
    }

    case 'note.updated': {
      return {
        ...state,
        notes: state.notes.map((n): MapNote => {
          if (n.id !== payload.id) return n;
          const next = { ...n };
          // `title` always rides; the rest only when changed.
          next.title = payload.title;
          if (payload.content !== undefined) next.content = payload.content;
          if (payload.severity !== undefined) next.severity = payload.severity;
          if (payload.locked !== undefined) next.locked = payload.locked;
          if (payload.positionX !== undefined) next.positionX = payload.positionX;
          if (payload.positionY !== undefined) next.positionY = payload.positionY;
          next.lastEditedByCharacterId = payload.lastEditedByCharacterId;
          next.lastEditedByName = payload.lastEditedByName;
          next.updatedAt = payload.updatedAt;
          return next;
        }),
      };
    }

    case 'note.deleted':
      return { ...state, notes: state.notes.filter((n) => n.id !== payload.id) };

    case 'chain.created': {
      // Full chain body; the event's `chainKind` maps onto MapChain.kind (the
      // payload key `kind` is the discriminator). Personal chains of other
      // viewers fold in too — the render layer filters by ownership, not the
      // reducer (it has no viewer identity).
      const chain: MapChain = {
        id: payload.id,
        name: payload.name,
        kind: payload.chainKind,
        ownerCharacterId: payload.ownerCharacterId,
        createdAt: payload.createdAt,
        updatedAt: payload.updatedAt,
      };
      const exists = state.chains.some((c) => c.id === chain.id);
      return {
        ...state,
        chains: exists
          ? state.chains.map((c) => (c.id === chain.id ? chain : c))
          : [...state.chains, chain],
      };
    }

    case 'chain.renamed':
      return {
        ...state,
        chains: state.chains.map((c) =>
          c.id === payload.id ? { ...c, name: payload.name, updatedAt: payload.updatedAt } : c,
        ),
      };

    case 'chain.deleted':
      // Members cascade with the chain; pointer-leaves elsewhere that named it
      // degrade to plain leaves (pointer_chain_id SET NULL). Mirror both.
      return {
        ...state,
        chains: state.chains.filter((c) => c.id !== payload.id),
        chainMembers: state.chainMembers
          .filter((m) => m.chainId !== payload.id)
          .map((m) => (m.pointerChainId === payload.id ? { ...m, pointerChainId: null } : m)),
      };

    case 'chain.member.added': {
      // Upsert by id: re-delivery and the via-connection backfill both arrive
      // as the full member body.
      const member: MapChainMember = {
        id: payload.id,
        chainId: payload.chainId,
        mapSystemId: payload.mapSystemId,
        parentMemberId: payload.parentMemberId,
        viaConnectionId: payload.viaConnectionId,
        pointerChainId: payload.pointerChainId,
      };
      const exists = state.chainMembers.some((m) => m.id === member.id);
      return {
        ...state,
        chainMembers: exists
          ? state.chainMembers.map((m) => (m.id === member.id ? member : m))
          : [...state.chainMembers, member],
      };
    }

    case 'map.create':
    case 'map.delete':
    case 'map.restore':
    case 'map.purge':
    // Feature-delegation grants/revocations change server-side authority only;
    // they carry no canvas state. Share mint/revoke likewise — `MapCanvas`
    // reads them off the envelope for the live-share indicator instead.
    case 'access.granted':
    case 'access.revoked':
    case 'share.created':
    case 'share.revoked':
      return state;

    default:
      return state;
  }
}
