import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  type User,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

export const isFirebaseConfigured = () => Boolean(
  firebaseConfig.apiKey
  && firebaseConfig.authDomain
  && firebaseConfig.projectId
  && firebaseConfig.appId,
);

const getFirebaseApp = (): FirebaseApp | null => {
  if (typeof window === 'undefined' || !isFirebaseConfigured()) return null;
  return getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
};

export const getFirebaseClient = () => {
  const app = getFirebaseApp();
  if (!app) return null;
  return {
    app,
    auth: getAuth(app),
    db: getFirestore(app),
  };
};

export const ensureAnonymousUser = async (): Promise<User | null> => {
  const client = getFirebaseClient();
  if (!client) return null;
  if (client.auth.currentUser) return client.auth.currentUser;
  const credential = await signInAnonymously(client.auth);
  return credential.user;
};

export const subscribeAnonymousUser = (
  callback: (user: User | null) => void,
  onError?: (error: unknown) => void,
) => {
  const client = getFirebaseClient();
  if (!client) {
    callback(null);
    return () => undefined;
  }

  return onAuthStateChanged(client.auth, async (user) => {
    if (user) {
      callback(user);
      return;
    }

    try {
      const credential = await signInAnonymously(client.auth);
      callback(credential.user);
    } catch (error) {
      onError?.(error);
      callback(null);
    }
  }, onError);
};
