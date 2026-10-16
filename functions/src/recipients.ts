import { getFirestore } from 'firebase-admin/firestore';
import { alertBuildings } from './config';

export type Student = { uid: string; buildings: string[]; pushToken: string | null; createdAtMs: number };

/** Students with alerts on whose picked buildings include `building` or a neighbour of it. */
export async function studentsInRange(building: string): Promise<Student[]> {
  const snap = await getFirestore()
    .collection('users')
    .where('buildings', 'array-contains-any', alertBuildings(building).slice(0, 30))
    .get();
  return snap.docs
    .map((d) => ({ uid: d.id, ...d.data() }) as Record<string, any>)
    .filter((u) => u.role === 'student' && u.alertsEnabled !== false)
    .map((u) => ({
      uid: u.uid,
      buildings: u.buildings ?? [],
      pushToken: u.pushToken ?? null,
      createdAtMs: u.createdAt?.toMillis?.() ?? 0,
    }));
}

/**
 * "Next student" for a freed plate: in range, has not claimed this post, and has not
 * already been handed a release alert for it. Students who picked the post's own
 * building go before those who only picked a neighbour; ties go to whoever signed up first.
 */
export function pickNextStudent(
  candidates: Student[],
  building: string,
  exclude: Set<string>,
): Student | null {
  const eligible = candidates.filter((s) => s.pushToken && !exclude.has(s.uid));
  eligible.sort((a, b) => {
    const ea = a.buildings.includes(building) ? 0 : 1;
    const eb = b.buildings.includes(building) ? 0 : 1;
    return ea - eb || a.createdAtMs - b.createdAtMs;
  });
  return eligible[0] ?? null;
}
