import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import { getMessaging, isSupported as isMessagingSupported, type Messaging } from 'firebase/messaging';
import type { Auth } from 'firebase/auth';

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
};

const app = getApps().length === 0 ? initializeApp(config) : getApps()[0];
const auth: Auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const functions = getFunctions(app);

// Lazy messaging reference – only initialized client-side when supported
let messagingInstance: Messaging | null = null;
let messagingInitPromise: Promise<Messaging | null> | null = null;

export async function getMessagingInstance(): Promise<Messaging | null> {
  if (messagingInstance) return messagingInstance;
  if (messagingInitPromise) return messagingInitPromise;
  messagingInitPromise = (async () => {
    try {
      if (typeof window === 'undefined') return null;
      const supported = await isMessagingSupported();
      if (!supported) return null;
      messagingInstance = getMessaging(app);
      return messagingInstance;
    } catch (e) {
      console.warn('Messaging not available:', e);
      return null;
    }
  })();
  return messagingInitPromise;
}

export function getFirebase() {
  return { app, auth, db, storage, functions };
}

export function callFunction<T = any>(name: string, data?: any) {
  return httpsCallable<any, T>(functions, name)(data);
}

export { auth, db, storage, functions };
