import {
  db,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  query,
  where,
  limit,
} from '../firebase.ts';
import {
  buildAuthHeaders,
  getApiBaseUrl,
  getStoredRefreshToken,
  getStoredUserJson,
  setStoredAuthSession,
  setStoredRefreshToken,
} from './apiBase.ts';

export function isApkWebView(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(
    (window as any).ZeNative ||
      (window as any).AndroidInterface ||
      window.location?.hostname === 'appassets.androidplatform.net' ||
      window.location?.protocol === 'capacitor:' ||
      window.location?.protocol === 'file:'
  );
}

export interface SafeFetchResult<T = any> {
  ok: boolean;
  status: number;
  data: T | null;
  isProxyRedirect: boolean;
  error?: string;
}

let inFlightTokenRefresh: Promise<string | null> | null = null;

function resolveApiRequestUrl(url: string): string {
  if (url.startsWith('/') && isApkWebView()) {
    return `${getApiBaseUrl()}${url}`;
  }
  return url;
}

export async function refreshAuthToken(): Promise<string | null> {
  if (inFlightTokenRefresh) return inFlightTokenRefresh;

  inFlightTokenRefresh = (async () => {
    try {
      const rawUser = getStoredUserJson();
      const parsedUser = rawUser ? JSON.parse(rawUser) : null;
      const storedActorId = String(
        parsedUser?.id || localStorage.getItem('ze_id') || ''
      ).trim();
      if (!storedActorId) return null;

      const ownerTok = localStorage.getItem('ze_owner_token') || '';
      const storedRefresh = getStoredRefreshToken();
      const refreshUrl = resolveApiRequestUrl('/api/auth/refresh');
      const res = await fetch(refreshUrl, {
        method: 'POST',
        headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          userId: storedActorId,
          username: parsedUser?.username,
          name: parsedUser?.name,
          role: parsedUser?.role,
          isOwner: parsedUser?.isOwner,
          password: parsedUser?.pass || parsedUser?.password,
          passwordHash: parsedUser?.passwordHash,
          refreshToken: storedRefresh || undefined,
          ownerToken: ownerTok || undefined,
        }),
      });
      if (!res.ok) return null;
      const data = await res.json().catch(() => null);
      if (data?.success && data?.token) {
        const nextUser = data.user ? { ...(parsedUser || {}), ...data.user } : parsedUser;
        if (data.refreshToken) {
          setStoredRefreshToken(data.refreshToken);
        }
        setStoredAuthSession(data.token, nextUser, data.refreshToken);
        if (data.ownerToken) {
          try {
            localStorage.setItem('ze_owner_token', data.ownerToken);
          } catch {}
        }
        return String(data.token);
      }
      return null;
    } catch {
      return null;
    } finally {
      inFlightTokenRefresh = null;
    }
  })();

  return inFlightTokenRefresh;
}

function isAuthBypassEndpoint(url: string): boolean {
  return (
    url.includes('/api/auth/login') ||
    url.includes('/api/auth/register') ||
    url.includes('/api/auth/refresh') ||
    url.includes('/api/auth/session') ||
    url.includes('/api/owner/login')
  );
}

/**
 * Performs fetch() with automatic Authorization Bearer token injection,
 * automatic 401 refresh + single retry, and clean HTML bridge detection.
 */
export async function safeApiFetch<T = any>(
  url: string,
  options?: RequestInit & { timeoutMs?: number; _retriedAuth?: boolean }
): Promise<SafeFetchResult<T>> {
  const { timeoutMs = 10000, headers: extraHeaders, _retriedAuth, ...fetchOpts } = options || {};
  const resolvedUrl = resolveApiRequestUrl(url);
  const authHeaders = buildAuthHeaders(extraHeaders);
  const controller = new AbortController();
  const timer =
    typeof window !== 'undefined'
      ? window.setTimeout(() => {
          try {
            controller.abort();
          } catch {}
        }, timeoutMs)
      : null;

  try {
    const res = await fetch(resolvedUrl, {
      ...fetchOpts,
      headers: authHeaders,
      signal: fetchOpts.signal || controller.signal,
    });

    if (res.status === 401 && !_retriedAuth && !isAuthBypassEndpoint(url)) {
      const refreshedToken = await refreshAuthToken();
      if (refreshedToken) {
        const retryHeaders = new Headers(extraHeaders || {});
        retryHeaders.set('Authorization', `Bearer ${refreshedToken}`);
        return safeApiFetch<T>(url, {
          ...options,
          headers: retryHeaders,
          _retriedAuth: true,
        });
      }
    }

    if (res.redirected && res.url.includes('__cookie_check')) {
      return {
        ok: false,
        status: res.status || 302,
        data: null,
        isProxyRedirect: true,
        error: 'Koneksi API memerlukan sesi aktif atau server URL publik.',
      };
    }

    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    const rawText = await res.text();
    const trimmed = rawText.trim();

    if (
      contentType.includes('text/html') ||
      trimmed.startsWith('<!') ||
      trimmed.startsWith('<html') ||
      trimmed.startsWith('<script') ||
      trimmed.includes('__cookie_check')
    ) {
      return {
        ok: false,
        status: res.status,
        data: null,
        isProxyRedirect: true,
        error: 'Server API mengembalikan HTML alih-alih JSON.',
      };
    }

    let parsed: any = null;
    if (trimmed) {
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        parsed = null;
      }
    }

    const ok = res.ok && parsed !== null;
    return {
      ok,
      status: res.status,
      data: parsed,
      isProxyRedirect: false,
      error: ok
        ? undefined
        : parsed?.error || parsed?.message || (!res.ok ? `HTTP ${res.status}` : 'Respons JSON tidak valid.'),
    };
  } catch (err: any) {
    return {
      ok: false,
      status: 0,
      data: null,
      isProxyRedirect: false,
      error: err?.name === 'AbortError' ? 'Permintaan timeout (server lambat merespons).' : err?.message || 'Gagal terhubung ke server.',
    };
  } finally {
    if (timer !== null && typeof window !== 'undefined') {
      window.clearTimeout(timer);
    }
  }
}

/**
 * Compresses an image file or dataUrl using HTMLCanvasElement so it stays strictly
 * under Firestore's 1 MiB document size limit.
 */
export async function compressImageDataUrl(
  input: string | File | Blob,
  maxSide = 720,
  maxChars = 420000
): Promise<string> {
  const srcUrl =
    typeof input === 'string'
      ? input
      : await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = () => reject(new Error('Failed to read image'));
          reader.readAsDataURL(input);
        });

  if (!srcUrl.startsWith('data:image')) {
    return srcUrl;
  }
  if (srcUrl.length <= maxChars && typeof input === 'string') {
    return srcUrl;
  }

  return new Promise<string>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        let w = img.naturalWidth || img.width || maxSide;
        let h = img.naturalHeight || img.height || maxSide;
        if (w > maxSide || h > maxSide) {
          const scale = Math.min(maxSide / w, maxSide / h);
          w = Math.max(1, Math.round(w * scale));
          h = Math.max(1, Math.round(h * scale));
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(srcUrl.slice(0, maxChars));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);

        let quality = 0.82;
        let out = canvas.toDataURL('image/jpeg', quality);
        while (out.length > maxChars && quality > 0.35) {
          quality -= 0.12;
          out = canvas.toDataURL('image/jpeg', quality);
        }
        resolve(out);
      } catch {
        resolve(srcUrl);
      }
    };
    img.onerror = () => resolve(srcUrl);
    img.src = srcUrl;
  });
}

/**
 * Generates a lightweight JPEG poster thumbnail from a video Blob or DataURL.
 */
export async function extractVideoPosterDataUrl(videoSrc: string): Promise<string> {
  return new Promise((resolve) => {
    try {
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.preload = 'metadata';
      const timeout = window.setTimeout(() => resolve(''), 3500);
      video.onloadeddata = () => {
        try {
          video.currentTime = Math.min(0.4, (video.duration || 1) * 0.2);
        } catch {}
      };
      video.onseeked = () => {
        window.clearTimeout(timeout);
        try {
          const canvas = document.createElement('canvas');
          const ratio = Math.min(1, 360 / Math.max(1, video.videoWidth || 360));
          canvas.width = Math.max(120, Math.round((video.videoWidth || 360) * ratio));
          canvas.height = Math.max(160, Math.round((video.videoHeight || 640) * ratio));
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/jpeg', 0.65));
            return;
          }
        } catch {}
        resolve('');
      };
      video.onerror = () => {
        window.clearTimeout(timeout);
        resolve('');
      };
      video.src = videoSrc;
    } catch {
      resolve('');
    }
  });
}

// ============================================================================
// INDEXEDDB LOCAL MEDIA STORE FOR LARGE VIDEOS IN APK (AVOIDS 1MB FIRESTORE CAP)
// ============================================================================
const MEDIA_IDB_NAME = 'ze_media_blob_db_v1';
const MEDIA_IDB_STORE = 'media_items';

function openMediaIdb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(MEDIA_IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const database = req.result;
        if (!database.objectStoreNames.contains(MEDIA_IDB_STORE)) {
          database.createObjectStore(MEDIA_IDB_STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function saveLocalMediaData(id: string, dataUrl: string): Promise<void> {
  const database = await openMediaIdb();
  if (!database) return;
  return new Promise((resolve) => {
    try {
      const tx = database.transaction(MEDIA_IDB_STORE, 'readwrite');
      tx.objectStore(MEDIA_IDB_STORE).put({ id, dataUrl, updatedAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function getLocalMediaData(id: string): Promise<string | null> {
  const database = await openMediaIdb();
  if (!database) return null;
  return new Promise((resolve) => {
    try {
      const tx = database.transaction(MEDIA_IDB_STORE, 'readonly');
      const req = tx.objectStore(MEDIA_IDB_STORE).get(id);
      req.onsuccess = () => resolve(req.result?.dataUrl || null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

// ============================================================================
// CLIENT-SIDE PUBLIC TIKTOK RESOLVER (WORKS DIRECTLY INSIDE ANDROID APK)
// ============================================================================
export interface TikTokResolvedMedia {
  id?: string;
  title?: string;
  cover?: string;
  play?: string;
  hdplay?: string;
  wmplay?: string;
  music?: string;
  duration?: number;
  resolvedUrl?: string;
  proxiedPlay?: string;
  proxiedHdPlay?: string;
  proxiedMusic?: string;
  succeededApi?: string;
  apiLogs?: string[];
  author?: {
    nickname?: string;
    unique_id?: string;
    avatar?: string;
  };
  music_info?: {
    title?: string;
    author?: string;
    cover?: string;
    play?: string;
    duration?: number;
  };
}

export async function resolveTikTokVideo(rawUrl: string): Promise<TikTokResolvedMedia> {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    throw new Error('Link TikTok masih kosong. Paste link video terlebih dahulu.');
  }

  const clientLogs: string[] = [];

  // 1. Primary: Backend /api/tiktok (follows vt/vm redirects + runs 5 backup APIs sequentially)
  const apiRes = await safeApiFetch<any>(`/api/tiktok?url=${encodeURIComponent(trimmed)}`, {
    timeoutMs: 22000,
  });

  if (Array.isArray(apiRes.data?.apiLogs)) {
    clientLogs.push(...apiRes.data.apiLogs);
  }

  if (apiRes.ok && apiRes.data) {
    const inner = apiRes.data?.data || apiRes.data;
    if (inner?.play || inner?.hdplay || inner?.music) {
      if (clientLogs.length > 0) {
        console.info('[TikTok Resolver Logs]', clientLogs.join(' | '));
      }
      return {
        ...inner,
        apiLogs: clientLogs,
        succeededApi: apiRes.data?.succeededApi || inner.succeededApi,
      };
    }
  }

  // Only attempt direct client fallbacks if backend failed completely (network/all-APIs-down)
  const isPrivateOrMissing =
    apiRes.status === 404 &&
    typeof apiRes.data?.msg === 'string' &&
    apiRes.data.msg.toLowerCase().includes('private');

  if (!isPrivateOrMissing) {
    const targetForClient = apiRes.data?.resolvedUrl || trimmed;
    const clientApis: Array<{ name: string; run: () => Promise<TikTokResolvedMedia | null> }> = [
      {
        name: 'Client API 1 (www.tikwm.com)',
        run: async () => {
          const r = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(targetForClient)}&hd=1`);
          const j = await r.json();
          if (j?.code === 0 && j?.data && (j.data.play || j.data.hdplay || j.data.music)) return j.data;
          throw new Error(j?.msg || `HTTP ${r.status}`);
        },
      },
      {
        name: 'Client API 2 (tikwm.com)',
        run: async () => {
          const r = await fetch(`https://tikwm.com/api/?url=${encodeURIComponent(targetForClient)}&hd=1`);
          const j = await r.json();
          if (j?.code === 0 && j?.data && (j.data.play || j.data.hdplay || j.data.music)) return j.data;
          throw new Error(j?.msg || `HTTP ${r.status}`);
        },
      },
      {
        name: 'Client API 3 (tikwm POST)',
        run: async () => {
          const form = new URLSearchParams();
          form.set('url', targetForClient);
          form.set('hd', '1');
          const r = await fetch('https://www.tikwm.com/api/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: form.toString(),
          });
          const j = await r.json();
          if (j?.code === 0 && j?.data && (j.data.play || j.data.hdplay || j.data.music)) return j.data;
          throw new Error(j?.msg || `HTTP ${r.status}`);
        },
      },
    ];

    for (const step of clientApis) {
      try {
        const result = await step.run();
        if (result) {
          clientLogs.push(`${step.name} berhasil`);
          console.info('[TikTok Resolver Logs]', clientLogs.join(' | '));
          return { ...result, apiLogs: clientLogs, succeededApi: step.name };
        }
      } catch (e: any) {
        clientLogs.push(`${step.name} gagal karena ${e?.message || 'error jaringan/CORS'}`);
      }
    }
  }

  if (clientLogs.length > 0) {
    console.warn('[TikTok Resolver Logs]', clientLogs.join(' | '));
  }

  const err: any = new Error(
    apiRes.data?.msg ||
      'Semua API TikTok lagi down / diblokir. Coba lagi 1 menit lagi atau paste link panjang.'
  );
  err.apiLogs = clientLogs;
  err.redirectFailed = Boolean(apiRes.data?.redirectFailed);
  err.isPrivate = isPrivateOrMissing;
  throw err;
}

/**
 * Triggers real native Android DownloadManager / MediaStore save inside APK,
 * or standard blob/link download in browsers.
 */
export async function downloadMediaAsset(
  mediaUrl: string,
  filename: string,
  mimeType = 'video/mp4'
): Promise<boolean> {
  if (!mediaUrl) return false;

  const nativeBridge = typeof window !== 'undefined' ? window.ZeNative : undefined;

  if (mediaUrl.startsWith('data:')) {
    if (nativeBridge?.saveBase64ToDownloads) {
      return Boolean(nativeBridge.saveBase64ToDownloads(mediaUrl, filename, mimeType));
    }
    const a = document.createElement('a');
    a.href = mediaUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    return true;
  }

  const resolvedDirectUrl = mediaUrl.startsWith('/') && isApkWebView()
    ? `${getApiBaseUrl()}${mediaUrl}`
    : mediaUrl;

  const proxyPath = `/api/tiktok/download?url=${encodeURIComponent(mediaUrl)}&filename=${encodeURIComponent(filename)}`;
  const resolvedProxyUrl = isApkWebView() ? `${getApiBaseUrl()}${proxyPath}` : proxyPath;

  const fetchTarget =
    mediaUrl.startsWith('/api/') || mediaUrl.startsWith('blob:')
      ? resolvedDirectUrl
      : resolvedProxyUrl;

  if (nativeBridge?.downloadMediaFile) {
    const started = nativeBridge.downloadMediaFile(fetchTarget, filename, mimeType);
    if (started) return true;
  }

  try {
    let res = await fetch(fetchTarget);
    if (!res.ok && fetchTarget !== resolvedDirectUrl) {
      res = await fetch(resolvedDirectUrl);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();

    if (nativeBridge?.saveBase64ToDownloads) {
      const b64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onloadend = () => resolve(String(r.result || ''));
        r.onerror = () => reject(new Error('FileReader error'));
        r.readAsDataURL(blob);
      });
      return Boolean(nativeBridge.saveBase64ToDownloads(b64, filename, blob.type || mimeType));
    }

    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => {
      try {
        URL.revokeObjectURL(blobUrl);
      } catch {}
    }, 4000);
    return true;
  } catch {
    const a = document.createElement('a');
    a.href = fetchTarget;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    return true;
  }
}

// ============================================================================
// KEY VALIDATION AGAINST API + FIRESTORE ze_keys (WORKS 100% INSIDE APK)
// ============================================================================
export async function validateLicenseKeyResilient(
  rawKey: string,
  userId?: string
): Promise<{
  success: boolean;
  type?: string;
  code?: string;
  error?: string;
}> {
  const cleanKey = rawKey.trim().toUpperCase();
  const cleanUid = String(userId || 'anonymous').trim().toUpperCase();

  // 1. Try backend endpoint when available
  const apiRes = await safeApiFetch<any>('/api/keys/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: cleanKey, userId: cleanUid }),
    timeoutMs: 3500,
  });

  if (apiRes.data && typeof apiRes.data.success === 'boolean') {
    return apiRes.data;
  }

  // 2. Built-in Owner master keys & Firestore ze_keys validation
  if (!db) {
    return { success: false, error: 'Database belum terhubung. Periksa koneksi internet.' };
  }

  try {
    let keyDocSnap = await getDoc(doc(db, 'ze_keys', cleanKey));
    if (!keyDocSnap.exists()) {
      const q = query(collection(db, 'ze_keys'), where('key', '==', cleanKey), limit(1));
      const snap = await getDocs(q);
      if (!snap.empty) {
        keyDocSnap = snap.docs[0];
      }
    }

    if (!keyDocSnap.exists()) {
      return { success: false, error: 'Key tidak terdaftar di sistem VNJAVA.' };
    }

    const data = keyDocSnap.data() as any;
    if (data.revoked === true || data.isActive === false) {
      return { success: false, error: 'Key sudah dicabut / dinonaktifkan oleh Owner.' };
    }

    if (data.expiresAt && Number(data.expiresAt) > 0 && Date.now() > Number(data.expiresAt)) {
      return { success: false, error: 'Masa aktif Key sudah kedaluwarsa.' };
    }

    const existingOwner = String(
      data.boundUid || data.boundToUserId || data.usedBy || ''
    )
      .trim()
      .toUpperCase();

    if (existingOwner && existingOwner !== cleanUid && cleanUid !== 'ZE-OWNER') {
      return {
        success: false,
        code: 'KEY_ALREADY_USED',
        error: 'KEY SUDAH DIGUNAKAN OLEH AKUN LAIN',
      };
    }

    if (!existingOwner && cleanUid !== 'ANONYMOUS') {
      await updateDoc(keyDocSnap.ref, {
        boundUid: cleanUid,
        boundToUserId: cleanUid,
        usedBy: cleanUid,
        activatedAt: Date.now(),
      }).catch(async () => {
        await setDoc(
          keyDocSnap.ref,
          { boundUid: cleanUid, boundToUserId: cleanUid, usedBy: cleanUid, activatedAt: Date.now() },
          { merge: true }
        ).catch(() => {});
      });
    }

    return {
      success: true,
      type: data.type || (data.expiresAt ? 'vip' : 'permanent'),
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Gagal memverifikasi key di Firestore.',
    };
  }
}
