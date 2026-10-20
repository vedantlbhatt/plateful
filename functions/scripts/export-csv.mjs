#!/usr/bin/env node
// Dumps events, posts, claims and surveys to CSV for the testing sheet.
//
//   npm run export                       (from the repo root)
//   npm run export -- --since 2026-10-20 (only rows created on/after that date)
//
// Credentials: GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json,
// or `gcloud auth application-default login`. Set FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
// to export from the local emulator. Project id comes from GCLOUD_PROJECT or .firebaserc.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const sinceArg = args[args.indexOf('--since') + 1];
const since = args.includes('--since') && sinceArg ? new Date(sinceArg).getTime() : 0;

let projectId = process.env.GCLOUD_PROJECT;
if (!projectId && existsSync(join(root, '.firebaserc'))) {
  projectId = JSON.parse(readFileSync(join(root, '.firebaserc'), 'utf8')).projects?.default;
}
initializeApp(projectId ? { projectId } : undefined);
const db = getFirestore();

const ms = (t) => (t && typeof t.toMillis === 'function' ? t.toMillis() : typeof t === 'number' ? t : null);
const iso = (t) => (ms(t) == null ? '' : new Date(ms(t)).toISOString());
const local = (t) => (ms(t) == null ? '' : new Date(ms(t)).toLocaleString('en-US', { timeZone: 'America/New_York' }));
const mins = (a, b) => (ms(a) != null && ms(b) != null ? ((ms(b) - ms(a)) / 60000).toFixed(1) : '');
const cell = (v) => {
  if (v == null) return '';
  const s = Array.isArray(v) ? v.join('|') : typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (cols, rows) => [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n') + '\n';

async function all(name) {
  const snap = await db.collection(name).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

const [events, posts, claims, surveys] = await Promise.all(['events', 'posts', 'claims', 'surveys'].map(all));
const keep = (t) => (ms(t) ?? Date.now()) >= since;

const surveyByPost = new Map(surveys.filter((s) => s.role === 'organizer').map((s) => [s.postId, s]));
const surveyByClaim = new Map(surveys.filter((s) => s.role === 'student').map((s) => [s.claimId, s]));
const countBy = (type, key = 'postId') => {
  const m = new Map();
  events.filter((e) => e.type === type).forEach((e) => m.set(e[key], (m.get(e[key]) ?? 0) + 1));
  return m;
};
const alertsSent = countBy('alert_sent');
const alertsOpened = countBy('alert_opened');
const claimsByPost = new Map();
claims.forEach((c) => claimsByPost.set(c.postId, [...(claimsByPost.get(c.postId) ?? []), c]));

// --- events.csv: one row per logged action ---------------------------------
const eventCols = ['event_id', 'type', 'timestamp_iso', 'timestamp_et', 'user_id', 'post_id', 'source', 'post_time_ms', 'reason', 'delta', 'kind', 'channel', 'claim_id', 'held_seconds', 'metadata_json'];
const eventRows = events
  .filter((e) => keep(e.timestamp))
  .sort((a, b) => (ms(a.timestamp) ?? 0) - (ms(b.timestamp) ?? 0))
  .map((e) => {
    const m = e.metadata ?? {};
    return {
      event_id: e.id,
      type: e.type,
      timestamp_iso: iso(e.timestamp),
      timestamp_et: local(e.timestamp),
      user_id: e.userId,
      post_id: e.postId,
      source: e.source,
      post_time_ms: m.post_time_ms,
      reason: m.reason,
      delta: m.delta,
      kind: m.kind,
      channel: m.channel,
      claim_id: m.claimId,
      held_seconds: m.heldMs != null ? (m.heldMs / 1000).toFixed(0) : '',
      metadata_json: m,
    };
  });

// --- posts.csv: one row per post, with outcome metrics + organizer survey ---
const postCols = [
  'post_id', 'organizer_id', 'food', 'building', 'room', 'tags', 'has_photo', 'from_reminder',
  'served_at_et', 'posted_at_et', 'closed_at_et', 'post_time_ms', 'minutes_served_to_posted', 'minutes_live',
  'plates_start', 'plates_left_at_close', 'claims_total', 'claims_released', 'claims_expired', 'pickups',
  'plates_thrown_out', 'plates_saved', 'status', 'close_reason', 'organizer_left_in_room',
  'students_in_range', 'alerts_sent', 'alerts_opened',
  'survey_posting_vs_groupme', 'survey_reminder_helped', 'survey_cleanup_attention',
];
const postRows = posts
  .filter((p) => keep(p.createdAt))
  .sort((a, b) => (ms(a.createdAt) ?? 0) - (ms(b.createdAt) ?? 0))
  .map((p) => {
    const cs = claimsByPost.get(p.id) ?? [];
    const sv = surveyByPost.get(p.id)?.answers ?? {};
    return {
      post_id: p.id,
      organizer_id: p.organizerId,
      food: p.food,
      building: p.building,
      room: p.room,
      tags: p.tags,
      has_photo: Boolean(p.photoUrl || p.hasPhoto),
      from_reminder: Boolean(p.scheduleId),
      served_at_et: local(p.servedAt),
      posted_at_et: local(p.createdAt),
      closed_at_et: local(p.closedAt),
      post_time_ms: p.postTimeMs,
      minutes_served_to_posted: mins(p.servedAt, p.createdAt),
      minutes_live: mins(p.createdAt, p.closedAt),
      plates_start: p.platesStart,
      plates_left_at_close: p.status === 'closed' ? p.platesLeft : '',
      claims_total: cs.length,
      claims_released: cs.filter((c) => c.status === 'released').length,
      claims_expired: cs.filter((c) => c.status === 'expired').length,
      pickups: p.pickups ?? cs.filter((c) => c.status === 'picked_up').length,
      plates_thrown_out: p.platesThrownOut,
      plates_saved: p.pickups ?? 0,
      status: p.status,
      close_reason: p.closeReason,
      organizer_left_in_room: Boolean(p.organizerLeft),
      students_in_range: p.studentsInRange,
      alerts_sent: alertsSent.get(p.id) ?? 0,
      alerts_opened: alertsOpened.get(p.id) ?? 0,
      survey_posting_vs_groupme: sv.posting_vs_groupme,
      survey_reminder_helped: sv.reminder_helped,
      survey_cleanup_attention: sv.cleanup_attention,
    };
  });

// --- claims.csv: one row per claim, with student survey ---------------------
const claimCols = ['claim_id', 'post_id', 'student_id', 'building', 'status', 'created_at_et', 'resolved_at_et', 'held_minutes', 'resolved_by', 'survey_food_was_there', 'survey_worth_the_walk', 'survey_keep_alerts_on'];
const claimRows = claims
  .filter((c) => keep(c.createdAt))
  .sort((a, b) => (ms(a.createdAt) ?? 0) - (ms(b.createdAt) ?? 0))
  .map((c) => {
    const sv = surveyByClaim.get(c.id)?.answers ?? {};
    return {
      claim_id: c.id,
      post_id: c.postId,
      student_id: c.studentId,
      building: c.building,
      status: c.status,
      created_at_et: local(c.createdAt),
      resolved_at_et: local(c.resolvedAt),
      held_minutes: mins(c.createdAt, c.resolvedAt),
      resolved_by: c.resolvedBy,
      survey_food_was_there: sv.food_was_there,
      survey_worth_the_walk: sv.worth_the_walk,
      survey_keep_alerts_on: sv.keep_alerts_on,
    };
  });

// --- surveys.csv: raw answers ------------------------------------------------
const surveyCols = ['survey_id', 'role', 'user_id', 'post_id', 'claim_id', 'outcome', 'submitted_at_et', 'plates_thrown_out', 'posting_vs_groupme', 'reminder_helped', 'cleanup_attention', 'food_was_there', 'worth_the_walk', 'keep_alerts_on'];
const surveyRows = surveys
  .filter((s) => keep(s.createdAt))
  .map((s) => ({ survey_id: s.id, role: s.role, user_id: s.userId, post_id: s.postId, claim_id: s.claimId, outcome: s.outcome, submitted_at_et: local(s.createdAt), ...(s.answers ?? {}) }));

const outDir = join(root, 'exports', new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19));
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'events.csv'), toCsv(eventCols, eventRows));
writeFileSync(join(outDir, 'posts.csv'), toCsv(postCols, postRows));
writeFileSync(join(outDir, 'claims.csv'), toCsv(claimCols, claimRows));
writeFileSync(join(outDir, 'surveys.csv'), toCsv(surveyCols, surveyRows));
console.log(`Wrote ${eventRows.length} events, ${postRows.length} posts, ${claimRows.length} claims, ${surveyRows.length} surveys to ${outDir}`);
