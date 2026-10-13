import type { Timestamp } from 'firebase/firestore';

export type Role = 'organizer' | 'student';

export type UserProfile = {
  role: Role;
  buildings: string[];
  pushToken: string | null;
  alertsEnabled?: boolean;
  email?: string | null;
  createdAt?: Timestamp;
};

export type PostStatus = 'active' | 'closed';
export type CloseReason = 'food_gone' | 'no_plates_left' | 'food_safety_4h';

export type Post = {
  id: string;
  organizerId: string;
  food: string;
  building: string;
  room: string;
  photoUrl: string | null;
  platesStart: number;
  platesLeft: number;
  activeClaims: number;
  pickups: number;
  servedAt: Timestamp;
  expiresAt: Timestamp;
  tags: string[];
  status: PostStatus;
  createdAt: Timestamp | null;
  closedAt: Timestamp | null;
  closeReason: CloseReason | null;
  organizerLeft?: boolean;
  platesThrownOut?: number | null;
  postTimeMs?: number;
  scheduleId?: string | null;
};

export type ClaimStatus = 'active' | 'released' | 'expired' | 'picked_up';

export type Claim = {
  id: string;
  postId: string;
  studentId: string;
  status: ClaimStatus;
  createdAt: Timestamp;
  expiresAt: Timestamp;
  resolvedAt: Timestamp | null;
};

export const CLAIM_HOLD_MS = 8 * 60 * 1000;
export const POST_TTL_MS = 4 * 60 * 60 * 1000;
export const REMINDER_LEAD_MS = 10 * 60 * 1000;
