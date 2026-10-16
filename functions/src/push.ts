import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

export type PushMessage = {
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  /** Used only to clear dead tokens; not sent to Expo. */
  uid?: string;
};

export type PushResult = { uid?: string; ok: boolean; error?: string; ticketId?: string };

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/** Sends through Expo's push service (chunks of 100). Clears tokens Expo reports as dead. */
export async function sendExpoPush(messages: PushMessage[]): Promise<PushResult[]> {
  const results: PushResult[] = [];
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    const body = chunk.map(({ uid: _uid, ...m }) => ({
      ...m,
      sound: 'default',
      priority: 'high',
      channelId: 'default',
    }));
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { data?: Array<{ status: string; id?: string; message?: string; details?: { error?: string } }> };
      const tickets = json.data ?? [];
      chunk.forEach((m, idx) => {
        const t = tickets[idx];
        if (t?.status === 'ok') {
          results.push({ uid: m.uid, ok: true, ticketId: t.id });
        } else {
          const error = t?.details?.error ?? t?.message ?? `http_${res.status}`;
          results.push({ uid: m.uid, ok: false, error });
          if (error === 'DeviceNotRegistered' && m.uid) {
            void getFirestore().doc(`users/${m.uid}`).update({ pushToken: null }).catch(() => {});
          }
        }
      });
    } catch (err) {
      logger.error('expo push failed', err);
      chunk.forEach((m) => results.push({ uid: m.uid, ok: false, error: String(err) }));
    }
  }
  return results;
}
