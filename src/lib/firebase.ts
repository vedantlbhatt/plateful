import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  connectAuthEmulator,
  getAuth,
  getReactNativePersistence,
  initializeAuth,
  type Auth,
} from 'firebase/auth';
import { connectFirestoreEmulator, initializeFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';
import { connectStorageEmulator, getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

export const firebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

const firstInit = getApps().length === 0;
export const app = firstInit ? initializeApp(firebaseConfig) : getApp();

// initializeAuth may only run once per app; Fast Refresh re-evaluates this module.
let authInstance: Auth;
try {
  authInstance = initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
} catch {
  authInstance = getAuth(app);
}
export const auth = authInstance;

// Long polling: RN's WebSocket/fetch streaming is unreliable for Firestore's default transport.
export const db = initializeFirestore(app, { experimentalForceLongPolling: true });
export const storage = getStorage(app);
export const functions = getFunctions(app, process.env.EXPO_PUBLIC_FUNCTIONS_REGION || 'us-east1');

const emulatorHost = process.env.EXPO_PUBLIC_EMULATOR_HOST;
if (emulatorHost && firstInit) {
  connectAuthEmulator(auth, `http://${emulatorHost}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, emulatorHost, 8080);
  connectFunctionsEmulator(functions, emulatorHost, 5001);
  connectStorageEmulator(storage, emulatorHost, 9199);
}
