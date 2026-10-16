import {
  doc,
  runTransaction,
  serverTimestamp,
  setDoc,
  collection,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { auth, db, functions, storage } from './firebase';
import { logEvent } from './log';
import { POST_TTL_MS } from './types';

export type NewPost = {
  food: string;
  building: string;
  room: string;
  platesStart: number;
  servedAt: Date;
  tags: string[];
  photoUri: string | null;
  scheduleId?: string | null;
};

/**
 * Creates the post and resolves once the server has it (the post is live and
 * alerts are going out). The photo uploads afterwards so it never delays going live.
 */
export async function createPost(input: NewPost, screenOpenedAt: number): Promise<{ postId: string; postTimeMs: number }> {
  const uid = auth.currentUser!.uid;
  const postRef = doc(collection(db, 'posts'));
  await setDoc(postRef, {
    organizerId: uid,
    food: input.food.trim(),
    building: input.building,
    room: input.room.trim(),
    photoUrl: null,
    platesStart: input.platesStart,
    platesLeft: input.platesStart,
    activeClaims: 0,
    pickups: 0,
    servedAt: Timestamp.fromDate(input.servedAt),
    expiresAt: Timestamp.fromMillis(input.servedAt.getTime() + POST_TTL_MS),
    tags: input.tags,
    status: 'active',
    createdAt: serverTimestamp(),
    closedAt: null,
    closeReason: null,
    organizerLeft: false,
    platesThrownOut: null,
    scheduleId: input.scheduleId || null,
    hasPhoto: Boolean(input.photoUri),
  });
  const postTimeMs = Date.now() - screenOpenedAt;
  logEvent('post_created', {
    postId: postRef.id,
    metadata: { post_time_ms: postTimeMs, platesStart: input.platesStart, building: input.building, tags: input.tags, hasPhoto: Boolean(input.photoUri), fromReminder: Boolean(input.scheduleId) },
  });
  updateDoc(postRef, { postTimeMs }).catch(() => {});
  if (input.photoUri) uploadPhoto(postRef.id, input.photoUri).catch((e) => console.warn('[plateful] photo upload failed', e?.message));
  return { postId: postRef.id, postTimeMs };
}

async function uploadPhoto(postId: string, uri: string) {
  const uid = auth.currentUser!.uid;
  const blob = await (await fetch(uri)).blob();
  const objectRef = ref(storage, `posts/${uid}/${postId}.jpg`);
  await uploadBytes(objectRef, blob, { contentType: 'image/jpeg' });
  await updateDoc(doc(db, 'posts', postId), { photoUrl: await getDownloadURL(objectRef) });
}

export async function editPlates(postId: string, delta: number) {
  const postRef = doc(db, 'posts', postId);
  const next = await runTransaction(db, async (tx) => {
    const snap = await tx.get(postRef);
    const left = Math.max(0, (snap.data()?.platesLeft ?? 0) + delta);
    tx.update(postRef, { platesLeft: left, updatedAt: serverTimestamp() });
    return left;
  });
  logEvent('count_edited', { postId, metadata: { delta, platesLeft: next } });
}

export async function closeFoodGone(postId: string) {
  await updateDoc(doc(db, 'posts', postId), {
    status: 'closed',
    closeReason: 'food_gone',
    closedAt: serverTimestamp(),
  });
}

/** Organizer walks away; the post stays live until plates run out or the 4-hour rule closes it. */
export async function leaveInRoom(postId: string) {
  await updateDoc(doc(db, 'posts', postId), { organizerLeft: true, organizerLeftAt: serverTimestamp() });
  logEvent('organizer_left_in_room', { postId });
}

export async function setThrownOut(postId: string, plates: number | null) {
  await updateDoc(doc(db, 'posts', postId), { platesThrownOut: plates });
  logEvent('plates_thrown_out', { postId, metadata: { plates } });
}

const claimFn = httpsCallable<{ postId: string }, { claimId: string; expiresAt: number }>(functions, 'claimPlate');
const resolveFn = httpsCallable<{ claimId: string; action: 'release' | 'pickup' | 'expire' }, { status: string }>(functions, 'resolveClaim');

export async function claimPlate(postId: string) {
  return (await claimFn({ postId })).data;
}

export async function resolveClaim(claimId: string, action: 'release' | 'pickup' | 'expire') {
  return (await resolveFn({ claimId, action })).data;
}

export async function saveSurvey(input: {
  role: 'organizer' | 'student';
  postId: string;
  claimId?: string | null;
  outcome: string;
  answers: Record<string, string | number | null>;
}) {
  const uid = auth.currentUser!.uid;
  const id = input.role === 'organizer' ? `organizer_${input.postId}` : `student_${input.claimId}`;
  await setDoc(doc(db, 'surveys', id), {
    userId: uid,
    role: input.role,
    postId: input.postId,
    claimId: input.claimId ?? null,
    outcome: input.outcome,
    answers: input.answers,
    createdAt: serverTimestamp(),
  });
  logEvent('survey_submitted', { postId: input.postId, metadata: { role: input.role, claimId: input.claimId ?? null, ...input.answers } });
}
