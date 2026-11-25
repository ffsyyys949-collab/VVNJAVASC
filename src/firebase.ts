import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  initializeFirestore,
  collection,
  doc,
  setDoc as firestoreSetDoc,
  getDoc,
  getDocs,
  addDoc as firestoreAddDoc,
  deleteDoc,
  onSnapshot as firestoreOnSnapshot,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  updateDoc as firestoreUpdateDoc,
  getDocFromServer,
  getDocsFromServer,
  arrayUnion,
  arrayRemove,
  increment,
  Firestore
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo?: {
    userId?: string;
    email?: string | null;
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): void {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path,
  };
  console.warn('Firestore Notice:', JSON.stringify(errInfo));
}

let appInstance: FirebaseApp | null = null;
let dbInstance: Firestore | null = null;

try {
  if (firebaseConfig && firebaseConfig.projectId && firebaseConfig.apiKey) {
    appInstance = !getApps().length ? initializeApp(firebaseConfig) : getApp();
    try {
      dbInstance = firebaseConfig.firestoreDatabaseId
        ? initializeFirestore(
            appInstance,
            { experimentalAutoDetectLongPolling: true },
            firebaseConfig.firestoreDatabaseId
          )
        : initializeFirestore(appInstance, { experimentalAutoDetectLongPolling: true });
    } catch {
      dbInstance = firebaseConfig.firestoreDatabaseId
        ? getFirestore(appInstance, firebaseConfig.firestoreDatabaseId)
        : getFirestore(appInstance);
    }
  }
} catch (err) {
  console.warn('Firebase initialization notice:', err);
  dbInstance = null;
}

export const app = appInstance as FirebaseApp;
export const db = dbInstance as unknown as Firestore;

let connectionTested = false;
let firestoreReachable = true;

export function isFirestoreOnline(): boolean {
  if (!dbInstance) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  return firestoreReachable;
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    firestoreReachable = true;
  });
  window.addEventListener('offline', () => {
    firestoreReachable = false;
  });
}

export async function testConnection(): Promise<boolean> {
  if (!dbInstance) {
    firestoreReachable = false;
    return false;
  }
  if (connectionTested) return firestoreReachable;
  connectionTested = true;
  try {
    await getDocFromServer(doc(dbInstance, 'test', 'connection'));
    firestoreReachable = true;
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      firestoreReachable = false;
      console.warn('Firebase client is currently offline or unreachable.');
      return false;
    }
    firestoreReachable = true;
    return true;
  }
}

if (typeof window !== 'undefined' && dbInstance) {
  setTimeout(() => {
    testConnection().catch(() => {});
  }, 500);
}

export const onSnapshot: typeof firestoreOnSnapshot = ((...args: any[]) => {
  const ref = args[0];
  const path =
    (typeof ref?.path === 'string' && ref.path) ||
    (typeof ref?._query?.path?.canonicalString === 'function' && ref._query.path.canonicalString()) ||
    null;
  const fallbackError = (err: unknown) => {
    handleFirestoreError(err, OperationType.GET, path);
  };

  if (args.length >= 2) {
    const second = args[1];
    if (
      typeof second === 'object' &&
      second !== null &&
      ('next' in second || 'error' in second || 'complete' in second)
    ) {
      if (typeof second.error !== 'function') {
        args[1] = { ...second, error: fallbackError };
      }
      return (firestoreOnSnapshot as any)(...args);
    }
    if (typeof second === 'function') {
      if (typeof args[2] !== 'function') {
        args[2] = fallbackError;
      }
      return (firestoreOnSnapshot as any)(...args);
    }
    const third = args[2];
    if (
      typeof third === 'object' &&
      third !== null &&
      ('next' in third || 'error' in third || 'complete' in third)
    ) {
      if (typeof third.error !== 'function') {
        args[2] = { ...third, error: fallbackError };
      }
      return (firestoreOnSnapshot as any)(...args);
    }
    if (typeof third === 'function') {
      if (typeof args[3] !== 'function') {
        args[3] = fallbackError;
      }
      return (firestoreOnSnapshot as any)(...args);
    }
  }

  return (firestoreOnSnapshot as any)(...args);
}) as typeof firestoreOnSnapshot;

function isPlainObject(val: unknown): val is Record<string, unknown> {
  if (!val || typeof val !== 'object') return false;
  const proto = Object.getPrototypeOf(val);
  return proto === Object.prototype || proto === null;
}

export function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => stripUndefinedDeep(item)) as unknown as T;
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) {
        out[k] = stripUndefinedDeep(v);
      }
    }
    return out as T;
  }
  return value;
}

export const setDoc: typeof firestoreSetDoc = ((ref: any, data: any, options?: any) => {
  const cleanData = stripUndefinedDeep(data);
  return options !== undefined
    ? (firestoreSetDoc as any)(ref, cleanData, options)
    : (firestoreSetDoc as any)(ref, cleanData);
}) as typeof firestoreSetDoc;

export const addDoc: typeof firestoreAddDoc = ((ref: any, data: any) => {
  return (firestoreAddDoc as any)(ref, stripUndefinedDeep(data));
}) as typeof firestoreAddDoc;

export const updateDoc: typeof firestoreUpdateDoc = ((ref: any, ...rest: any[]) => {
  if (rest.length === 1 && isPlainObject(rest[0])) {
    return (firestoreUpdateDoc as any)(ref, stripUndefinedDeep(rest[0]));
  }
  return (firestoreUpdateDoc as any)(ref, ...rest);
}) as typeof firestoreUpdateDoc;

export {
  collection,
  doc,
  getDoc,
  getDocs,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  getDocFromServer,
  getDocsFromServer,
  arrayUnion,
  arrayRemove,
  increment
};
