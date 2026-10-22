// Shared setup for the storyboard demo scripts. Targets the local Firebase
// emulators (the app's .env points at them), never a real project.
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const PROJECT = process.env.GCLOUD_PROJECT || 'demo-plateful';
export const BUCKET = `${PROJECT}.appspot.com`;

process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
process.env.FIREBASE_STORAGE_EMULATOR_HOST ||= '127.0.0.1:9199';

const require = createRequire(join(ROOT, 'functions', 'package.json'));
const { initializeApp } = require('firebase-admin/app');
initializeApp({ projectId: PROJECT, storageBucket: BUCKET });

export const { getFirestore, Timestamp, FieldValue } = require('firebase-admin/firestore');
export const { getAuth } = require('firebase-admin/auth');
export const { getStorage } = require('firebase-admin/storage');
export const PREFIX = 'demo_';
