#!/usr/bin/env node
// Deletes everything seedDemo.mjs created ("demo_" ids, users and storage),
// plus documents the app wrote about demo users or demo posts during the shoot.
import { BUCKET, getAuth, getFirestore, getStorage, PREFIX } from './_demoAdmin.mjs';

const db = getFirestore();
const meta = await db.doc('demo_meta/session').get();
const startedAt = meta.exists ? meta.data().startedAt.toMillis() : null;
const isDemo = (v) => typeof v === 'string' && v.startsWith(PREFIX);

const demoPostIds = new Set();
const demoUserIds = new Set();
let deleted = 0;

// Posts first, so claims/events/surveys can be matched to them.
for (const d of (await db.collection('posts').get()).docs) {
  if (isDemo(d.id) || isDemo(d.data().organizerId)) demoPostIds.add(d.id);
}

// Anonymous students created by the app during the shoot.
const anonUids = new Set();
if (startedAt) {
  let page;
  do {
    page = await getAuth().listUsers(1000, page?.pageToken);
    for (const u of page.users) {
      const created = Date.parse(u.metadata.creationTime);
      if (u.providerData.length === 0 && created >= startedAt) anonUids.add(u.uid);
    }
  } while (page.pageToken);
}

const byUser = (uid) => isDemo(uid) || anonUids.has(uid);
const rules = {
  users: (d) => isDemo(d.id) || anonUids.has(d.id),
  posts: (d) => demoPostIds.has(d.id),
  claims: (d) => isDemo(d.id) || demoPostIds.has(d.data().postId) || byUser(d.data().studentId),
  events: (d) => demoPostIds.has(d.data().postId) || byUser(d.data().userId),
  surveys: (d) => demoPostIds.has(d.data().postId) || byUser(d.data().userId),
  eventSchedules: (d) => isDemo(d.id) || isDemo(d.data().organizerId),
  demo_meta: () => true,
};

for (const [name, match] of Object.entries(rules)) {
  const docs = (await db.collection(name).get()).docs.filter(match);
  for (let i = 0; i < docs.length; i += 400) {
    const batch = db.batch();
    docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  if (name === 'users') docs.forEach((d) => demoUserIds.add(d.id));
  deleted += docs.length;
  console.log(`${name}: deleted ${docs.length}`);
}

const authUids = [...new Set([...anonUids, 'demo_organizer'])];
const authResult = await getAuth().deleteUsers(authUids);
console.log(`auth: deleted ${authResult.successCount} (demo organizer + ${anonUids.size} anonymous)`);

const [files] = await getStorage().bucket(BUCKET).getFiles({ prefix: 'posts/demo_organizer/' });
await Promise.all(files.map((f) => f.delete()));
console.log(`storage: deleted ${files.length}`);
console.log(`Done. ${deleted} documents removed.`);
process.exit(0);
