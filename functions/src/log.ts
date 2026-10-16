import { FieldValue, getFirestore, type WriteBatch } from 'firebase-admin/firestore';

export type EventRow = {
  type: string;
  postId?: string | null;
  userId?: string | null;
  metadata?: Record<string, unknown>;
};

function row(e: EventRow) {
  return {
    type: e.type,
    postId: e.postId ?? null,
    userId: e.userId ?? null,
    timestamp: FieldValue.serverTimestamp(),
    source: 'server',
    metadata: e.metadata ?? {},
  };
}

export function logEventIn(batch: WriteBatch, e: EventRow) {
  batch.set(getFirestore().collection('events').doc(), row(e));
}

export async function logEvents(rows: EventRow[]) {
  const db = getFirestore();
  for (let i = 0; i < rows.length; i += 450) {
    const batch = db.batch();
    rows.slice(i, i + 450).forEach((e) => logEventIn(batch, e));
    await batch.commit();
  }
}
