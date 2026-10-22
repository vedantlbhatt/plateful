#!/usr/bin/env node
// Seeds storyboard demo data into the local emulators. Every document id,
// user id and storage path starts with "demo_". Undo with cleanupDemo.mjs.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BUCKET, getAuth, getFirestore, getStorage, ROOT, Timestamp } from './_demoAdmin.mjs';

const db = getFirestore();
const now = Date.now();
const ts = (ms) => Timestamp.fromMillis(ms);

// Marks when the demo session started, so cleanup also catches documents the
// app creates during the shoot (the anonymous student, its claims and events).
await db.doc('demo_meta/session').set({ startedAt: ts(now) });

// Organizer account the app signs in with.
const ORGANIZER = { uid: 'demo_organizer', email: 'demo.organizer@gatech.edu', password: 'demo-plateful' };
await getAuth().deleteUser(ORGANIZER.uid).catch(() => {});
await getAuth().createUser({ ...ORGANIZER, emailVerified: true, displayName: 'Demo Organizer' });

const users = {
  demo_organizer: { role: 'organizer', email: ORGANIZER.email, buildings: [], pushToken: null },
  demo_student_1: { role: 'student', buildings: ['klaus', 'culc'], pushToken: null, alertsEnabled: true },
  demo_student_2: { role: 'student', buildings: ['coc', 'skiles'], pushToken: null, alertsEnabled: true },
  demo_student_3: { role: 'student', buildings: ['vanleer', 'howey'], pushToken: null, alertsEnabled: true },
};
for (const [uid, data] of Object.entries(users)) {
  await db.doc(`users/${uid}`).set({ ...data, createdAt: ts(now - 3 * 86400e3) });
}

// Sample photo in the storage emulator, with a download token so <Image> can load it.
const token = randomUUID();
const objectPath = 'posts/demo_organizer/demo_post_pizza.jpg';
await getStorage()
  .bucket(BUCKET)
  .file(objectPath)
  .save(readFileSync(join(ROOT, 'scripts/demo-assets/pizza.jpg')), {
    contentType: 'image/jpeg',
    metadata: { metadata: { firebaseStorageDownloadTokens: token } },
  });
const photoUrl = `http://127.0.0.1:9199/v0/b/${BUCKET}/o/${encodeURIComponent(objectPath)}?alt=media&token=${token}`;

// One active post. 11 plates went out, one was already picked up, so 10 are left.
const servedAt = now - 20 * 60e3;
await db.doc('posts/demo_post_pizza').set({
  organizerId: 'demo_organizer',
  food: 'Pizza',
  building: 'klaus',
  room: '1447',
  photoUrl,
  platesStart: 11,
  platesLeft: 10,
  activeClaims: 0,
  pickups: 1,
  servedAt: ts(servedAt),
  expiresAt: ts(servedAt + 4 * 3600e3),
  tags: ['vegetarian'],
  status: 'active',
  createdAt: ts(now - 15 * 60e3),
  closedAt: null,
  closeReason: null,
  organizerLeft: false,
  platesThrownOut: null,
  postTimeMs: 21400,
  hasPhoto: true,
});

// Claims by other students: one released, one picked up.
await db.doc('claims/demo_claim_release').set({
  postId: 'demo_post_pizza',
  studentId: 'demo_student_2',
  building: 'klaus',
  status: 'released',
  createdAt: ts(now - 12 * 60e3),
  expiresAt: ts(now - 4 * 60e3),
  resolvedAt: ts(now - 9 * 60e3),
  resolvedBy: 'student',
});
await db.doc('claims/demo_claim_pickup').set({
  postId: 'demo_post_pizza',
  studentId: 'demo_student_3',
  building: 'klaus',
  status: 'picked_up',
  createdAt: ts(now - 11 * 60e3),
  expiresAt: ts(now - 3 * 60e3),
  resolvedAt: ts(now - 6 * 60e3),
  resolvedBy: 'student',
});

// The organizer's event, so the reminder has something behind it.
await db.doc('eventSchedules/demo_event_reminder').set({
  organizerId: 'demo_organizer',
  name: 'Hack night',
  building: 'klaus',
  room: '1447',
  endsAt: ts(now + 10 * 60e3),
  remindAt: ts(now),
  status: 'sent',
  createdAt: ts(now - 86400e3),
});

console.log('Seeded demo data. Organizer login:', ORGANIZER.email, '/', ORGANIZER.password);
process.exit(0);
