import type { Post } from './types';

export function closeLabel(reason: Post['closeReason']) {
  switch (reason) {
    case 'food_gone':
      return 'food gone';
    case 'no_plates_left':
      return 'all plates claimed';
    case 'food_safety_4h':
      return 'closed at 4 hours (food safety)';
    default:
      return 'closed';
  }
}
