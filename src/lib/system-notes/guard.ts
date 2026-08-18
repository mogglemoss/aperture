import 'server-only';
import type { Session } from 'next-auth';

/**
 * Single authorization chokepoint for system-note mutations. Global system
 * notes are deployment-global shared community data, so the policy is: **any
 * authenticated character may create/edit/delete.** Accountability comes from
 * the `ap_system_note_event` audit log (every mutation is stamped with the
 * actor), not from a write gate. Keeping the policy in one function means
 * tightening it later (e.g. to a corp right) is a one-place change.
 */

export type SystemNoteGuard =
  | { ok: true; characterId: bigint }
  | { ok: false; status: 401; error: string };

export function requireSystemNoteMutate(session: Session | null | undefined): SystemNoteGuard {
  if (!session?.characterId) {
    return { ok: false, status: 401, error: 'You must be signed in.' };
  }
  return { ok: true, characterId: BigInt(session.characterId) };
}
