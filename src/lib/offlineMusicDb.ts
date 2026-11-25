import { getApiBaseUrl } from './apiBase.ts';
import { isApkWebView, safeApiFetch } from './zeDataSync.ts';

export type DownloadQualityKbps = 128 | 256 | 320;
export type StreamingQualityMode = 'auto' | 'low' | 'high';

export interface VNMusicSettings {
  offlineMode: boolean;
  wifiOnlyDownload: boolean;
  downloadQuality: DownloadQualityKbps;
  streamingQuality: StreamingQualityMode;
  autoPlay: boolean;
  repeatDefault: boolean;
  shuffleDefault: boolean;
}

export interface OfflineTrackMeta {
  id: string;
  title: string;
  artist: string;
  album: string;
  thumbnail: string;
  durationSec: number;
  qualityKbps: DownloadQualityKbps;
  mimeType: string;
  sizeBytes: number;
  downloadedAt: number;
  source: string;
  youtubeId?: string;
}

export interface OfflineTrackRecord extends OfflineTrackMeta {
  blob: Blob;
}

export interface DownloadProgressState {
  percent: number;
  loadedBytes: number;
  totalBytes: number;
  status: 'resolving' | 'downloading' | 'saving' | 'error';
  errorMsg?: string;
}

const DB_NAME = 'vn_music_offline_db';
const DB_VERSION = 1;
const STORE_NAME = 'tracks';
const SETTINGS_KEY = 'vn_music_settings_v1';
const META_INDEX_KEY = 'vn_music_offline_meta_v1';

export const DEFAULT_VN_MUSIC_SETTINGS: VNMusicSettings = {
  offlineMode: false,
  wifiOnlyDownload: false,
  downloadQuality: 256,
  streamingQuality: 'auto',
  autoPlay: true,
  repeatDefault: false,
  shuffleDefault: false,
};

export function loadVNMusicSettings(): VNMusicSettings {
  if (typeof window === 'undefined') return { ...DEFAULT_VN_MUSIC_SETTINGS };
  try {
    const raw = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) || '{}');
    return {
      offlineMode: Boolean(raw.offlineMode),
      wifiOnlyDownload: Boolean(raw.wifiOnlyDownload),
      downloadQuality: [128, 256, 320].includes(Number(raw.downloadQuality))
        ? (Number(raw.downloadQuality) as DownloadQualityKbps)
        : 256,
      streamingQuality: ['auto', 'low', 'high'].includes(String(raw.streamingQuality))
        ? (raw.streamingQuality as StreamingQualityMode)
        : 'auto',
      autoPlay: raw.autoPlay === undefined ? true : Boolean(raw.autoPlay),
      repeatDefault: Boolean(raw.repeatDefault),
      shuffleDefault: Boolean(raw.shuffleDefault),
    };
  } catch {
    return { ...DEFAULT_VN_MUSIC_SETTINGS };
  }
}

export function saveVNMusicSettings(next: VNMusicSettings): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {}
}

export function isWifiConnection(): { isWifi: boolean; connectionType: string } {
  if (typeof navigator === 'undefined') return { isWifi: true, connectionType: 'unknown' };
  const conn = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
  if (!conn) return { isWifi: true, connectionType: 'unknown' };
  const rawType = String(conn.type || '').toLowerCase();
  const effectiveType = String(conn.effectiveType || '').toLowerCase();
  if (rawType === 'cellular') return { isWifi: false, connectionType: 'cellular' };
  if (rawType === 'none') return { isWifi: false, connectionType: 'offline' };
  if (rawType === 'wifi' || rawType === 'ethernet') return { isWifi: true, connectionType: rawType };
  return { isWifi: true, connectionType: effectiveType || 'unknown' };
}

function openOfflineDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB tidak tersedia'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Gagal membuka database offline'));
  });
}

function saveMetaIndexToLocalStorage(items: OfflineTrackMeta[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(META_INDEX_KEY, JSON.stringify(items));
  } catch {}
}

export function loadOfflineMetaIndexSync(): OfflineTrackMeta[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(META_INDEX_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function getAllOfflineTrackMeta(): Promise<OfflineTrackMeta[]> {
  try {
    const db = await openOfflineDb();
    const list = await new Promise<OfflineTrackMeta[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const rows = Array.isArray(req.result) ? req.result : [];
        const metas: OfflineTrackMeta[] = rows
          .map((r: OfflineTrackRecord) => ({
            id: r.id,
            title: r.title,
            artist: r.artist,
            album: r.album,
            thumbnail: r.thumbnail,
            durationSec: r.durationSec,
            qualityKbps: r.qualityKbps,
            mimeType: r.mimeType,
            sizeBytes: r.sizeBytes,
            downloadedAt: r.downloadedAt,
            source: r.source,
            youtubeId: r.youtubeId,
          }))
          .sort((a, b) => (b.downloadedAt || 0) - (a.downloadedAt || 0));
        resolve(metas);
      };
      req.onerror = () => reject(req.error);
    });
    saveMetaIndexToLocalStorage(list);
    return list;
  } catch {
    return loadOfflineMetaIndexSync();
  }
}

export async function getOfflineTrackRecord(id: string): Promise<OfflineTrackRecord | null> {
  if (!id) return null;
  try {
    const db = await openOfflineDb();
    return await new Promise<OfflineTrackRecord | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(id);
      req.onsuccess = () => resolve((req.result as OfflineTrackRecord) || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function putOfflineTrackRecord(record: OfflineTrackRecord): Promise<void> {
  const db = await openOfflineDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Gagal menyimpan lagu offline'));
  });
  await getAllOfflineTrackMeta();
}

export async function deleteOfflineTrackRecord(id: string): Promise<void> {
  const db = await openOfflineDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Gagal menghapus lagu offline'));
  });
  await getAllOfflineTrackMeta();
}

export async function clearAllOfflineTracks(): Promise<void> {
  const db = await openOfflineDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Gagal menghapus semua download'));
  });
  saveMetaIndexToLocalStorage([]);
}

function buildAbsoluteStreamUrl(url: string): string {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('blob:')) return url;
  if (url.startsWith('/') && isApkWebView()) {
    return `${getApiBaseUrl()}${url}`;
  }
  return url;
}

export async function downloadFullSongToOffline(
  track: {
    id: string;
    title: string;
    artist: string;
    album?: string;
    thumbnail?: string;
    durationSec?: number;
    fullAudioUrl?: string;
    source?: string;
    youtubeId?: string;
  },
  qualityKbps: DownloadQualityKbps,
  onProgress: (p: DownloadProgressState) => void
): Promise<OfflineTrackMeta> {
  onProgress({ percent: 0, loadedBytes: 0, totalBytes: 0, status: 'resolving' });

  let streamUrl = track.fullAudioUrl || '';
  let resolvedDurationSec = Number(track.durationSec || 0);
  let youtubeId = track.youtubeId;

  // Always resolve FULL audio stream URL first — NEVER store 30-second iTunes preview!
  if (!streamUrl || streamUrl.includes('mzstatic.com') || streamUrl.includes('dzcdn.net')) {
    const res = await safeApiFetch<{
      success?: boolean;
      fullAudioUrl?: string;
      resolvedDurationSec?: number;
      isPreviewOnly?: boolean;
      youtubeId?: string;
    }>(
      `/api/music/resolve-full?title=${encodeURIComponent(track.title)}&artist=${encodeURIComponent(track.artist)}&durationSec=${encodeURIComponent(String(resolvedDurationSec))}&quality=${encodeURIComponent(String(qualityKbps))}`,
      { timeoutMs: 25000 }
    );
    if (res.ok && res.data?.fullAudioUrl && !res.data.isPreviewOnly) {
      streamUrl = res.data.fullAudioUrl;
      if (res.data.resolvedDurationSec && res.data.resolvedDurationSec > 59) {
        resolvedDurationSec = res.data.resolvedDurationSec;
      }
      youtubeId = res.data.youtubeId || youtubeId;
    } else {
      throw new Error('File audio full belum tersedia untuk didownload offline.');
    }
  }

  const absoluteUrl = buildAbsoluteStreamUrl(streamUrl);
  const response = await fetch(absoluteUrl);
  if (!response.ok) {
    throw new Error(`Gagal download audio (HTTP ${response.status})`);
  }

  const headerDuration = Number(response.headers.get('X-Audio-Duration') || 0);
  if (headerDuration >= 60) {
    resolvedDurationSec = headerDuration;
  }

  const totalBytes = Number(response.headers.get('content-length') || 0);
  const mimeType = response.headers.get('content-type') || 'audio/mp4';

  const chunks: Uint8Array[] = [];
  let loadedBytes = 0;

  if (response.body) {
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        loadedBytes += value.byteLength;
        const pct = totalBytes > 0 ? Math.min(99, Math.round((loadedBytes / totalBytes) * 100)) : 50;
        onProgress({
          percent: pct,
          loadedBytes,
          totalBytes: totalBytes || loadedBytes,
          status: 'downloading',
        });
      }
    }
  } else {
    const buf = new Uint8Array(await response.arrayBuffer());
    chunks.push(buf);
    loadedBytes = buf.byteLength;
  }

  onProgress({
    percent: 100,
    loadedBytes,
    totalBytes: totalBytes || loadedBytes,
    status: 'saving',
  });

  const blob = new Blob(chunks, { type: mimeType });
  if (blob.size < 15000) {
    throw new Error('Ukuran audio terlalu kecil, coba download ulang.');
  }

  const record: OfflineTrackRecord = {
    id: track.id,
    title: track.title,
    artist: track.artist,
    album: track.album || 'Single',
    thumbnail: track.thumbnail || '',
    durationSec: resolvedDurationSec || 180,
    qualityKbps,
    mimeType: blob.type || mimeType,
    sizeBytes: blob.size,
    downloadedAt: Date.now(),
    source: track.source || 'vn_offline',
    youtubeId,
    blob,
  };

  await putOfflineTrackRecord(record);

  return {
    id: record.id,
    title: record.title,
    artist: record.artist,
    album: record.album,
    thumbnail: record.thumbnail,
    durationSec: record.durationSec,
    qualityKbps: record.qualityKbps,
    mimeType: record.mimeType,
    sizeBytes: record.sizeBytes,
    downloadedAt: record.downloadedAt,
    source: record.source,
    youtubeId: record.youtubeId,
  };
}
