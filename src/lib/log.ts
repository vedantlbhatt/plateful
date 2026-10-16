import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase';

/** Appends one row to `events`. Never throws: logging must not break a user action. */
export function logEvent(type: string, opts: { postId?: string | null; metadata?: Record<string, unknown> } = {}) {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  addDoc(collection(db, 'events'), {
    type,
    postId: opts.postId ?? null,
    userId: uid,
    timestamp: serverTimestamp(),
    clientTimestamp: Date.now(),
    source: 'app',
    metadata: opts.metadata ?? {},
  }).catch((err) => console.warn('[plateful] logEvent failed', type, err?.message));
}

/**
 * Error callback for onSnapshot. Listeners on screens still in the stack get
 * permission-denied the moment the user signs out; that is expected, not a crash.
 */
export function listenError(where: string) {
  return (err: { code?: string; message?: string }) => {
    if (err?.code === 'permission-denied' && !auth.currentUser) return;
    console.warn(`[plateful] ${where} listener failed`, err?.code, err?.message);
  };
}
