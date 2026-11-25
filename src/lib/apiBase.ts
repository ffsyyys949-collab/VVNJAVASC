import { db, doc, getDoc, onSnapshot, setDoc, isFirestoreOnline } from '../firebase';

const STORAGE_PUBLIC_API_URL = 'ze_public_api_url';
const STORAGE_AUTH_TOKEN = 'ze_auth_token';
const STORAGE_REFRESH_TOKEN = 'ze_refresh_token';
export const DEFAULT_PREVIEW_API_BASE = 'https://ais-pre-ebvyf6o4gl4up24k6ttbz4-994284845506.asia-southeast1.run.app';

let cachedFirestorePublicUrl = '';
let configWatcherStarted = false;

export function isDisallowedLocalHost(hostname: string): boolean {
  const h = String(hostname || '').trim().toLowerCase();
  return (
    !h ||
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === '0.0.0.0' ||
    h === '10.0.2.2' ||
    h.startsWith('192.168.') ||
    h.startsWith('10.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h)
  );
}

export function isValidHttpUrl(value: string): boolean {
  const trimmed = String(value || '').trim();
  if (!trimmed) return false;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== 'https:') return false;
    if (isDisallowedLocalHost(u.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

export function isAiStudioAuthProtectedUrl(_url: string): boolean {
  return false;
}

export function isNativeApkEnv(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.location.hostname === 'appassets.androidplatform.net' ||
    Boolean((window as any).AndroidInterface) ||
    Boolean((window as any).ZeNative)
  );
}

function isUsableToken(tok: string): boolean {
  const clean = String(tok || '').trim();
  if (!clean) return false;
  if (clean === 'ze-owner-firestore-session' || clean.startsWith('ze_owner_apk_')) {
    return false;
  }
  return clean.startsWith('ze_tok_') || clean.startsWith('ze_owner_');
}

function isUsableRefreshToken(tok: string): boolean {
  const clean = String(tok || '').trim();
  return clean.startsWith('ze_ref_') && clean.includes('.');
}

export function getStoredRefreshToken(): string {
  try {
    const lsRef = localStorage.getItem(STORAGE_REFRESH_TOKEN) || '';
    if (isUsableRefreshToken(lsRef)) return lsRef.trim();
    const ssRef = sessionStorage.getItem(STORAGE_REFRESH_TOKEN) || '';
    if (isUsableRefreshToken(ssRef)) {
      try {
        localStorage.setItem(STORAGE_REFRESH_TOKEN, ssRef.trim());
      } catch {}
      return ssRef.trim();
    }
  } catch {}
  return '';
}

export function setStoredRefreshToken(refreshToken: string): void {
  const clean = String(refreshToken || '').trim();
  try {
    if (clean && isUsableRefreshToken(clean)) {
      localStorage.setItem(STORAGE_REFRESH_TOKEN, clean);
      sessionStorage.setItem(STORAGE_REFRESH_TOKEN, clean);
    } else if (!clean) {
      localStorage.removeItem(STORAGE_REFRESH_TOKEN);
      sessionStorage.removeItem(STORAGE_REFRESH_TOKEN);
    }
  } catch {}
}

export function getStoredAuthToken(): string {
  try {
    const lsToken = localStorage.getItem(STORAGE_AUTH_TOKEN) || '';
    const lsOwner = localStorage.getItem('ze_owner_token') || '';
    const ssToken = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(STORAGE_AUTH_TOKEN) || '' : '';
    if (isUsableToken(lsToken)) {
      return lsToken.trim();
    }
    if (isUsableToken(ssToken)) {
      try {
        localStorage.setItem(STORAGE_AUTH_TOKEN, ssToken.trim());
      } catch {}
      return ssToken.trim();
    }
    if (isUsableToken(lsOwner)) {
      try {
        localStorage.setItem(STORAGE_AUTH_TOKEN, lsOwner.trim());
        sessionStorage.setItem(STORAGE_AUTH_TOKEN, lsOwner.trim());
      } catch {}
      return lsOwner.trim();
    }
    const nativeBridge = typeof window !== 'undefined' ? (window as any).ZeNative : null;
    if (typeof nativeBridge?.getAuthToken === 'function') {
      const nativeToken = String(nativeBridge.getAuthToken() || '').trim();
      if (isUsableToken(nativeToken)) {
        try {
          localStorage.setItem(STORAGE_AUTH_TOKEN, nativeToken);
          sessionStorage.setItem(STORAGE_AUTH_TOKEN, nativeToken);
        } catch {}
        return nativeToken;
      }
    }
  } catch {}
  return '';
}

export function setStoredAuthToken(token: string): void {
  const clean = String(token || '').trim();
  try {
    if (clean && isUsableToken(clean)) {
      localStorage.setItem(STORAGE_AUTH_TOKEN, clean);
      sessionStorage.setItem(STORAGE_AUTH_TOKEN, clean);
      const nativeBridge = typeof window !== 'undefined' ? (window as any).ZeNative : null;
      if (typeof nativeBridge?.saveAuthSession === 'function') {
        const uJson = getStoredUserJson();
        if (uJson) nativeBridge.saveAuthSession(clean, uJson);
      }
    } else if (!clean) {
      localStorage.removeItem(STORAGE_AUTH_TOKEN);
      sessionStorage.removeItem(STORAGE_AUTH_TOKEN);
    }
  } catch {}
}

export function getStoredUserJson(): string {
  try {
    const lsUser = localStorage.getItem('zeio-user');
    if (lsUser && lsUser.trim().startsWith('{')) return lsUser;
    const nativeBridge = typeof window !== 'undefined' ? (window as any).ZeNative : null;
    if (typeof nativeBridge?.getSavedUserJson === 'function') {
      const nativeUser = String(nativeBridge.getSavedUserJson() || '').trim();
      if (nativeUser && nativeUser.startsWith('{')) {
        try {
          localStorage.setItem('zeio-user', nativeUser);
          localStorage.setItem('ze_user', nativeUser);
          localStorage.setItem('vn_currentUser', nativeUser);
        } catch {}
        return nativeUser;
      }
    }
  } catch {}
  return '';
}

export function setStoredAuthSession(
  token: string | undefined | null,
  user: any,
  refreshToken?: string | null
): void {
  try {
    const cleanToken = String(token || '').trim() || getStoredAuthToken();
    const cleanRefresh = String(refreshToken || '').trim() || getStoredRefreshToken();
    const userJson = typeof user === 'string' ? user : JSON.stringify(user || {});
    if (cleanToken && isUsableToken(cleanToken)) {
      localStorage.setItem(STORAGE_AUTH_TOKEN, cleanToken);
      sessionStorage.setItem(STORAGE_AUTH_TOKEN, cleanToken);
    }
    if (cleanRefresh && isUsableRefreshToken(cleanRefresh)) {
      localStorage.setItem(STORAGE_REFRESH_TOKEN, cleanRefresh);
      sessionStorage.setItem(STORAGE_REFRESH_TOKEN, cleanRefresh);
    }
    if (userJson && userJson !== '{}') {
      localStorage.setItem('zeio-user', userJson);
      localStorage.setItem('ze_user', userJson);
      localStorage.setItem('vn_currentUser', userJson);
      localStorage.setItem('vn_session', userJson);
    }
    const nativeBridge = typeof window !== 'undefined' ? (window as any).ZeNative : null;
    if (typeof nativeBridge?.saveAuthSession === 'function') {
      nativeBridge.saveAuthSession(cleanToken, userJson);
    }
    if (user?.id && typeof nativeBridge?.setUserSession === 'function') {
      nativeBridge.setUserSession(String(user.id), String(user.name || user.username || 'User'), getApiBaseUrl());
    }
  } catch {}
}

export function clearStoredAuthSession(): void {
  try {
    localStorage.removeItem(STORAGE_AUTH_TOKEN);
    sessionStorage.removeItem(STORAGE_AUTH_TOKEN);
    localStorage.removeItem(STORAGE_REFRESH_TOKEN);
    sessionStorage.removeItem(STORAGE_REFRESH_TOKEN);
    localStorage.removeItem('ze_owner_token');
    localStorage.removeItem('zeio-user');
    localStorage.removeItem('ze_user');
    localStorage.removeItem('vn_currentUser');
    localStorage.removeItem('vn_session');
    const nativeBridge = typeof window !== 'undefined' ? (window as any).ZeNative : null;
    if (typeof nativeBridge?.clearAuthSession === 'function') {
      nativeBridge.clearAuthSession();
    }
  } catch {}
}

export function getStoredActorId(): string {
  try {
    const raw = getStoredUserJson();
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.id) return String(parsed.id).trim();
    }
    const id = localStorage.getItem('ze_id') || '';
    if (id) return id.trim();
  } catch {}
  return '';
}

export function buildAuthHeaders(extraHeaders?: HeadersInit): Headers {
  const headers = new Headers(extraHeaders || {});
  const token = getStoredAuthToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const actorId = getStoredActorId();
  if (actorId && !headers.has('x-ze-actor-id')) {
    headers.set('x-ze-actor-id', actorId);
  }
  return headers;
}

export function getSavedPublicApiUrl(): string {
  try {
    const saved = localStorage.getItem(STORAGE_PUBLIC_API_URL) || '';
    if (saved && isValidHttpUrl(saved)) {
      return saved.replace(/\/+$/, '');
    }
  } catch {}
  if (cachedFirestorePublicUrl && isValidHttpUrl(cachedFirestorePublicUrl)) {
    return cachedFirestorePublicUrl.replace(/\/+$/, '');
  }
  return '';
}

export function setSavedPublicApiUrl(url: string): void {
  const clean = String(url || '').trim().replace(/\/+$/, '');
  try {
    if (clean && isValidHttpUrl(clean)) {
      localStorage.setItem(STORAGE_PUBLIC_API_URL, clean);
      cachedFirestorePublicUrl = clean;
    } else if (!clean) {
      localStorage.removeItem(STORAGE_PUBLIC_API_URL);
      cachedFirestorePublicUrl = '';
    }
  } catch {}
}

export function getApiBaseUrl(): string {
  const customPublic = getSavedPublicApiUrl();
  if (customPublic) return customPublic;

  if (typeof window !== 'undefined') {
    const nativeBridge = (window as any).ZeNative;
    const nativeBase =
      typeof nativeBridge?.getApiBaseUrl === 'function' ? String(nativeBridge.getApiBaseUrl() || '').trim() : '';
    if (nativeBase && isValidHttpUrl(nativeBase)) {
      return nativeBase.replace(/\/+$/, '');
    }
    if (
      window.location.hostname !== 'appassets.androidplatform.net' &&
      window.location.protocol === 'https:' &&
      !isDisallowedLocalHost(window.location.hostname)
    ) {
      return window.location.origin.replace(/\/+$/, '');
    }
    if (
      window.location.hostname !== 'appassets.androidplatform.net' &&
      !isNativeApkEnv()
    ) {
      return window.location.origin.replace(/\/+$/, '');
    }
  }
  return DEFAULT_PREVIEW_API_BASE;
}

export function hasReachablePublicAiServer(): boolean {
  const base = getApiBaseUrl();
  return Boolean(base) && isValidHttpUrl(base);
}

export function startServerUrlSync(): void {
  if (configWatcherStarted || !isFirestoreOnline() || !db) return;
  configWatcherStarted = true;
  try {
    const ref = doc(db, 'ze_config', 'server');
    onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as { publicApiUrl?: string };
          const url = String(data?.publicApiUrl || '').trim().replace(/\/+$/, '');
          if (url && isValidHttpUrl(url)) {
            cachedFirestorePublicUrl = url;
            try {
              localStorage.setItem(STORAGE_PUBLIC_API_URL, url);
            } catch {}
          } else if (data && 'publicApiUrl' in data && !url) {
            cachedFirestorePublicUrl = '';
            try {
              localStorage.removeItem(STORAGE_PUBLIC_API_URL);
            } catch {}
          }
        }
      },
      () => {
        // Non-fatal offline tolerance
      }
    );
  } catch {}
}

export async function fetchServerUrlFromFirestore(): Promise<string> {
  if (!isFirestoreOnline() || !db) return getSavedPublicApiUrl();
  try {
    const snap = await getDoc(doc(db, 'ze_config', 'server'));
    if (snap.exists()) {
      const url = String((snap.data() as any)?.publicApiUrl || '').trim().replace(/\/+$/, '');
      if (url && isValidHttpUrl(url)) {
        setSavedPublicApiUrl(url);
        return url;
      }
    }
  } catch {}
  return getSavedPublicApiUrl();
}

export async function savePublicApiUrlToFirestore(url: string): Promise<{ ok: boolean; error?: string }> {
  const clean = String(url || '').trim().replace(/\/+$/, '');
  if (clean && !isValidHttpUrl(clean)) {
    return { ok: false, error: 'URL harus diawali https:// atau http://' };
  }
  setSavedPublicApiUrl(clean);
  if (!isFirestoreOnline() || !db) {
    return { ok: true };
  }
  try {
    await setDoc(
      doc(db, 'ze_config', 'server'),
      { publicApiUrl: clean, updatedAt: Date.now() },
      { merge: true }
    );
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Gagal menyimpan URL ke Firestore' };
  }
}

export interface SafeJsonResult<T = any> {
  ok: boolean;
  status: number;
  isHtmlAuthBridge: boolean;
  data: T | null;
  error?: string;
}

export async function safeFetchJson<T = any>(
  input: string,
  init?: RequestInit
): Promise<SafeJsonResult<T>> {
  try {
    const res = await fetch(input, init);
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    if (contentType.includes('text/html')) {
      return {
        ok: false,
        status: res.status || 401,
        isHtmlAuthBridge: true,
        data: null,
        error: 'Server preview memerlukan autentikasi atau URL publik belum dikonfigurasi.',
      };
    }
    const text = await res.text();
    const trimmed = text.trim();
    if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html') || trimmed.startsWith('<HTML')) {
      return {
        ok: false,
        status: res.status || 401,
        isHtmlAuthBridge: true,
        data: null,
        error: 'Respons HTML diterima (Server AI Studio Auth Bridge / Offline).',
      };
    }
    if (!trimmed) {
      return { ok: res.ok, status: res.status, isHtmlAuthBridge: false, data: null };
    }
    try {
      const parsed = JSON.parse(trimmed) as T;
      return { ok: res.ok, status: res.status, isHtmlAuthBridge: false, data: parsed };
    } catch {
      return {
        ok: false,
        status: res.status,
        isHtmlAuthBridge: false,
        data: null,
        error: 'Format respons server bukan JSON yang valid.',
      };
    }
  } catch (err: any) {
    return {
      ok: false,
      status: 0,
      isHtmlAuthBridge: false,
      data: null,
      error: err?.message || 'Gagal menghubungi server',
    };
  }
}

// IndexedDB local media store for videos / large blobs (>850KB) that exceed Firestore 1MB document limit
const MEDIA_DB_NAME = 'ze_local_media_v1';
const MEDIA_STORE_NAME = 'media_blobs';

function openLocalMediaDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(MEDIA_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const database = req.result;
      if (!database.objectStoreNames.contains(MEDIA_STORE_NAME)) {
        database.createObjectStore(MEDIA_STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB open error'));
  });
}

export async function saveLocalMediaBlob(key: string, dataUrl: string): Promise<boolean> {
  if (!key || !dataUrl) return false;
  try {
    const database = await openLocalMediaDb();
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction(MEDIA_STORE_NAME, 'readwrite');
      tx.objectStore(MEDIA_STORE_NAME).put(dataUrl, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    database.close();
    return true;
  } catch {
    return false;
  }
}

export async function getLocalMediaBlob(key: string): Promise<string | null> {
  if (!key) return null;
  try {
    const database = await openLocalMediaDb();
    const result = await new Promise<string | null>((resolve, reject) => {
      const tx = database.transaction(MEDIA_STORE_NAME, 'readonly');
      const req = tx.objectStore(MEDIA_STORE_NAME).get(key);
      req.onsuccess = () => resolve(typeof req.result === 'string' ? req.result : null);
      req.onerror = () => reject(req.error);
    });
    database.close();
    return result;
  } catch {
    return null;
  }
}

export async function deleteLocalMediaBlob(key: string): Promise<void> {
  if (!key) return;
  try {
    const database = await openLocalMediaDb();
    await new Promise<void>((resolve) => {
      const tx = database.transaction(MEDIA_STORE_NAME, 'readwrite');
      tx.objectStore(MEDIA_STORE_NAME).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    database.close();
  } catch {}
}
