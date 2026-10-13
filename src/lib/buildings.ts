import data from '../../config/buildings.json';

export type Building = { id: string; name: string };

export const BUILDINGS: Building[] = data.buildings;

const byId = new Map(BUILDINGS.map((b) => [b.id, b]));

const adjacency = new Map<string, Set<string>>();
for (const [a, list] of Object.entries(data.adjacency as Record<string, string[]>)) {
  for (const b of list) {
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    if (!adjacency.has(b)) adjacency.set(b, new Set());
    adjacency.get(a)!.add(b);
    adjacency.get(b)!.add(a);
  }
}

export function buildingName(id: string | undefined | null): string {
  return (id && byId.get(id)?.name) || id || 'Unknown building';
}

/** The picked buildings plus every building adjacent to one of them. */
export function inRangeBuildings(picked: string[]): Set<string> {
  const out = new Set(picked);
  for (const id of picked) adjacency.get(id)?.forEach((n) => out.add(n));
  return out;
}

export const TAGS = [
  { id: 'vegetarian', label: 'Vegetarian' },
  { id: 'vegan', label: 'Vegan' },
  { id: 'halal', label: 'Halal' },
  { id: 'nuts', label: 'Contains nuts' },
] as const;

export function tagLabel(id: string): string {
  return TAGS.find((t) => t.id === id)?.label ?? id;
}

/** "[Food], [Building room], [N] plates left, [tags]" (same as functions/src/config.ts alertBody). */
export function alertText(p: { food?: string; building: string; room?: string; platesLeft: number; tags?: string[] }): string {
  const where = [buildingName(p.building), p.room].filter(Boolean).join(' ');
  const parts = [p.food?.trim() || 'Free food', where, `${p.platesLeft} ${p.platesLeft === 1 ? 'plate' : 'plates'} left`];
  if (p.tags?.length) parts.push(p.tags.map(tagLabel).join(', '));
  return parts.join(', ');
}

/** "Klaus 1116", or just "Klaus" when no room was given. */
export function placeLabel(building: string, room?: string | null): string {
  return [buildingName(building), room?.trim()].filter(Boolean).join(' ');
}
