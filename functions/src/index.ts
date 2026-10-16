import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { logger, setGlobalOptions } from 'firebase-functions/v2';
import { onDocumentCreated, onDocumentUpdated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { claimPlate as claimPlateTx, resolveClaim as resolveClaimTx, type ClaimAction } from './claims';
import { alertBody, buildingName, REGION } from './config';
import { logEvents, type EventRow } from './log';
import { sendExpoPush, type PushMessage } from './push';
import { pickNextStudent, studentsInRange } from './recipients';

initializeApp();
setGlobalOptions({ region: REGION, maxInstances: 10 });

const db = () => getFirestore();
const alertId = () => db().collection('_ids').doc().id;

// ---------------------------------------------------------------------------
// onPostCreated: alert students whose picked buildings match or neighbour the post.
// ---------------------------------------------------------------------------
export const onPostCreated = onDocumentCreated('posts/{postId}', async (event) => {
  const post = event.data?.data();
  if (!post || post.status !== 'active') return;
  const postId = event.params.postId;

  const students = (await studentsInRange(post.building)).filter((s) => s.uid !== post.organizerId);
  const body = alertBody(post as any);
  const messages: (PushMessage & { alertId: string })[] = students
    .filter((s) => s.pushToken)
    .map((s) => {
      const id = alertId();
      return {
        uid: s.uid,
        to: s.pushToken!,
        title: 'Free food nearby',
        body,
        data: { type: 'post_alert', postId, alertId: id },
        alertId: id,
      };
    });

  const results = await sendExpoPush(messages.map(({ alertId: _a, ...m }) => m));
  await logEvents(
    messages.map((m, i) => ({
      type: 'alert_sent',
      postId,
      userId: m.uid,
      metadata: { kind: 'new_post', alertId: m.alertId, channel: 'push', ok: results[i]?.ok ?? false, error: results[i]?.error ?? null, body },
    })),
  );
  await event.data!.ref.update({ alertsSent: messages.length, studentsInRange: students.length });
  logger.info('post alerts', { postId, inRange: students.length, sent: messages.length });
});

// ---------------------------------------------------------------------------
// onPostUpdated: auto-close at 0 plates with no holds; log every close once.
// ---------------------------------------------------------------------------
export const onPostUpdated = onDocumentUpdated('posts/{postId}', async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!before || !after) return;
  const postId = event.params.postId;

  if (before.status === 'active' && after.status === 'closed') {
    await logEvents([
      {
        type: 'post_closed',
        postId,
        userId: after.organizerId,
        metadata: {
          reason: after.closeReason ?? null,
          platesStart: after.platesStart,
          platesLeft: after.platesLeft,
          pickups: after.pickups ?? 0,
          organizerLeft: after.organizerLeft ?? false,
          liveMs: after.createdAt ? Date.now() - after.createdAt.toMillis() : null,
        },
      },
    ]);
    return;
  }

  if (after.status === 'active' && (after.platesLeft ?? 0) <= 0 && (after.activeClaims ?? 0) <= 0) {
    await event.data!.after.ref.update({
      status: 'closed',
      closedAt: FieldValue.serverTimestamp(),
      closeReason: 'no_plates_left',
    });
  }
});

// ---------------------------------------------------------------------------
// Claims. Mutations are callables so the claim and the plate count move together.
// ---------------------------------------------------------------------------
export const claimPlate = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  const postId = req.data?.postId;
  if (typeof postId !== 'string') throw new HttpsError('invalid-argument', 'postId required');
  return claimPlateTx(req.auth.uid, postId);
});

export const resolveClaim = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  const { claimId, action } = req.data ?? {};
  if (typeof claimId !== 'string' || !['release', 'pickup', 'expire'].includes(action)) {
    throw new HttpsError('invalid-argument', 'claimId and action required');
  }
  return resolveClaimTx(claimId, action as ClaimAction, req.auth.uid);
});

// onClaimWrite: log each transition; on release/expiry, hand the plate to the next student.
export const onClaimWrite = onDocumentWritten('claims/{claimId}', async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!after) return;
  const claimId = event.params.claimId;
  const base = { postId: after.postId, userId: after.studentId };

  if (!before) {
    await logEvents([{ type: 'claim_created', ...base, metadata: { claimId } }]);
    return;
  }
  if (before.status !== 'active' || after.status === 'active') return;

  const heldMs = after.resolvedAt && after.createdAt ? after.resolvedAt.toMillis() - after.createdAt.toMillis() : null;
  const type = { released: 'claim_released', expired: 'claim_expired', picked_up: 'pickup_confirmed' }[after.status as string];
  if (!type) return;
  const rows: EventRow[] = [{ type, ...base, metadata: { claimId, heldMs, resolvedBy: after.resolvedBy ?? null } }];

  if (after.status === 'released' || after.status === 'expired') {
    const next = await notifyNextStudent(after.postId, after.status);
    if (next) rows.push(next);
  }
  await logEvents(rows);
});

async function notifyNextStudent(postId: string, reason: string): Promise<EventRow | null> {
  const postRef = db().doc(`posts/${postId}`);
  const snap = await postRef.get();
  const post = snap.data();
  if (!post || post.status !== 'active' || (post.platesLeft ?? 0) <= 0) return null;

  const [candidates, claims] = await Promise.all([
    studentsInRange(post.building),
    db().collection('claims').where('postId', '==', postId).get(),
  ]);
  const exclude = new Set<string>([post.organizerId, ...(post.releaseNotified ?? [])]);
  claims.docs.forEach((d) => exclude.add(d.data().studentId));

  const next = pickNextStudent(candidates, post.building, exclude);
  if (!next) return null;

  const id = alertId();
  const body = alertBody(post as any);
  const [result] = await sendExpoPush([
    { uid: next.uid, to: next.pushToken!, title: 'A plate just opened up', body, data: { type: 'post_alert', postId, alertId: id } },
  ]);
  await postRef.update({ releaseNotified: FieldValue.arrayUnion(next.uid) });
  return {
    type: 'alert_sent',
    postId,
    userId: next.uid,
    metadata: { kind: 'release', trigger: reason, alertId: id, channel: 'push', ok: result?.ok ?? false, error: result?.error ?? null, body },
  };
}

// ---------------------------------------------------------------------------
// Every minute: expire 8-minute holds, close posts 4 hours after serving.
// ---------------------------------------------------------------------------
export const sweepClaimsAndPosts = onSchedule({ schedule: 'every 1 minutes', timeZone: 'America/New_York' }, async () => {
  const now = Timestamp.now();

  const staleClaims = await db().collection('claims').where('status', '==', 'active').where('expiresAt', '<=', now).limit(300).get();
  for (const c of staleClaims.docs) {
    try {
      await resolveClaimTx(c.id, 'expire', null);
    } catch (err) {
      logger.warn('expire failed', { claimId: c.id, err: String(err) });
    }
  }

  const stalePosts = await db().collection('posts').where('status', '==', 'active').where('expiresAt', '<=', now).limit(300).get();
  const batch = db().batch();
  stalePosts.docs.forEach((p) =>
    batch.update(p.ref, { status: 'closed', closedAt: FieldValue.serverTimestamp(), closeReason: 'food_safety_4h' }),
  );
  if (!stalePosts.empty) await batch.commit();

  logger.info('sweep', { expiredClaims: staleClaims.size, closedPosts: stalePosts.size });
});

// ---------------------------------------------------------------------------
// Every minute: end-of-event reminders, 10 minutes before an organizer's event ends.
// ---------------------------------------------------------------------------
export const sendEventReminders = onSchedule({ schedule: 'every 1 minutes', timeZone: 'America/New_York' }, async () => {
  const due = await db()
    .collection('eventSchedules')
    .where('status', '==', 'pending')
    .where('remindAt', '<=', Timestamp.now())
    .limit(100)
    .get();

  for (const doc of due.docs) {
    const ev = doc.data();
    const user = (await db().doc(`users/${ev.organizerId}`).get()).data();
    const token = user?.pushToken;
    const where = [buildingName(ev.building), ev.room].filter(Boolean).join(' ');
    let result: { ok: boolean; error?: string } = { ok: false, error: 'no_push_token' };
    if (token) {
      [result] = await sendExpoPush([
        {
          uid: ev.organizerId,
          to: token,
          title: 'Event ending soon',
          body: 'Event ending soon. Any leftovers? Post in 30 sec.',
          data: { type: 'reminder', scheduleId: doc.id, building: ev.building, room: ev.room ?? '' },
        },
      ]);
    }
    await doc.ref.update({ status: token ? 'sent' : 'failed', reminderSentAt: FieldValue.serverTimestamp() });
    await logEvents([
      {
        type: 'reminder_sent',
        postId: null,
        userId: ev.organizerId,
        metadata: { scheduleId: doc.id, channel: 'push', where, ok: result.ok, error: result.error ?? null },
      },
    ]);
  }
});
