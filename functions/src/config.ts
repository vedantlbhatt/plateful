import data from './buildings.json';

export const REGION = 'us-east1';
export const CLAIM_HOLD_MS = 8 * 60 * 1000;
export const POST_TTL_MS = 4 * 60 * 60 * 1000;
export const REMINDER_LEAD_MS = 10 * 60 * 1000;

const names = new Map(data.buildings.map((b) => [b.id, b.name]));
const adjacency = new Map<string, Set<string>>();
for (const [a, list] of Object.entries(data.adjacency as Record<string, string[]>)) {
  for (const b of list) {
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    if (!adjacency.has(b)) adjacency.set(b, new Set());
    adjacency.get(a)!.add(b);
    adjacency.get(b)!.add(a);
  }
}

export function buildingName(id: string): string {
  return names.get(id) ?? id;
}

/** A post in `building` alerts students who picked it or any building adjacent to it. */
export function alertBuildings(building: string): string[] {
  return [building, ...(adjacency.get(building) ?? [])];
}

const TAG_LABELS: Record<string, string> = {
  vegetarian: 'Vegetarian',
  vegan: 'Vegan',
  halal: 'Halal',
  nuts: 'Contains nuts',
};

/** "[Food], [Building room], [N] plates left, [tags]" */
export function alertBody(post: {
  food?: string;
  building: string;
  room?: string;
  platesLeft: number;
  tags?: string[];
}): string {
  const where = [buildingName(post.building), post.room].filter(Boolean).join(' ');
  const plates = `${post.platesLeft} ${post.platesLeft === 1 ? 'plate' : 'plates'} left`;
  const parts = [post.food?.trim() || 'Free food', where, plates];
  const tags = (post.tags ?? []).map((t) => TAG_LABELS[t] ?? t);
  if (tags.length) parts.push(tags.join(', '));
  return parts.join(', ');
}
