import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';

let auth: Auth | null = null;
let db: Firestore | null = null;

function init() {
  if (auth && db) return { auth, db };
  const { cert, getApps, initializeApp } = require('firebase-admin/app');
  const adminAuth = require('firebase-admin/auth');
  const adminDb = require('firebase-admin/firestore');

  let serviceAccount;
  try {
    serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
      ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
      : undefined;
  } catch (e) {
    console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY:', e);
    throw new Error('Invalid FIREBASE_SERVICE_ACCOUNT_KEY environment variable');
  }

  if (getApps().length === 0) {
    if (serviceAccount) {
      initializeApp({ credential: cert(serviceAccount) });
    } else {
      initializeApp();
    }
  }

  auth = adminAuth.getAuth();
  db = adminDb.getFirestore();
  if (!auth || !db) throw new Error('Firebase Admin init failed');
  return { auth, db };
}

export function getMessaging() {
  init();
  const adminMessaging = require('firebase-admin/messaging');
  return adminMessaging.getMessaging();
}

export default { get auth() { return init().auth!; }, get db() { return init().db!; } };
export { init as ensureFirebase };
