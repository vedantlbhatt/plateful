import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { CLAIM_HOLD_MS } from './config';

export type ClaimAction = 'release' | 'pickup' | 'expire';

const STATUS_FOR: Record<ClaimAction, string> = {
  release: 'released',
  pickup: 'picked_up',
  expire: 'expired',
};

/**
 * Claim and plate count change in one transaction, so plates can never be
 * over-claimed and every client's post listener sees the decrement at once.
 */
export async function claimPlate(uid: string, postId: string): Promise<{ claimId: string; expiresAt: number }> {
  const db = getFirestore();
  const postRef = db.doc(`posts/${postId}`);
  return db.runTransaction(async (tx) => {
    const post = await tx.get(postRef);
    if (!post.exists) throw new HttpsError('not-found', 'That post is gone.');
    const p = post.data()!;
    if (p.status !== 'active') throw new HttpsError('failed-precondition', 'This post is closed.');
    if (p.organizerId === uid) throw new HttpsError('failed-precondition', 'You posted this one.');
    if ((p.platesLeft ?? 0) <= 0) throw new HttpsError('resource-exhausted', 'No plates left.');
    if (p.expiresAt && p.expiresAt.toMillis() <= Date.now()) {
      throw new HttpsError('failed-precondition', 'This food has been out too long.');
    }

    const existing = await tx.get(
      db.collection('claims').where('postId', '==', postId).where('studentId', '==', uid).where('status', '==', 'active'),
    );
    if (!existing.empty) throw new HttpsError('already-exists', 'You already have a plate held here.');

    const now = Timestamp.now();
    const expiresAt = Timestamp.fromMillis(now.toMillis() + CLAIM_HOLD_MS);
    const claimRef = db.collection('claims').doc();
    tx.set(claimRef, {
      postId,
      studentId: uid,
      status: 'active',
      createdAt: now,
      expiresAt,
      resolvedAt: null,
      building: p.building,
    });
    tx.update(postRef, {
      platesLeft: FieldValue.increment(-1),
      activeClaims: FieldValue.increment(1),
      updatedAt: now,
    });
    return { claimId: claimRef.id, expiresAt: expiresAt.toMillis() };
  });
}

/**
 * Resolves an active claim. `actorUid` null means the scheduler is expiring it.
 * Release and expiry return the plate; pickup counts it as eaten. Idempotent:
 * resolving an already-resolved claim returns its current status.
 */
export async function resolveClaim(
  claimId: string,
  action: ClaimAction,
  actorUid: string | null,
): Promise<{ status: string }> {
  const db = getFirestore();
  const claimRef = db.doc(`claims/${claimId}`);
  return db.runTransaction(async (tx) => {
    const claim = await tx.get(claimRef);
    if (!claim.exists) throw new HttpsError('not-found', 'Claim not found.');
    const c = claim.data()!;
    if (actorUid && c.studentId !== actorUid) throw new HttpsError('permission-denied', 'Not your claim.');
    if (c.status !== 'active') return { status: c.status as string };

    const now = Timestamp.now();
    const expired = c.expiresAt.toMillis() <= now.toMillis();
    let finalAction = action;
    // A pickup tapped after the hold ran out does not count: the plate was already up for grabs.
    if (action === 'pickup' && expired) finalAction = 'expire';
    // Clients call expire when their countdown hits zero; allow a little clock skew, nothing more.
    if (action === 'expire' && actorUid && c.expiresAt.toMillis() > now.toMillis() + 5000) {
      throw new HttpsError('failed-precondition', 'This claim has not expired yet.');
    }

    const postRef = db.doc(`posts/${c.postId}`);
    tx.update(claimRef, { status: STATUS_FOR[finalAction], resolvedAt: now, resolvedBy: actorUid ? 'student' : 'scheduler' });
    tx.update(postRef, {
      activeClaims: FieldValue.increment(-1),
      ...(finalAction === 'pickup'
        ? { pickups: FieldValue.increment(1) }
        : { platesLeft: FieldValue.increment(1) }),
      updatedAt: now,
    });
    return { status: STATUS_FOR[finalAction] };
  });
}
