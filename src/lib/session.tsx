import AsyncStorage from '@react-native-async-storage/async-storage';
import { onAuthStateChanged, signInAnonymously, signOut, type User } from 'firebase/auth';
import { doc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { auth, db } from './firebase';
import type { Role, UserProfile } from './types';

const ROLE_KEY = 'plateful.role';
export const GT_EMAIL = /^[^@\s]+@gatech\.edu$/i;

type Session = {
  ready: boolean;
  role: Role | null;
  user: User | null;
  profile: UserProfile | null;
  /** True once the organizer's account is a verified @gatech.edu address. */
  organizerReady: boolean;
  chooseRole: (role: Role) => Promise<void>;
  /** Back to the role picker (signs out). */
  resetRole: () => Promise<void>;
  updateProfile: (patch: Partial<UserProfile>) => Promise<void>;
  ensureOrganizerProfile: () => Promise<void>;
};

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role | null>(null);
  const [roleLoaded, setRoleLoaded] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [authLoaded, setAuthLoaded] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(ROLE_KEY)
      .then((r) => setRole(r === 'organizer' || r === 'student' ? r : null))
      .finally(() => setRoleLoaded(true));
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoaded(true);
    });
  }, []);

  useEffect(() => {
    setProfile(null);
    if (!user) {
      setProfileLoaded(true);
      return;
    }
    setProfileLoaded(false);
    return onSnapshot(
      doc(db, 'users', user.uid),
      (snap) => {
        setProfile(snap.exists() ? (snap.data() as UserProfile) : null);
        setProfileLoaded(true);
      },
      () => setProfileLoaded(true),
    );
  }, [user]);

  // A student is an anonymous account with a profile doc; create both on demand.
  useEffect(() => {
    if (role !== 'student' || !authLoaded) return;
    if (!user) {
      signInAnonymously(auth).catch((e) => console.warn('[plateful] anonymous sign-in failed', e?.message));
      return;
    }
    if (profileLoaded && !profile && user.isAnonymous) {
      setDoc(doc(db, 'users', user.uid), {
        role: 'student',
        buildings: [],
        pushToken: null,
        alertsEnabled: true,
        createdAt: serverTimestamp(),
      }).catch((e) => console.warn('[plateful] student profile create failed', e?.message));
    }
  }, [role, authLoaded, user, profileLoaded, profile]);

  const chooseRole = useCallback(
    async (next: Role) => {
      await AsyncStorage.setItem(ROLE_KEY, next);
      const u = auth.currentUser;
      // Students are anonymous, organizers are not; never reuse an account across roles.
      if (u && (next === 'student') !== u.isAnonymous) await signOut(auth);
      setRole(next);
    },
    [],
  );

  const resetRole = useCallback(async () => {
    await AsyncStorage.removeItem(ROLE_KEY);
    setRole(null);
    await signOut(auth);
  }, []);

  const updateProfile = useCallback(async (patch: Partial<UserProfile>) => {
    const u = auth.currentUser;
    if (!u) return;
    await updateDoc(doc(db, 'users', u.uid), patch as Record<string, unknown>);
  }, []);

  const ensureOrganizerProfile = useCallback(async () => {
    const u = auth.currentUser;
    if (!u || u.isAnonymous) return;
    await setDoc(
      doc(db, 'users', u.uid),
      { role: 'organizer', email: u.email, buildings: [], pushToken: null, createdAt: serverTimestamp() },
      { merge: true },
    );
  }, []);

  const organizerReady = Boolean(
    user && !user.isAnonymous && user.emailVerified && GT_EMAIL.test(user.email ?? '') && profile?.role === 'organizer',
  );

  const value = useMemo<Session>(
    () => ({
      ready: roleLoaded && authLoaded && profileLoaded,
      role,
      user,
      profile,
      organizerReady,
      chooseRole,
      resetRole,
      updateProfile,
      ensureOrganizerProfile,
    }),
    [roleLoaded, authLoaded, profileLoaded, role, user, profile, organizerReady, chooseRole, resetRole, updateProfile, ensureOrganizerProfile],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSession outside SessionProvider');
  return s;
}
