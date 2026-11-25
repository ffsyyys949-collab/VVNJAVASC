import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Music,
  Play,
  Pause,
  Shuffle,
  Link as LinkIcon,
  Trash2,
  ListMusic,
  Search,
  SlidersHorizontal,
  Heart,
  ChevronLeft,
  Disc3,
  Loader2,
  X,
  Volume2,
  CheckCircle2,
  Maximize2,
  Download,
  WifiOff,
  RefreshCw,
  AlertTriangle,
  Wifi,
} from 'lucide-react';
import { db, collection, doc, setDoc, deleteDoc, getDocs, query, where } from '../firebase.ts';
import { resolveTikTokVideo, safeApiFetch } from '../lib/zeDataSync.ts';
import {
  useMusic,
  formatBytesMb,
  type TrackData,
  type TrackSourceType,
} from '../contexts/MusicContext.tsx';
import type { DownloadQualityKbps } from '../lib/offlineMusicDb.ts';

export interface ConvertedTrack {
  id: string;
  title: string;
  author: string;
  thumbnail: string;
  sourceUrl: string;
  sourceType: TrackSourceType;
  videoUrl?: string;
  audioUrl?: string;
  previewUrl?: string;
  fullAudioUrl?: string;
  youtubeId?: string;
  playbackMode?: 'full' | 'youtube' | 'preview' | 'offline';
  isPreviewFallback?: boolean;
  isCatalogSearch?: boolean;
  album?: string;
  durationMs?: number;
  streamUrl?: string;
  createdAt: number;
}

export interface CatalogSong {
  id: string;
  trackId?: string;
  isrc?: string;
  title: string;
  artist: string;
  artistId?: string;
  album: string;
  albumId?: string;
  releaseYear?: string;
  genre?: string;
  thumbnail: string;
  previewUrl: string;
  fullAudioUrl?: string;
  durationMs: number;
  source: 'itunes' | 'deezer' | 'jamendo' | 'soundcloud' | 'audius' | 'offline';
  sourceUrl: string;
  youtubeId?: string;
}

interface CuratedPlaylistDef {
  id: string;
  title: string;
  subtitle: string;
  keywords: string[];
  isLikedCollection?: boolean;
}

interface ArtistBucket {
  name: string;
  photo: string;
  songs: CatalogSong[];
  albums: AlbumBucket[];
}

interface AlbumBucket {
  key: string;
  title: string;
  artist: string;
  year: string;
  cover: string;
  songs: CatalogSong[];
}

const CATALOG_CACHE_STORAGE_KEY = 'ze_music_catalog_cache_v2';
const CATALOG_CACHE_TTL_MS = 60 * 60 * 1000;

function readCachedCatalogSync(): { tracks: CatalogSong[]; total: number } {
  if (typeof window === 'undefined') return { tracks: [], total: 100000 };
  try {
    const raw = window.localStorage.getItem(CATALOG_CACHE_STORAGE_KEY);
    if (!raw) return { tracks: [], total: 100000 };
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      Array.isArray(parsed.tracks) &&
      parsed.tracks.length > 0 &&
      Date.now() - (Number(parsed.ts) || 0) < CATALOG_CACHE_TTL_MS
    ) {
      return {
        tracks: parsed.tracks,
        total: Number(parsed.total) || Math.max(100000, parsed.tracks.length),
      };
    }
  } catch {}
  return { tracks: [], total: 100000 };
}

function writeCachedCatalogSync(tracks: CatalogSong[], total: number) {
  if (typeof window === 'undefined' || tracks.length === 0) return;
  try {
    window.localStorage.setItem(
      CATALOG_CACHE_STORAGE_KEY,
      JSON.stringify({ ts: Date.now(), total, tracks: tracks.slice(0, 250) })
    );
  } catch {}
}

function MusicCoverImg({
  src,
  alt,
  className = 'w-full h-full object-cover',
  iconSize = 24,
  loading = 'lazy',
}: {
  src?: string;
  alt: string;
  className?: string;
  iconSize?: number;
  loading?: 'lazy' | 'eager';
}) {
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    setBroken(false);
  }, [src]);

  if (!src || broken) {
    return (
      <div className="w-full h-full bg-[#737373] flex items-center justify-center">
        <Music size={iconSize} className="text-black" strokeWidth={2} />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      loading={loading}
      decoding="async"
      onError={() => setBroken(true)}
      className={className}
    />
  );
}

const CATEGORY_CHIPS = [
  'Semua',
  'Musik',
  'Playlist',
  'Artis',
  'Album',
  'Viral',
  'Top Hits',
  'Galau',
  'Semangat',
  'Indonesia',
  'Barat',
  'K-Pop',
  'Dangdut',
];

const SEARCH_TABS: Array<{ id: 'lagu' | 'artis' | 'album' | 'playlist'; label: string }> = [
  { id: 'lagu', label: 'Lagu' },
  { id: 'artis', label: 'Artis' },
  { id: 'album', label: 'Album' },
  { id: 'playlist', label: 'Playlist' },
];

const MADE_FOR_YOU_PLAYLISTS: CuratedPlaylistDef[] = [
  {
    id: 'daily_mix_1',
    title: 'Daily Mix 1',
    subtitle: 'Bernadya, Hindia, Nadin Amizah & Indie Indo',
    keywords: ['bernadya', 'hindia', 'nadin', 'tulus', 'feast', 'indonesia'],
  },
  {
    id: 'daily_mix_2',
    title: 'Daily Mix 2',
    subtitle: 'Taylor Swift, Billie Eilish, Coldplay & Pop Barat',
    keywords: ['taylor', 'billie', 'coldplay', 'weeknd', 'dua lipa', 'bruno'],
  },
  {
    id: 'daily_mix_3',
    title: 'Daily Mix 3',
    subtitle: 'BTS, BLACKPINK, NewJeans & K-Pop Hits',
    keywords: ['bts', 'blackpink', 'newjeans', 'aespa', 'stray kids', 'kpop'],
  },
  {
    id: 'release_radar',
    title: 'Release Radar',
    subtitle: 'Rilis terbaru pilihan minggu ini untuk kamu',
    keywords: ['2024', '2025', 'hits', 'new', 'pop', 'mahalini', 'tiara'],
  },
  {
    id: 'liked_songs',
    title: 'Lagu Yang Disukai',
    subtitle: 'Koleksi lagu favorit pilihanmu',
    keywords: [],
    isLikedCollection: true,
  },
  {
    id: 'mix_galau',
    title: 'Mix Galau',
    subtitle: 'Lagu sedih, akustik & temani malam sunyi',
    keywords: ['galau', 'sedih', 'bernadya', 'fiersa', 'pamungkas', 'raisa'],
  },
  {
    id: 'mix_semangat',
    title: 'Mix Semangat',
    subtitle: 'Beat upbeat untuk olahraga, kerja & perjalanan',
    keywords: ['semangat', 'rock', 'dance', 'edm', 'coldplay', 'imagine'],
  },
];

const CURATED_FOR_YOU_PLAYLISTS: CuratedPlaylistDef[] = [
  {
    id: 'top_50_global',
    title: 'Top 50 Global',
    subtitle: 'Tangga lagu terpopuler dunia hari ini',
    keywords: ['top hits', 'global', 'billie', 'taylor', 'bruno', 'weeknd'],
  },
  {
    id: 'viral_tiktok',
    title: 'Viral TikTok',
    subtitle: 'Sound & lagu FYP paling sering diputar',
    keywords: ['viral', 'tiktok', 'koplo', 'dangdut', 'dj', 'remix'],
  },
  {
    id: 'galau_indo',
    title: 'Galau Indonesia',
    subtitle: 'Balada populer Tanah Air',
    keywords: ['tulus', 'mahalini', 'rizky', 'judika', 'lyodra', 'bernadya'],
  },
  {
    id: 'dangdut_koplo',
    title: 'Dangdut & Koplo',
    subtitle: 'Denny Caknan, Happy Asmara, NDX A.K.A',
    keywords: ['dangdut', 'koplo', 'denny', 'happy asmara', 'ndx'],
  },
];

const INITIAL_BATCH_LIMIT = 100;
const SCROLL_BATCH_LIMIT = 50;

export function MusicLabPage({
  currentUser,
  currentTrack: propCurrentTrack,
  isPlaying: propIsPlaying,
  onPlayTrack,
  onTogglePlay,
  onDeleteCurrent,
}: {
  currentUser: { id: string; name: string; photo?: string; avatar?: string; username?: string };
  currentTrack: TrackData | null;
  isPlaying: boolean;
  onPlayTrack: (track: TrackData) => void;
  onTogglePlay: () => void;
  onDeleteCurrent: () => void;
}) {
  const {
    currentTrack: ctxTrack,
    isPlaying: ctxIsPlaying,
    volume,
    setVolume,
    setPlaylist,
    likedTracks,
    isTrackLiked,
    toggleLikeTrack,
    setIsFullPlayerOpen,
    setYtStatusText,
    musicSettings,
    updateMusicSettings,
    offlineTracks,
    offlineTrackIds,
    downloadProgressMap,
    downloadTrackOffline,
    removeOfflineTrack,
    clearAllOfflineDownloads,
    downloadNotice,
    setDownloadNotice,
  } = useMusic();

  const currentTrack = ctxTrack || propCurrentTrack;
  const isPlaying = ctxTrack ? ctxIsPlaying : propIsPlaying;

  // Paste Link TikTok / YouTube State
  const [linkInput, setLinkInput] = useState('');
  const [isFetchingInfo, setIsFetchingInfo] = useState(false);
  const [tiktokError, setTiktokError] = useState<string | null>(null);
  const [lastFailedTiktokUrl, setLastFailedTiktokUrl] = useState<string>('');
  const [historyTracks, setHistoryTracks] = useState<ConvertedTrack[]>([]);

  // Global Spotify-Style Catalog & Pagination State
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('Semua');
  const [activeTerm, setActiveTerm] = useState('');
  const [searchTab, setSearchTab] = useState<'lagu' | 'artis' | 'album' | 'playlist'>('lagu');
  const [catalogTracks, setCatalogTracks] = useState<CatalogSong[]>(() => readCachedCatalogSync().tracks);
  const [catalogTotalCount, setCatalogTotalCount] = useState<number>(() => readCachedCatalogSync().total);
  const [hasMoreCatalog, setHasMoreCatalog] = useState<boolean>(true);
  const [isSearchingCatalog, setIsSearchingCatalog] = useState<boolean>(
    () => readCachedCatalogSync().tracks.length === 0
  );
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [resolvingSongId, setResolvingSongId] = useState<string | null>(null);
  const [resolvedYtMap, setResolvedYtMap] = useState<Record<string, string>>({});
  const [resolvedFullMap, setResolvedFullMap] = useState<
    Record<string, { fullAudioUrl?: string; youtubeId?: string; durationMs?: number; sourceUsed?: string }>
  >({});
  const [batchDownloadLabel, setBatchDownloadLabel] = useState<string | null>(null);

  // Sub-pages (Artist, Album, Playlist) + Downloads Menu Modal
  const [selectedArtistName, setSelectedArtistName] = useState<string | null>(null);
  const [selectedAlbumKey, setSelectedAlbumKey] = useState<string | null>(null);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [showDownloadsModal, setShowDownloadsModal] = useState(false);
  const [showDownloadPrefs, setShowDownloadPrefs] = useState(false);
  const [cacheNotice, setCacheNotice] = useState<string | null>(null);

  const linkInputRef = useRef<HTMLInputElement | null>(null);
  const activePlaySessionRef = useRef<number>(0);
  const activeFetchIdRef = useRef<number>(0);
  const loadMoreTriggerRef = useRef<HTMLDivElement | null>(null);

  const historyStorageKey = `ze_music_history_${currentUser.id || 'guest'}`;

  // Load user's music history
  const loadHistory = useCallback(async () => {
    const merged = new Map<string, ConvertedTrack>();

    try {
      const cached = JSON.parse(localStorage.getItem(historyStorageKey) || '[]');
      if (Array.isArray(cached)) {
        cached.forEach((t: ConvertedTrack) => t?.id && merged.set(t.id, t));
      }
    } catch {}

    if (db && currentUser.id) {
      try {
        const snap = await getDocs(
          query(collection(db, 'ze_music_history'), where('userId', '==', currentUser.id))
        );
        snap.docs.forEach((d) => {
          const item = d.data() as ConvertedTrack;
          if (item?.id) merged.set(item.id, item);
        });
      } catch {}
    }

    const res = await safeApiFetch<{ tracks?: ConvertedTrack[] }>(
      `/api/music-history?userId=${encodeURIComponent(currentUser.id)}`,
      { timeoutMs: 4500 }
    );
    if (res.ok && Array.isArray(res.data?.tracks)) {
      res.data.tracks.forEach((t) => t?.id && merged.set(t.id, t));
    }

    const sorted = Array.from(merged.values())
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, 30);
    setHistoryTracks(sorted);
    try {
      localStorage.setItem(historyStorageKey, JSON.stringify(sorted));
    } catch {}
  }, [currentUser.id, historyStorageKey]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Direct client-side global multi-keyword iTunes fallback (when server unreachable offline/APK)
  const directGlobalItunesFallback = async (term: string, isTrendingPool = false): Promise<CatalogSong[]> => {
    const keywords = isTrendingPool
      ? [
          'Bernadya',
          'Hindia',
          'Nadin Amizah',
          'Tulus',
          'Mahalini',
          'Taylor Swift',
          'Billie Eilish',
          'Coldplay',
          'BTS',
          'BLACKPINK',
          'Dangdut Koplo',
          'Viral TikTok',
          'Top Hits',
          'Lofi',
        ]
      : [term, `${term} hits`];

    try {
      const responses = await Promise.all(
        keywords.map((kw, idx) =>
          fetch(
            `https://itunes.apple.com/search?term=${encodeURIComponent(kw)}&media=music&entity=song&limit=200&country=${idx % 2 === 0 ? 'ID' : 'US'}`
          )
            .then((r) => (r.ok ? r.json() : { results: [] }))
            .catch(() => ({ results: [] }))
        )
      );

      const seen = new Set<string>();
      const out: CatalogSong[] = [];
      for (const data of responses) {
        for (const item of data?.results || []) {
          if (!item?.trackName || !item?.previewUrl) continue;
          const key = `${String(item.trackName).toLowerCase().trim()}__${String(item.artistName || '').toLowerCase().trim()}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({
            id: `itunes_${item.trackId}`,
            trackId: String(item.trackId),
            title: String(item.trackName),
            artist: String(item.artistName || 'Artis'),
            artistId: item.artistId ? `itunes_artist_${item.artistId}` : undefined,
            album: String(item.collectionName || 'Single'),
            albumId: item.collectionId ? `itunes_album_${item.collectionId}` : undefined,
            releaseYear: item.releaseDate ? String(item.releaseDate).slice(0, 4) : '',
            genre: String(item.primaryGenreName || ''),
            thumbnail: String(item.artworkUrl100 || '')
              .replace(/100x100bb/gi, '600x600bb')
              .replace(/100x100/gi, '600x600'),
            previewUrl: String(item.previewUrl).replace(/^http:\/\//i, 'https://'),
            durationMs: Number(item.trackTimeMillis) || 0,
            source: 'itunes',
            sourceUrl: String(item.trackViewUrl || item.previewUrl),
          });
        }
      }
      return out;
    } catch {
      return [];
    }
  };

  // Load Global 100,000+ Song Pool automatically (renders cached covers immediately in 0ms)
  const loadTrendingSongs = useCallback(async () => {
    const fetchId = ++activeFetchIdRef.current;
    const hasWarmCache = readCachedCatalogSync().tracks.length > 0;
    if (!hasWarmCache) {
      setIsSearchingCatalog(true);
    }
    setActiveTerm('');

    try {
      const res = await safeApiFetch<{
        success?: boolean;
        total?: number;
        hasMore?: boolean;
        tracks?: CatalogSong[];
      }>(`/api/music/trending?offset=0&limit=${INITIAL_BATCH_LIMIT}`, { timeoutMs: 18000 });

      if (activeFetchIdRef.current !== fetchId) return;

      let list = Array.isArray(res.data?.tracks) ? res.data.tracks : [];
      let total = Number(res.data?.total) || Math.max(100000, list.length);
      let hasMore = res.data?.hasMore !== undefined ? Boolean(res.data.hasMore) : true;

      if (list.length === 0) {
        const fb = await directGlobalItunesFallback('Pop Indonesia', true);
        if (activeFetchIdRef.current !== fetchId) return;
        list = fb;
        total = Math.max(100000, fb.length);
        hasMore = false;
      }

      if (list.length > 0) {
        setCatalogTracks(list);
        setCatalogTotalCount(total);
        setHasMoreCatalog(hasMore);
        writeCachedCatalogSync(list, total);
      }
    } catch {
      if (activeFetchIdRef.current !== fetchId) return;
      if (!hasWarmCache) {
        const fb = await directGlobalItunesFallback('Pop Indonesia', true);
        if (activeFetchIdRef.current !== fetchId) return;
        setCatalogTracks(fb);
        setCatalogTotalCount(fb.length);
        setHasMoreCatalog(false);
        writeCachedCatalogSync(fb, fb.length);
      }
    } finally {
      if (activeFetchIdRef.current === fetchId) {
        setIsSearchingCatalog(false);
      }
    }
  }, []);

  useEffect(() => {
    loadTrendingSongs();
  }, [loadTrendingSongs]);

  // Real-time Global Music Search (100+ real songs per keyword)
  const runMusicSearch = useCallback(
    async (rawTerm: string) => {
      const term = rawTerm.trim();
      const lower = term.toLowerCase();
      if (!term || lower === 'semua' || lower === 'musik' || lower === 'playlist' || lower === 'artis' || lower === 'album') {
        if (!term || lower === 'semua' || lower === 'musik') {
          loadTrendingSongs();
        }
        return;
      }

      const fetchId = ++activeFetchIdRef.current;
      setIsSearchingCatalog(true);
      setActiveTerm(term);

      try {
        const res = await safeApiFetch<{
          success?: boolean;
          total?: number;
          hasMore?: boolean;
          tracks?: CatalogSong[];
        }>(`/api/music/search?q=${encodeURIComponent(term)}&offset=0&limit=${INITIAL_BATCH_LIMIT}`, {
          timeoutMs: 15000,
        });

        if (activeFetchIdRef.current !== fetchId) return;

        let list = Array.isArray(res.data?.tracks) ? res.data.tracks : [];
        let total = Number(res.data?.total) || list.length;
        let hasMore = Boolean(res.data?.hasMore);

        if (list.length === 0) {
          const fb = await directGlobalItunesFallback(term, false);
          if (activeFetchIdRef.current !== fetchId) return;
          list = fb;
          total = fb.length;
          hasMore = false;
        }

        setCatalogTracks(list);
        setCatalogTotalCount(total);
        setHasMoreCatalog(hasMore);
      } catch {
        if (activeFetchIdRef.current !== fetchId) return;
        const fb = await directGlobalItunesFallback(term, false);
        if (activeFetchIdRef.current !== fetchId) return;
        setCatalogTracks(fb);
        setCatalogTotalCount(fb.length);
        setHasMoreCatalog(false);
      } finally {
        if (activeFetchIdRef.current === fetchId) {
          setIsSearchingCatalog(false);
        }
      }
    },
    [loadTrendingSongs]
  );

  // Infinite Scroll: load 50 more tracks cleanly from global pool
  const loadMoreCatalogSongs = useCallback(async () => {
    if (isLoadingMore || isSearchingCatalog || !hasMoreCatalog) return;
    const fetchId = activeFetchIdRef.current;
    const nextOffset = catalogTracks.length;
    setIsLoadingMore(true);

    try {
      const endpoint = activeTerm
        ? `/api/music/search?q=${encodeURIComponent(activeTerm)}&offset=${nextOffset}&limit=${SCROLL_BATCH_LIMIT}`
        : `/api/music/trending?offset=${nextOffset}&limit=${SCROLL_BATCH_LIMIT}`;

      const res = await safeApiFetch<{
        success?: boolean;
        total?: number;
        hasMore?: boolean;
        tracks?: CatalogSong[];
      }>(endpoint, { timeoutMs: 14000 });

      if (activeFetchIdRef.current !== fetchId) return;

      const more = Array.isArray(res.data?.tracks) ? res.data.tracks : [];
      if (more.length > 0) {
        setCatalogTracks((prev) => {
          const seen = new Set(prev.map((p) => p.id));
          const merged = [...prev];
          for (const item of more) {
            if (!seen.has(item.id)) {
              seen.add(item.id);
              merged.push(item);
            }
          }
          return merged;
        });
      }
      if (typeof res.data?.total === 'number' && res.data.total > 0) {
        setCatalogTotalCount(res.data.total);
      }
      setHasMoreCatalog(Boolean(res.data?.hasMore) && more.length > 0);
    } catch {
      setHasMoreCatalog(false);
    } finally {
      setIsLoadingMore(false);
    }
  }, [activeTerm, catalogTracks.length, hasMoreCatalog, isLoadingMore, isSearchingCatalog]);

  // Viewport IntersectionObserver for Infinite Scroll down the whole Spotify feed
  useEffect(() => {
    const sentinel = loadMoreTriggerRef.current;
    if (!sentinel || !hasMoreCatalog) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadMoreCatalogSongs();
        }
      },
      { rootMargin: '280px', threshold: 0.01 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMoreCatalog, loadMoreCatalogSongs]);

  // Debounced live search
  useEffect(() => {
    if (!searchQuery.trim()) return;
    const t = window.setTimeout(() => {
      runMusicSearch(searchQuery);
    }, 450);
    return () => window.clearTimeout(t);
  }, [searchQuery, runMusicSearch]);

  const persistTrackToHistory = async (track: ConvertedTrack) => {
    const cleanTrack = Object.fromEntries(
      Object.entries(track).filter(([, value]) => value !== undefined)
    ) as ConvertedTrack;

    setHistoryTracks((prev) => {
      const next = [
        cleanTrack,
        ...prev.filter(
          (t) =>
            t.id !== cleanTrack.id &&
            !(t.title === cleanTrack.title && t.author === cleanTrack.author)
        ),
      ].slice(0, 30);
      try {
        localStorage.setItem(historyStorageKey, JSON.stringify(next));
      } catch {}
      return next;
    });

    if (db && currentUser.id && cleanTrack.id) {
      try {
        await setDoc(doc(db, 'ze_music_history', cleanTrack.id), {
          ...cleanTrack,
          userId: currentUser.id,
        });
      } catch {}
    }

    safeApiFetch('/api/music-history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUser.id, track: cleanTrack }),
    }).catch(() => {});
  };

  const toCatalogTrackData = useCallback(
    (
      song: CatalogSong,
      mode: 'full' | 'youtube' | 'preview' | 'offline',
      overrides?: Partial<TrackData>
    ): TrackData => {
      const cached = resolvedFullMap[song.id];
      const fullAudioUrl =
        overrides?.fullAudioUrl || song.fullAudioUrl || cached?.fullAudioUrl || undefined;
      const ytId = overrides?.youtubeId || song.youtubeId || cached?.youtubeId || resolvedYtMap[song.id];
      return {
        id: song.id,
        title: song.title,
        author: song.artist,
        artist: song.artist,
        album: song.album,
        thumbnail: song.thumbnail,
        cover: song.thumbnail,
        fullAudioUrl,
        audioUrl: fullAudioUrl || song.previewUrl,
        previewUrl: song.previewUrl,
        url: fullAudioUrl || song.previewUrl,
        youtubeId: ytId,
        playbackMode: mode,
        isPreviewFallback: mode === 'preview',
        isCatalogSearch: true,
        durationMs: overrides?.durationMs || cached?.durationMs || song.durationMs,
        source: song.source,
        sourceType: song.source,
        sourceUrl: song.sourceUrl,
        isrc: song.isrc,
        releaseYear: song.releaseYear,
        genre: song.genre,
        ...overrides,
      };
    },
    [resolvedFullMap, resolvedYtMap]
  );

  // Full-duration resolver: NEVER defaults to 30s iTunes preview!
  // Checks Offline IndexedDB -> /api/music/resolve-full (SoundCloud/Audius/Jamendo/YouTube duration-matched) -> explicit 30s warning only if ALL fail.
  const handleSelectCatalogSong = async (song: CatalogSong, queuePool?: CatalogSong[]) => {
    const session = ++activePlaySessionRef.current;
    const pool = queuePool && queuePool.length > 0 ? queuePool : catalogTracks;
    const queueList = pool.map((s) =>
      toCatalogTrackData(s, offlineTrackIds.has(s.id) ? 'offline' : 'full')
    );
    setPlaylist(queueList);

    // 1. Offline track already downloaded -> play 100% locally in <50ms!
    if (offlineTrackIds.has(song.id) || musicSettings.offlineMode) {
      setResolvingSongId(null);
      setYtStatusText('⬇️ Memutar Lagu Offline');
      onPlayTrack(toCatalogTrackData(song, 'offline'));
      return;
    }

    // 2. Cached full resolution -> play immediately with full duration
    const cachedFull = resolvedFullMap[song.id];
    if (cachedFull?.fullAudioUrl) {
      setResolvingSongId(null);
      setYtStatusText(`Full Audio Aktif (${cachedFull.sourceUsed || 'Full'})`);
      onPlayTrack(
        toCatalogTrackData(song, 'full', {
          fullAudioUrl: cachedFull.fullAudioUrl,
          audioUrl: cachedFull.fullAudioUrl,
          youtubeId: cachedFull.youtubeId,
          durationMs: cachedFull.durationMs || song.durationMs,
          isPreviewFallback: false,
        })
      );
      return;
    }

    // 3. Resolve FULL AUDIO from backend (SoundCloud / Audius / Jamendo / YouTube matched by exact duration)
    setResolvingSongId(song.id);
    setYtStatusText('Mencari Versi Full...');

    try {
      const targetSec = song.durationMs > 0 ? Math.round(song.durationMs / 1000) : 0;
      const qParam =
        musicSettings.streamingQuality === 'low'
          ? '128'
          : musicSettings.streamingQuality === 'high'
          ? '320'
          : '256';
      const res = await safeApiFetch<{
        success?: boolean;
        fullAudioUrl?: string;
        sourceUsed?: string;
        resolvedDurationSec?: number;
        isPreviewOnly?: boolean;
        youtubeId?: string;
        youtubeDurationSec?: number;
      }>(
        `/api/music/resolve-full?title=${encodeURIComponent(song.title)}&artist=${encodeURIComponent(song.artist)}&durationSec=${targetSec}&quality=${qParam}`,
        { timeoutMs: 22000 }
      );

      if (activePlaySessionRef.current !== session) return;

      if (res.ok && res.data) {
        const d = res.data;
        if (d.youtubeId) {
          setResolvedYtMap((prev) => ({ ...prev, [song.id]: d.youtubeId! }));
        }

        if (d.fullAudioUrl && !d.isPreviewOnly) {
          const finalDurMs =
            d.resolvedDurationSec && d.resolvedDurationSec >= 60
              ? d.resolvedDurationSec * 1000
              : song.durationMs;
          setResolvedFullMap((prev) => ({
            ...prev,
            [song.id]: {
              fullAudioUrl: d.fullAudioUrl,
              youtubeId: d.youtubeId,
              durationMs: finalDurMs,
              sourceUsed: d.sourceUsed,
            },
          }));
          setYtStatusText(`Full Audio Aktif (${d.sourceUsed || 'Full'})`);
          const fullTrack = toCatalogTrackData(song, 'full', {
            fullAudioUrl: d.fullAudioUrl,
            audioUrl: d.fullAudioUrl,
            youtubeId: d.youtubeId,
            durationMs: finalDurMs,
            isPreviewFallback: false,
            resolvedSourceLabel: `Full Audio (${d.sourceUsed || 'Stream'})`,
          });
          onPlayTrack(fullTrack);
          persistTrackToHistory({
            id: song.id,
            title: song.title,
            author: song.artist,
            thumbnail: song.thumbnail,
            sourceUrl: song.sourceUrl,
            sourceType: 'soundcloud',
            fullAudioUrl: d.fullAudioUrl,
            audioUrl: d.fullAudioUrl,
            previewUrl: song.previewUrl,
            playbackMode: 'full',
            ...(d.youtubeId ? { youtubeId: d.youtubeId } : {}),
            isCatalogSearch: true,
            album: song.album,
            durationMs: finalDurMs,
            createdAt: Date.now(),
          });
          setResolvingSongId(null);
          return;
        }

        // If only YouTube matched (>= 60s), play full via YouTube
        if (d.youtubeId && !d.isPreviewOnly) {
          const ytDurMs =
            d.youtubeDurationSec && d.youtubeDurationSec >= 60
              ? d.youtubeDurationSec * 1000
              : song.durationMs;
          setYtStatusText('YouTube Full Audio Aktif');
          onPlayTrack(
            toCatalogTrackData(song, 'youtube', {
              youtubeId: d.youtubeId,
              durationMs: ytDurMs,
              isPreviewFallback: false,
            })
          );
          setResolvingSongId(null);
          return;
        }
      }
    } catch {}

    if (activePlaySessionRef.current !== session) return;
    setResolvingSongId(null);

    // 4. ALL full sources failed -> Explicit Preview fallback warning (NEVER hidden!)
    setYtStatusText('⚠️ FULL TIDAK KETEMU, INI CUMA PREVIEW 30 DETIK');
    onPlayTrack(
      toCatalogTrackData(song, 'preview', {
        isPreviewFallback: true,
        resolvedSourceLabel: 'Preview 30 Detik',
      })
    );
  };

  // Download all songs inside a Playlist or Album
  const handleDownloadCollection = async (songs: CatalogSong[]) => {
    const toDownload = songs.filter((s) => !offlineTrackIds.has(s.id));
    if (toDownload.length === 0) {
      setBatchDownloadLabel('Semua lagu sudah didownload!');
      setTimeout(() => setBatchDownloadLabel(null), 2500);
      return;
    }
    let doneCount = 0;
    for (const s of toDownload) {
      doneCount += 1;
      setBatchDownloadLabel(`Mendownload ${doneCount}/${toDownload.length}: ${s.title}`);
      const ok = await downloadTrackOffline(toCatalogTrackData(s, 'full'));
      if (!ok) break;
    }
    setBatchDownloadLabel(`Selesai download ${doneCount} lagu offline!`);
    setTimeout(() => setBatchDownloadLabel(null), 3000);
  };

  // Search YouTube / catalog using keywords extracted from failed TikTok URL or title
  const handleSearchYoutubeFallbackFromTiktok = () => {
    const raw = lastFailedTiktokUrl || linkInput || 'viral tiktok';
    const userMatch = raw.match(/@([a-zA-Z0-9._-]+)/);
    const cleaned = userMatch
      ? userMatch[1].replace(/[._]/g, ' ')
      : raw
          .replace(/https?:\/\/[^\s]+/gi, '')
          .trim() || 'Viral TikTok';
    setTiktokError(null);
    setSearchQuery(cleaned);
    setActiveCategory('Semua');
    runMusicSearch(cleaned);
  };

  // Handle direct TikTok / YouTube Link submission (full redirect resolution, proxied stream, clear errors!)
  const handleInspectAndPlay = async (e?: React.FormEvent, overrideUrl?: string) => {
    if (e) e.preventDefault();
    const url = (overrideUrl ?? linkInput).trim();
    if (!url) return;

    ++activePlaySessionRef.current;
    setYtStatusText('');
    setTiktokError(null);
    setIsFetchingInfo(true);

    try {
      if (url.includes('tiktok.com') || url.includes('douyin.com')) {
        const d = await resolveTikTokVideo(url);
        const bestAudio = d.proxiedMusic || d.proxiedPlay || d.music || d.music_info?.play || d.play || '';
        const bestVideo = d.proxiedPlay || d.play || d.hdplay || '';
        const durMs =
          d.duration && d.duration > 0
            ? d.duration * 1000
            : d.music_info?.duration && d.music_info.duration > 0
            ? d.music_info.duration * 1000
            : undefined;

        if (!bestAudio && !bestVideo) {
          throw new Error(
            'Link TikTok tidak bisa diputar, video di-private / tidak ada suara / link salah. Coba link lain.'
          );
        }

        const trackData: TrackData = {
          id: 'tt_' + Date.now(),
          title: d.title || 'TikTok Video',
          author: d.author?.nickname || d.author?.unique_id || 'TikTok Creator',
          artist: d.author?.nickname || d.author?.unique_id || 'TikTok Creator',
          thumbnail: d.cover || '',
          cover: d.cover || '',
          videoUrl: bestVideo,
          audioUrl: bestAudio,
          fullAudioUrl: bestAudio,
          url: bestVideo || url,
          durationMs: durMs,
          playbackMode: 'full',
          isPreviewFallback: false,
          source: 'tiktok',
          sourceType: 'tiktok',
          sourceUrl: d.resolvedUrl || url,
          isCatalogSearch: false,
        };

        // Ensure queue always has Next songs so Auto Next works cleanly after TikTok ends!
        const nextCatalogTracks = catalogTracks
          .slice(0, 20)
          .map((s) => toCatalogTrackData(s, offlineTrackIds.has(s.id) ? 'offline' : 'full'));
        setPlaylist([trackData, ...nextCatalogTracks]);

        onPlayTrack(trackData);
        await persistTrackToHistory({
          id: trackData.id!,
          title: trackData.title,
          author: trackData.author || 'TikTok Creator',
          thumbnail: trackData.thumbnail || '',
          sourceUrl: url,
          sourceType: 'tiktok',
          videoUrl: trackData.videoUrl,
          audioUrl: trackData.audioUrl,
          durationMs: durMs,
          playbackMode: 'full',
          isCatalogSearch: false,
          createdAt: Date.now(),
        });

        setLinkInput('');
        setLastFailedTiktokUrl('');
        setIsFetchingInfo(false);
        return;
      }

      if (url.includes('youtube.com') || url.includes('youtu.be')) {
        let title = 'YouTube Video';
        let author = 'YouTube Creator';
        let thumbnail = '';

        const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([^&?#/]+)/i);
        const ytid = match ? match[1] : '';
        if (ytid) {
          thumbnail = `https://img.youtube.com/vi/${ytid}/hqdefault.jpg`;
        }

        try {
          const res = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(url)}`);
          if (res.ok) {
            const data = await res.json();
            if (data.title) title = data.title;
            if (data.author_name) author = data.author_name;
          }
        } catch {}

        const ytTrack: TrackData = {
          id: 'yt_' + Date.now(),
          title,
          author,
          artist: author,
          thumbnail,
          url,
          youtubeId: ytid || undefined,
          playbackMode: ytid ? 'youtube' : undefined,
          videoUrl: undefined,
          source: 'youtube',
          sourceType: 'youtube',
          sourceUrl: url,
          isCatalogSearch: false,
        };

        onPlayTrack(ytTrack);
        await persistTrackToHistory({
          id: ytTrack.id!,
          title,
          author,
          thumbnail,
          sourceUrl: url,
          sourceType: 'youtube',
          ...(ytid ? { youtubeId: ytid } : {}),
          isCatalogSearch: false,
          createdAt: Date.now(),
        });

        setLinkInput('');
        setIsFetchingInfo(false);
        return;
      }

      const fallbackTrack: TrackData = {
        id: 'web_' + Date.now(),
        title: 'Tautan Musik Web',
        author: 'Web Audio',
        artist: 'Web Audio',
        thumbnail: '',
        url,
        audioUrl: url,
        fullAudioUrl: url,
        playbackMode: 'full',
        videoUrl: undefined,
        source: 'web',
        sourceType: 'web',
        sourceUrl: url,
        isCatalogSearch: false,
      };

      onPlayTrack(fallbackTrack);
      await persistTrackToHistory({
        id: fallbackTrack.id!,
        title: fallbackTrack.title,
        author: 'Web Audio',
        thumbnail: '',
        sourceUrl: url,
        sourceType: 'web',
        audioUrl: url,
        isCatalogSearch: false,
        createdAt: Date.now(),
      });
      setLinkInput('');
    } catch (err: any) {
      setLastFailedTiktokUrl(url);
      setTiktokError(
        err?.message ||
          'Link TikTok tidak bisa diputar, video di-private / tidak ada suara / link salah. Coba link lain.'
      );
    } finally {
      setIsFetchingInfo(false);
    }
  };

  // Auto-paste clipboard into linkInput if empty when tapping Paste area or Putar button
  const handleQuickPasteFromClipboard = async (triggerPlayIfFound = false) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
        const clip = (await navigator.clipboard.readText()).trim();
        if (clip && /^https?:\/\//i.test(clip)) {
          setLinkInput(clip);
          if (triggerPlayIfFound) {
            await handleInspectAndPlay(undefined, clip);
          }
          return true;
        }
      }
    } catch {}
    return false;
  };

  const handleDeleteHistoryItem = async (e: React.MouseEvent, trackId: string) => {
    e.stopPropagation();
    setHistoryTracks((prev) => {
      const next = prev.filter((t) => t.id !== trackId);
      try {
        localStorage.setItem(historyStorageKey, JSON.stringify(next));
      } catch {}
      return next;
    });
    if (db) {
      deleteDoc(doc(db, 'ze_music_history', trackId)).catch(() => {});
    }
    safeApiFetch(
      `/api/music-history?userId=${encodeURIComponent(currentUser.id)}&trackId=${encodeURIComponent(trackId)}`,
      { method: 'DELETE' }
    ).catch(() => {});
  };

  const formatTime = (seconds: number) => {
    const clean = Math.max(0, Math.floor(seconds || 0));
    const m = Math.floor(clean / 60);
    const s = Math.floor(clean % 60);
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Derive Artists & Albums dynamically from loaded Global Catalog
  const { artistsList, albumsList, trendingCarousel, viralCarousel } = useMemo(() => {
    const artistMap = new Map<string, ArtistBucket>();
    const albumMap = new Map<string, AlbumBucket>();

    for (const song of catalogTracks) {
      const primaryArtist = song.artist.split(/[,&]|feat\.|ft\./i)[0].trim() || song.artist;
      if (!artistMap.has(primaryArtist.toLowerCase())) {
        artistMap.set(primaryArtist.toLowerCase(), {
          name: primaryArtist,
          photo: song.thumbnail,
          songs: [],
          albums: [],
        });
      }
      const ab = artistMap.get(primaryArtist.toLowerCase())!;
      if (!ab.photo && song.thumbnail) ab.photo = song.thumbnail;
      ab.songs.push(song);

      const cleanAlbum = (song.album || '').trim();
      if (cleanAlbum && cleanAlbum.toLowerCase() !== 'single') {
        const aKey = `${cleanAlbum.toLowerCase()}__${primaryArtist.toLowerCase()}`;
        if (!albumMap.has(aKey)) {
          albumMap.set(aKey, {
            key: aKey,
            title: cleanAlbum,
            artist: primaryArtist,
            year: song.releaseYear || '2024',
            cover: song.thumbnail,
            songs: [],
          });
        }
        const alb = albumMap.get(aKey)!;
        if (!alb.cover && song.thumbnail) alb.cover = song.thumbnail;
        alb.songs.push(song);
      }
    }

    const artists = Array.from(artistMap.values()).slice(0, 40);
    const albums = Array.from(albumMap.values()).slice(0, 40);
    for (const a of artists) {
      a.albums = albums.filter((alb) => alb.artist.toLowerCase() === a.name.toLowerCase());
    }

    const trending = catalogTracks.slice(0, 50);
    const viralPool = catalogTracks.filter((s) =>
      /viral|tiktok|koplo|remix|dj|bernadya|hindia|taylor|billie|bts|blackpink|mahalini/i.test(
        `${s.title} ${s.artist} ${s.genre || ''}`
      )
    );
    const viral = (viralPool.length >= 25 ? viralPool : catalogTracks.slice().reverse()).slice(0, 50);

    return {
      artistsList: artists,
      albumsList: albums,
      trendingCarousel: trending,
      viralCarousel: viral,
    };
  }, [catalogTracks]);

  // Helper to resolve curated playlist songs
  const getPlaylistSongs = useCallback(
    (def: CuratedPlaylistDef): CatalogSong[] => {
      if (def.isLikedCollection) {
        return likedTracks.map((t, i) => ({
          id: t.id || `liked_${i}`,
          title: t.title,
          artist: t.artist || t.author || 'Artis',
          album: t.album || 'Lagu Disukai',
          thumbnail: t.thumbnail || t.cover || '',
          previewUrl: t.previewUrl || t.audioUrl || t.url || '',
          fullAudioUrl: t.fullAudioUrl,
          durationMs: t.durationMs || 0,
          source: (['deezer', 'jamendo', 'soundcloud', 'audius', 'offline'].includes(t.source)
            ? t.source
            : 'itunes') as CatalogSong['source'],
          sourceUrl: t.sourceUrl || '',
          youtubeId: t.youtubeId,
        }));
      }
      const matches = catalogTracks.filter((s) => {
        const hay = `${s.title} ${s.artist} ${s.album} ${s.genre || ''}`.toLowerCase();
        return def.keywords.some((kw) => hay.includes(kw));
      });
      return (matches.length >= 8 ? matches : catalogTracks).slice(0, 50);
    },
    [catalogTracks, likedTracks]
  );

  // Convert IndexedDB Offline Meta list into CatalogSong[] for Offline Mode feed
  const offlineCatalogSongs = useMemo<CatalogSong[]>(() => {
    return offlineTracks.map((o) => ({
      id: o.id,
      title: o.title,
      artist: o.artist,
      album: o.album || 'Offline',
      thumbnail: o.thumbnail,
      previewUrl: '',
      durationMs: (o.durationSec || 180) * 1000,
      source: 'offline',
      sourceUrl: '',
      youtubeId: o.youtubeId,
    }));
  }, [offlineTracks]);

  const allPlaylists = useMemo(
    () => [...MADE_FOR_YOU_PLAYLISTS, ...CURATED_FOR_YOU_PLAYLISTS],
    []
  );

  const userPhoto = currentUser?.photo || currentUser?.avatar || '';
  const displayUserName = (currentUser?.name || currentUser?.username || 'Teman').trim();
  const userInitial = displayUserName.charAt(0).toUpperCase() || 'V';
  const displayTotalSongs = musicSettings.offlineMode
    ? offlineCatalogSongs.length
    : Math.max(catalogTotalCount, catalogTracks.length);

  // Active Sub-pages Resolution
  const activePlaylistDef = selectedPlaylistId
    ? allPlaylists.find((p) => p.id === selectedPlaylistId) || null
    : null;
  const activeArtistObj = selectedArtistName
    ? artistsList.find((a) => a.name.toLowerCase() === selectedArtistName.toLowerCase()) || {
        name: selectedArtistName,
        photo:
          catalogTracks.find((s) =>
            s.artist.toLowerCase().includes(selectedArtistName.toLowerCase())
          )?.thumbnail || '',
        songs: catalogTracks.filter((s) =>
          s.artist.toLowerCase().includes(selectedArtistName.toLowerCase())
        ),
        albums: albumsList.filter((al) =>
          al.artist.toLowerCase().includes(selectedArtistName.toLowerCase())
        ),
      }
    : null;
  const activeAlbumObj = selectedAlbumKey
    ? albumsList.find((a) => a.key === selectedAlbumKey) || null
    : null;

  // Render Reusable Spotify Track Row with ⬇️ Offline Download Badge + Progress + Full Resolve Spinner
  const renderSpotifyTrackRow = (song: CatalogSong, idx: number, queuePool?: CatalogSong[]) => {
    const isSelected = currentTrack?.id === song.id;
    const isResolving = resolvingSongId === song.id;
    const durSec = Math.max(0, Math.round((song.durationMs || 0) / 1000));
    const liked = isTrackLiked(song.id);
    const isDownloaded = offlineTrackIds.has(song.id);
    const dlProg = downloadProgressMap[song.id];
    const isDownloading = Boolean(dlProg && dlProg.status !== 'error');

    return (
      <div
        key={`${song.id}_${idx}`}
        onClick={() => handleSelectCatalogSong(song, queuePool)}
        className={`min-h-[72px] px-2.5 py-2 rounded-xl flex items-center justify-between gap-2.5 cursor-pointer transition active:scale-[0.99] ${
          isSelected ? 'bg-[#282828]' : 'hover:bg-[#1E1E1E]'
        }`}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <span
            className={`w-6 text-center text-sm font-bold tabular-nums shrink-0 ${
              isSelected ? 'text-[#1DB954]' : 'text-[#B3B3B3]'
            }`}
          >
            {idx + 1}
          </span>

          <div className="w-[60px] h-[60px] rounded-md overflow-hidden bg-[#737373] shrink-0 flex items-center justify-center relative">
            <MusicCoverImg src={song.thumbnail} alt={song.title} iconSize={24} loading="lazy" />
            {isDownloaded && (
              <span
                className="absolute right-0.5 bottom-0.5 w-4 h-4 rounded-full bg-[#1DB954] text-black flex items-center justify-center shadow"
                title="Sudah Didownload Offline"
              >
                <Download size={10} strokeWidth={3} />
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 min-w-0">
              {isDownloaded && (
                <Download size={14} className="text-[#1DB954] shrink-0" strokeWidth={2.75} />
              )}
              <p
                className={`text-[17px] font-bold truncate leading-snug ${
                  isSelected ? 'text-[#1DB954]' : 'text-white'
                }`}
              >
                {song.title}
              </p>
            </div>
            <p
              onClick={(e) => {
                e.stopPropagation();
                setSelectedArtistName(song.artist.split(/[,&]/)[0].trim());
              }}
              className="text-[15px] text-[#B3B3B3] hover:text-white hover:underline truncate mt-0.5 leading-snug"
            >
              {song.artist}
            </p>
            {isDownloading && dlProg && (
              <div className="mt-1 space-y-0.5">
                <p className="text-[11px] font-bold text-[#1DB954] tabular-nums">
                  Mendownload {dlProg.percent}% - {formatBytesMb(dlProg.loadedBytes)} /{' '}
                  {formatBytesMb(dlProg.totalBytes)}
                </p>
                <div className="h-1 bg-white/15 rounded-full overflow-hidden max-w-[180px]">
                  <div
                    className="h-full bg-[#1DB954]"
                    style={{ width: `${dlProg.percent}%` }}
                  />
                </div>
              </div>
            )}
            {!isDownloading && isDownloaded && (
              <p className="text-[11px] font-semibold text-[#1DB954] mt-0.5">
                ✅ Sudah Didownload
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          {durSec > 0 && (
            <span className="hidden sm:inline text-xs text-[#B3B3B3] font-mono tabular-nums mr-1">
              {formatTime(durSec)}
            </span>
          )}

          {/* ⬇️ Offline Download / Delete Download Button */}
          <button
            type="button"
            disabled={isDownloading}
            onClick={() => {
              if (isDownloaded) {
                removeOfflineTrack(song.id);
              } else {
                downloadTrackOffline(toCatalogTrackData(song, 'full'));
              }
            }}
            className={`w-9 h-9 rounded-full flex items-center justify-center cursor-pointer active:scale-90 transition ${
              isDownloaded
                ? 'bg-[#1DB954]/20 text-[#1DB954] hover:bg-red-500/20 hover:text-red-300'
                : 'hover:bg-white/10 text-[#B3B3B3] hover:text-white'
            }`}
            title={isDownloaded ? 'Hapus Download' : 'Download Lagu Full Offline'}
            aria-label={isDownloaded ? 'Hapus Download' : 'Download Lagu'}
          >
            {isDownloading ? (
              <Loader2 size={17} className="animate-spin text-[#1DB954]" />
            ) : isDownloaded ? (
              <CheckCircle2 size={18} />
            ) : (
              <Download size={18} />
            )}
          </button>

          <button
            type="button"
            onClick={() => toggleLikeTrack(toCatalogTrackData(song, 'full'))}
            className="w-9 h-9 rounded-full hover:bg-white/10 flex items-center justify-center cursor-pointer active:scale-90 transition"
            aria-label={liked ? 'Hapus dari disukai' : 'Sukai lagu'}
          >
            <Heart
              size={18}
              className={liked ? 'text-[#1DB954] fill-[#1DB954]' : 'text-[#B3B3B3] hover:text-white'}
            />
          </button>

          <button
            type="button"
            onClick={() => {
              if (isSelected && !isResolving) {
                onTogglePlay();
              } else {
                handleSelectCatalogSong(song, queuePool);
              }
            }}
            className="w-[46px] h-[46px] rounded-full bg-[#1DB954] hover:brightness-110 text-black flex items-center justify-center shrink-0 transition active:scale-90 cursor-pointer shadow-lg"
            title={isSelected && isPlaying ? 'Pause' : 'Play'}
            aria-label={isSelected && isPlaying ? `Pause ${song.title}` : `Play ${song.title}`}
          >
            {isResolving ? (
              <Loader2 size={20} className="animate-spin text-black" />
            ) : isSelected && isPlaying ? (
              <Pause size={20} className="fill-black text-black" />
            ) : (
              <Play size={20} className="fill-black text-black ml-0.5" />
            )}
          </button>
        </div>
      </div>
    );
  };

  // Helper to pick 4 distinct real cover photos for 2x2 Spotify collage (NO AI, NO gradient)
  const getDistinctCollageCovers = (songs: CatalogSong[], fallbackPool: CatalogSong[]): CatalogSong[] => {
    const picked: CatalogSong[] = [];
    const seenThumbs = new Set<string>();
    const addFrom = (list: CatalogSong[]) => {
      for (const s of list) {
        if (!s?.thumbnail) continue;
        const norm = s.thumbnail.trim();
        if (seenThumbs.has(norm)) continue;
        seenThumbs.add(norm);
        picked.push(s);
        if (picked.length >= 4) return;
      }
    };
    addFrom(songs);
    if (picked.length < 4) addFrom(fallbackPool);
    return picked.slice(0, 4);
  };

  // Render Playlist 2-column grid item (160x160 2x2 real cover collage, ZERO gradient & ZERO AI Star)
  const renderPlaylistCard = (pl: CuratedPlaylistDef) => {
    const plSongs = getPlaylistSongs(pl);
    const collage = getDistinctCollageCovers(
      plSongs,
      pl.isLikedCollection ? [] : catalogTracks
    );
    return (
      <button
        key={pl.id}
        type="button"
        onClick={() => setSelectedPlaylistId(pl.id)}
        className="bg-[#181818] hover:bg-[#282828] rounded-xl p-3 text-left flex flex-col gap-2.5 transition cursor-pointer group active:scale-[0.98]"
      >
        <div
          className={`w-[160px] h-[160px] max-w-full aspect-square mx-auto rounded-lg overflow-hidden bg-[#737373] shadow-lg relative grid ${
            collage.length >= 4 ? 'grid-cols-2 grid-rows-2' : 'grid-cols-1 grid-rows-1'
          }`}
        >
          {pl.isLikedCollection && collage.length === 0 ? (
            <div className="flex items-center justify-center w-full h-full bg-[#525252]">
              <Heart size={44} className="text-black fill-black" />
            </div>
          ) : collage.length >= 4 ? (
            collage.map((c, idx) => (
              <MusicCoverImg
                key={`${c.id}_${idx}`}
                src={c.thumbnail}
                alt={c.title || pl.title}
                iconSize={22}
                loading="eager"
              />
            ))
          ) : collage[0]?.thumbnail ? (
            <MusicCoverImg
              src={collage[0].thumbnail}
              alt={pl.title}
              iconSize={40}
              loading="eager"
            />
          ) : (
            <div className="flex items-center justify-center w-full h-full bg-[#737373]">
              <Music size={44} className="text-black" strokeWidth={2} />
            </div>
          )}

          <span className="absolute right-2 bottom-2 w-[48px] h-[48px] rounded-full bg-[#1DB954] text-black flex items-center justify-center shadow-xl opacity-95 group-hover:scale-105 transition">
            <Play size={20} className="fill-black ml-0.5" />
          </span>
        </div>

        <div className="min-w-0">
          <p className="text-[15px] font-bold text-white truncate">{pl.title}</p>
          <p className="text-xs text-[#B3B3B3] line-clamp-2 mt-0.5 leading-snug">
            {pl.subtitle}
          </p>
        </div>
      </button>
    );
  };

  // Render Horizontal 160x160 Song Card (Trending / Viral TikTok)
  const renderHorizontalSongCard = (song: CatalogSong, idx: number, pool: CatalogSong[]) => {
    const isSelected = currentTrack?.id === song.id;
    return (
      <div
        key={`${song.id}_${idx}`}
        onClick={() => handleSelectCatalogSong(song, pool)}
        className="w-[160px] shrink-0 bg-[#181818] hover:bg-[#282828] rounded-xl p-2.5 cursor-pointer transition group active:scale-[0.98]"
      >
        <div className="w-full aspect-square rounded-lg overflow-hidden bg-[#737373] relative shadow-md">
          <MusicCoverImg src={song.thumbnail} alt={song.title} iconSize={36} loading="lazy" />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (isSelected) onTogglePlay();
              else handleSelectCatalogSong(song, pool);
            }}
            className="absolute right-2 bottom-2 w-[48px] h-[48px] rounded-full bg-[#1DB954] text-black flex items-center justify-center shadow-xl hover:scale-105 transition cursor-pointer"
            aria-label={`Play ${song.title}`}
          >
            {isSelected && isPlaying ? (
              <Pause size={20} className="fill-black" />
            ) : (
              <Play size={20} className="fill-black ml-0.5" />
            )}
          </button>
        </div>

        <p
          className={`text-[14px] font-bold truncate mt-2.5 ${
            isSelected ? 'text-[#1DB954]' : 'text-white'
          }`}
        >
          {song.title}
        </p>
        <p className="text-[13px] text-[#B3B3B3] truncate mt-0.5">{song.artist}</p>
      </div>
    );
  };

  // ========================
  // SUB-VIEW 1: PLAYLIST PAGE
  // ========================
  if (activePlaylistDef) {
    const plSongs = getPlaylistSongs(activePlaylistDef);
    const collage = getDistinctCollageCovers(
      plSongs,
      activePlaylistDef.isLikedCollection ? [] : catalogTracks
    );
    return (
      <div className="min-h-screen bg-[#121212] text-white pb-[190px] select-none">
        <div className="bg-[#181818] border-b border-white/10 px-4 pt-4 pb-6">
          <button
            type="button"
            onClick={() => setSelectedPlaylistId(null)}
            className="w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center cursor-pointer mb-4"
            aria-label="Kembali"
          >
            <ChevronLeft size={24} />
          </button>

          <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center sm:items-end gap-5">
            <div
              className={`w-[180px] h-[180px] rounded-xl overflow-hidden bg-[#737373] shadow-2xl shrink-0 grid ${
                collage.length >= 4 ? 'grid-cols-2 grid-rows-2' : 'grid-cols-1 grid-rows-1'
              }`}
            >
              {activePlaylistDef.isLikedCollection && collage.length === 0 ? (
                <div className="flex items-center justify-center w-full h-full bg-[#525252]">
                  <Heart size={52} className="text-black fill-black" />
                </div>
              ) : collage.length >= 4 ? (
                collage.map((c, idx) => (
                  <MusicCoverImg
                    key={`${c.id}_${idx}`}
                    src={c.thumbnail}
                    alt={c.title || activePlaylistDef.title}
                    iconSize={26}
                    loading="eager"
                  />
                ))
              ) : (
                <MusicCoverImg
                  src={collage[0]?.thumbnail}
                  alt={activePlaylistDef.title}
                  iconSize={48}
                  loading="eager"
                />
              )}
            </div>
            <div className="text-center sm:text-left min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-widest text-white/80">PLAYLIST</p>
              <h1 className="text-3xl sm:text-4xl font-extrabold text-white mt-1">
                {activePlaylistDef.title}
              </h1>
              <p className="text-sm text-[#B3B3B3] mt-1.5">{activePlaylistDef.subtitle}</p>
              <p className="text-xs text-white/80 font-semibold mt-2 tabular-nums">
                {plSongs.length} lagu
              </p>
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              {plSongs.length > 0 && (
                <button
                  type="button"
                  onClick={() => handleDownloadCollection(plSongs)}
                  className="h-11 px-4 rounded-full bg-[#282828] hover:bg-[#333333] border border-white/15 text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer active:scale-95 transition"
                >
                  <Download size={15} className="text-[#1DB954]" />
                  <span>Download Semua</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => plSongs[0] && handleSelectCatalogSong(plSongs[0], plSongs)}
                className="w-[56px] h-[56px] rounded-full bg-[#1DB954] text-black flex items-center justify-center shadow-xl hover:scale-105 active:scale-95 transition cursor-pointer shrink-0"
                aria-label="Putar Playlist"
              >
                <Play size={24} className="fill-black ml-0.5" />
              </button>
            </div>
          </div>
          {batchDownloadLabel && (
            <p className="max-w-5xl mx-auto mt-3 text-xs font-bold text-[#1DB954] text-center sm:text-left">
              {batchDownloadLabel}
            </p>
          )}
        </div>

        <div className="max-w-5xl mx-auto px-3 pt-2 space-y-1">
          {plSongs.length === 0 ? (
            <div className="p-8 text-center text-sm text-[#B3B3B3] bg-[#181818] rounded-xl">
              Belum ada lagu di playlist ini. Klik ikon hati pada lagu untuk menyimpannya.
            </div>
          ) : (
            plSongs.map((song, idx) => renderSpotifyTrackRow(song, idx, plSongs))
          )}
        </div>
      </div>
    );
  }

  // ========================
  // SUB-VIEW 2: ARTIST PAGE
  // ========================
  if (activeArtistObj) {
    return (
      <div className="min-h-screen bg-[#121212] text-white pb-[190px] select-none">
        <div className="bg-[#181818] border-b border-white/10 px-4 pt-4 pb-6">
          <button
            type="button"
            onClick={() => setSelectedArtistName(null)}
            className="w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center cursor-pointer mb-4"
            aria-label="Kembali"
          >
            <ChevronLeft size={24} />
          </button>

          <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center sm:items-end gap-5">
            <div className="w-[150px] h-[150px] rounded-full overflow-hidden bg-[#737373] shadow-2xl shrink-0 border-2 border-white/10">
              <MusicCoverImg src={activeArtistObj.photo} alt={activeArtistObj.name} iconSize={48} loading="eager" />
            </div>

            <div className="text-center sm:text-left min-w-0 flex-1">
              <div className="inline-flex items-center gap-1.5 text-xs font-bold text-sky-400">
                <CheckCircle2 size={15} />
                <span>Artis Terverifikasi</span>
              </div>
              <h1 className="text-3xl sm:text-5xl font-extrabold text-white mt-1 truncate">
                {activeArtistObj.name}
              </h1>
              <p className="text-sm text-[#B3B3B3] mt-1.5 tabular-nums">
                {activeArtistObj.songs.length} lagu tersedia gratis
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => {
                  const list = activeArtistObj.songs;
                  if (list.length > 0) {
                    const rnd = list[Math.floor(Math.random() * list.length)];
                    handleSelectCatalogSong(rnd, list);
                  }
                }}
                className="w-12 h-12 rounded-full bg-[#282828] hover:bg-[#383838] text-[#1DB954] flex items-center justify-center cursor-pointer"
                aria-label="Acak Lagu Artis"
              >
                <Shuffle size={20} />
              </button>
              <button
                type="button"
                onClick={() =>
                  activeArtistObj.songs[0] &&
                  handleSelectCatalogSong(activeArtistObj.songs[0], activeArtistObj.songs)
                }
                className="w-[56px] h-[56px] rounded-full bg-[#1DB954] text-black flex items-center justify-center shadow-xl hover:scale-105 active:scale-95 transition cursor-pointer"
                aria-label="Putar Lagu Artis"
              >
                <Play size={24} className="fill-black ml-0.5" />
              </button>
            </div>
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-4 pt-3 space-y-6">
          <section>
            <h2 className="text-[20px] font-bold text-white mb-2">Populer</h2>
            <div className="space-y-1">
              {activeArtistObj.songs.map((song, idx) =>
                renderSpotifyTrackRow(song, idx, activeArtistObj.songs)
              )}
            </div>
          </section>

          {activeArtistObj.albums.length > 0 && (
            <section>
              <h2 className="text-[20px] font-bold text-white mb-3">Diskografi Album</h2>
              <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
                {activeArtistObj.albums.map((alb) => (
                  <button
                    key={alb.key}
                    type="button"
                    onClick={() => {
                      setSelectedArtistName(null);
                      setSelectedAlbumKey(alb.key);
                    }}
                    className="w-[150px] shrink-0 bg-[#181818] hover:bg-[#282828] rounded-xl p-2.5 text-left cursor-pointer"
                  >
                    <div className="w-full aspect-square rounded-lg overflow-hidden bg-[#282828]">
                      <img
                        src={alb.cover}
                        alt={alb.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <p className="text-sm font-bold text-white truncate mt-2">{alb.title}</p>
                    <p className="text-xs text-[#B3B3B3] truncate">
                      {alb.year} · {alb.songs.length} lagu
                    </p>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    );
  }

  // ========================
  // SUB-VIEW 3: ALBUM PAGE
  // ========================
  if (activeAlbumObj) {
    return (
      <div className="min-h-screen bg-[#121212] text-white pb-[190px] select-none">
        <div className="bg-[#181818] border-b border-white/10 px-4 pt-4 pb-6">
          <button
            type="button"
            onClick={() => setSelectedAlbumKey(null)}
            className="w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center cursor-pointer mb-4"
            aria-label="Kembali"
          >
            <ChevronLeft size={24} />
          </button>

          <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center sm:items-end gap-5">
            <div className="w-[180px] h-[180px] rounded-xl overflow-hidden bg-[#737373] shadow-2xl shrink-0">
              <MusicCoverImg src={activeAlbumObj.cover} alt={activeAlbumObj.title} iconSize={48} loading="eager" />
            </div>

            <div className="text-center sm:text-left min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-widest text-[#B3B3B3]">ALBUM</p>
              <h1 className="text-2xl sm:text-4xl font-extrabold text-white mt-1">
                {activeAlbumObj.title}
              </h1>
              <button
                type="button"
                onClick={() => {
                  setSelectedAlbumKey(null);
                  setSelectedArtistName(activeAlbumObj.artist);
                }}
                className="text-sm font-bold text-white hover:underline mt-1.5 cursor-pointer"
              >
                {activeAlbumObj.artist}
              </button>
              <p className="text-xs text-[#B3B3B3] mt-1 tabular-nums">
                {activeAlbumObj.year} · {activeAlbumObj.songs.length} lagu
              </p>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              {activeAlbumObj.songs.length > 0 && (
                <button
                  type="button"
                  onClick={() => handleDownloadCollection(activeAlbumObj.songs)}
                  className="h-11 px-4 rounded-full bg-[#282828] hover:bg-[#333333] border border-white/15 text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer active:scale-95 transition"
                >
                  <Download size={15} className="text-[#1DB954]" />
                  <span>Download Semua</span>
                </button>
              )}
              <button
                type="button"
                onClick={() =>
                  activeAlbumObj.songs[0] &&
                  handleSelectCatalogSong(activeAlbumObj.songs[0], activeAlbumObj.songs)
                }
                className="w-[56px] h-[56px] rounded-full bg-[#1DB954] text-black flex items-center justify-center shadow-xl hover:scale-105 active:scale-95 transition cursor-pointer shrink-0"
                aria-label="Putar Album"
              >
                <Play size={24} className="fill-black ml-0.5" />
              </button>
            </div>
          </div>
          {batchDownloadLabel && (
            <p className="max-w-5xl mx-auto mt-3 text-xs font-bold text-[#1DB954] text-center sm:text-left">
              {batchDownloadLabel}
            </p>
          )}
        </div>

        <div className="max-w-5xl mx-auto px-3 pt-2 space-y-1">
          {activeAlbumObj.songs.map((song, idx) =>
            renderSpotifyTrackRow(song, idx, activeAlbumObj.songs)
          )}
        </div>
      </div>
    );
  }

  // ========================
  // MAIN 100% SPOTIFY HOME + SEARCH EXPERIENCE (NO BANNER!)
  // ========================
  const isSearchMode = Boolean(activeTerm || searchQuery.trim());
  const chipLower = activeCategory.toLowerCase();

  return (
    <div className="min-h-screen bg-[#121212] text-white pb-[190px] select-none">
      {/* 1. HEADER SPOTIFY (40x40 User Avatar + Hi, User Name + Top-Right Unduhan Menu ONLY) */}
      <header className="bg-[#181818] px-4 pt-3.5 pb-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-[40px] h-[40px] rounded-full bg-[#282828] border border-white/10 overflow-hidden flex items-center justify-center shrink-0">
              {userPhoto ? (
                <img
                  src={userPhoto}
                  alt={displayUserName}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-base font-bold text-white">{userInitial}</span>
              )}
            </div>
            <h1 className="text-[22px] sm:text-[24px] font-bold tracking-tight text-white truncate">
              Hi, {displayUserName}
            </h1>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {currentTrack && (
              <button
                type="button"
                onClick={() => setIsFullPlayerOpen(true)}
                className="h-9 px-3 rounded-full bg-[#1DB954] text-black text-xs font-bold flex items-center gap-1.5 cursor-pointer active:scale-95 transition whitespace-nowrap"
                title="Buka Full Player"
              >
                <Maximize2 size={14} />
                <span className="hidden sm:inline">Full Player</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 space-y-5">
        {/* 2. SEARCH BAR SPOTIFY (#2A2A2A, height 52px + white Cari pill) */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (searchQuery.trim()) {
              setActiveCategory(searchQuery.trim());
              runMusicSearch(searchQuery);
            } else {
              loadTrendingSongs();
            }
          }}
          className="flex items-center gap-2.5"
        >
          <div className="flex-1 bg-[#2A2A2A] rounded-full px-4 h-[52px] flex items-center gap-3 border border-transparent focus-within:border-white/50 transition min-w-0">
            <Search size={20} className="text-white/80 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                const val = e.target.value;
                setSearchQuery(val);
                if (!val.trim()) {
                  setActiveCategory('Semua');
                  loadTrendingSongs();
                }
              }}
              placeholder="Cari lagu, artis, album..."
              className="bg-transparent flex-1 text-[15px] text-white placeholder-[#B3B3B3] outline-none min-w-0"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setActiveCategory('Semua');
                  loadTrendingSongs();
                }}
                className="w-8 h-8 flex items-center justify-center text-[#B3B3B3] hover:text-white cursor-pointer"
                aria-label="Hapus pencarian"
              >
                <X size={18} />
              </button>
            )}
          </div>
          <button
            type="submit"
            className="h-[52px] px-6 rounded-full bg-white text-black font-bold text-[15px] hover:bg-white/90 active:scale-95 transition cursor-pointer shrink-0 whitespace-nowrap"
          >
            Cari
          </button>
        </form>

        {/* 3. CATEGORY CHIPS (height 36px, horizontal scroll) */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          {CATEGORY_CHIPS.map((tag) => {
            const isActive = activeCategory.toLowerCase() === tag.toLowerCase();
            return (
              <button
                key={tag}
                type="button"
                onClick={() => {
                  setActiveCategory(tag);
                  if (tag === 'Semua' || tag === 'Musik') {
                    setSearchQuery('');
                    loadTrendingSongs();
                  } else if (tag === 'Playlist' || tag === 'Artis' || tag === 'Album') {
                    setSearchQuery('');
                    if (catalogTracks.length === 0) loadTrendingSongs();
                  } else {
                    setSearchQuery(tag);
                    runMusicSearch(tag);
                  }
                }}
                className={`h-[36px] px-4 rounded-full text-[13px] font-bold whitespace-nowrap shrink-0 cursor-pointer active:scale-95 transition flex items-center ${
                  isActive
                    ? 'bg-[#1DB954] text-black'
                    : 'bg-[#2A2A2A] text-white hover:bg-[#383838]'
                }`}
              >
                {tag}
              </button>
            );
          })}
        </div>

        {/* 4. UNIFIED PILL PASTE LINK TIKTOK + PUTAR BAR (52px height, #1E1E1E + #1DB954) */}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (isFetchingInfo) return;
            if (!linkInput.trim()) {
              const pasted = await handleQuickPasteFromClipboard(true);
              if (!pasted) {
                linkInputRef.current?.focus();
              }
              return;
            }
            await handleInspectAndPlay(undefined, linkInput);
          }}
          className="!mt-3 !mb-3 h-[52px] box-border rounded-[26px] bg-[#1E1E1E] border border-[#2A2A2A] shadow-[0_2px_8px_rgba(0,0,0,0.2)] pl-[16px] pr-[6px] py-[7px] flex items-center gap-[12px]"
        >
          <div
            onClick={() => {
              if (!linkInput.trim()) {
                void handleQuickPasteFromClipboard(false);
              }
              linkInputRef.current?.focus();
            }}
            className="flex-1 min-w-0 bg-transparent flex items-center gap-[8px] cursor-text"
          >
            <LinkIcon size={20} className="text-[#1DB954] shrink-0" />
            <input
              ref={linkInputRef}
              type="text"
              placeholder="Paste link TikTok..."
              value={linkInput}
              onChange={(e) => setLinkInput(e.target.value)}
              className="bg-transparent flex-1 text-[14px] font-medium text-white placeholder-[#B3B3B3] outline-none min-w-0"
            />
          </div>
          <button
            type="submit"
            disabled={isFetchingInfo}
            className={`h-[36px] px-4 rounded-[20px] bg-[#1DB954] text-black font-bold text-[14px] active:scale-95 transition cursor-pointer shrink-0 flex items-center justify-center gap-1.5 whitespace-nowrap ${
              linkInput.trim() ? 'opacity-100 hover:brightness-105' : 'opacity-60 hover:opacity-80'
            }`}
          >
            {isFetchingInfo ? (
              <>
                <Loader2 size={18} className="animate-spin text-black shrink-0" />
                <span>Memuat</span>
              </>
            ) : (
              <>
                <Play size={20} className="text-black fill-black shrink-0" />
                <span>Putar</span>
              </>
            )}
          </button>
        </form>

        {/* TikTok Error UI with Retry + Search YouTube by Title */}
        {tiktokError && (
          <div className="bg-red-500/15 border border-red-500/40 rounded-xl p-3 space-y-2.5">
            <div className="flex items-start gap-2 text-xs font-bold text-red-200">
              <AlertTriangle size={16} className="text-red-400 shrink-0 mt-0.5" />
              <span>❌ {tiktokError}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleInspectAndPlay(undefined, lastFailedTiktokUrl || linkInput)}
                className="px-3.5 py-1.5 rounded-full bg-white text-black text-xs font-bold flex items-center gap-1.5 cursor-pointer active:scale-95 transition"
              >
                <RefreshCw size={12} />
                <span>Coba Lagi</span>
              </button>
              <button
                type="button"
                onClick={handleSearchYoutubeFallbackFromTiktok}
                className="px-3.5 py-1.5 rounded-full bg-[#1DB954] text-black text-xs font-bold flex items-center gap-1.5 cursor-pointer active:scale-95 transition"
              >
                <Search size={12} />
                <span>Cari di YouTube dengan judul yang sama</span>
              </button>
              <button
                type="button"
                onClick={() => setTiktokError(null)}
                className="ml-auto text-xs text-red-200/80 hover:text-white px-2 py-1 cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        )}

        {/* Download Notice (WiFi-only block or error) */}
        {downloadNotice && (
          <div className="bg-amber-500/15 border border-amber-500/40 rounded-xl px-3 py-2 flex items-center justify-between gap-2 text-xs text-amber-200">
            <span>{downloadNotice}</span>
            <button
              type="button"
              onClick={() => setDownloadNotice(null)}
              className="text-amber-200 hover:text-white cursor-pointer"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* OFFLINE MODE ONLY VIEW: Shows exclusively downloaded IndexedDB tracks */}
        {musicSettings.offlineMode && (
          <div className="bg-[#181818] border border-[#1DB954]/40 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <WifiOff size={18} className="text-[#1DB954]" />
                <div>
                  <h2 className="text-base font-bold text-white">
                    Mode Offline Aktif ({offlineCatalogSongs.length} lagu)
                  </h2>
                  <p className="text-xs text-[#B3B3B3]">
                    Hanya menampilkan lagu terdownload • Bisa diputar tanpa internet
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => updateMusicSettings({ offlineMode: false })}
                className="px-3 py-1.5 rounded-full bg-[#282828] hover:bg-[#333333] text-xs font-bold text-white cursor-pointer"
              >
                Mode Online
              </button>
            </div>

            {offlineCatalogSongs.length === 0 ? (
              <div className="p-6 text-center text-sm text-[#B3B3B3] bg-[#121212] rounded-xl">
                Belum ada lagu didownload. Matikan Mode Offline untuk mendownload lagu terlebih dahulu.
              </div>
            ) : (
              <div className="space-y-1">
                {offlineCatalogSongs.map((song, idx) =>
                  renderSpotifyTrackRow(song, idx, offlineCatalogSongs)
                )}
              </div>
            )}
          </div>
        )}

        {/* 5. SEARCH TABS (Lagu / Artis / Album / Playlist) WHEN SEARCHING */}
        {!musicSettings.offlineMode && isSearchMode && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 border-b border-white/10 pb-2 overflow-x-auto no-scrollbar">
              {SEARCH_TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSearchTab(t.id)}
                  className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap cursor-pointer transition ${
                    searchTab === t.id
                      ? 'bg-white text-black'
                      : 'bg-[#282828] text-[#B3B3B3] hover:text-white'
                  }`}
                >
                  {t.label}
                </button>
              ))}
              <span className="ml-auto text-xs font-semibold text-[#B3B3B3] tabular-nums whitespace-nowrap">
                {displayTotalSongs.toLocaleString('id-ID')} hasil
              </span>
            </div>

            {isSearchingCatalog ? (
              <div className="py-12 bg-[#181818] rounded-2xl flex flex-col items-center justify-center text-[#B3B3B3] gap-3 text-sm">
                <Loader2 size={28} className="animate-spin text-[#1DB954]" />
                <span>Mencari lagu di katalog global...</span>
              </div>
            ) : searchTab === 'artis' ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-4">
                {artistsList.map((art) => (
                  <button
                    key={art.name}
                    type="button"
                    onClick={() => setSelectedArtistName(art.name)}
                    className="bg-[#181818] hover:bg-[#282828] rounded-xl p-3 flex flex-col items-center text-center cursor-pointer transition"
                  >
                    <div className="w-[120px] h-[120px] rounded-full overflow-hidden bg-[#737373]">
                      <MusicCoverImg src={art.photo} alt={art.name} iconSize={32} loading="lazy" />
                    </div>
                    <p className="text-[15px] font-bold text-white truncate w-full mt-2.5">
                      {art.name}
                    </p>
                    <p className="text-xs text-[#B3B3B3]">Artis · {art.songs.length} lagu</p>
                  </button>
                ))}
              </div>
            ) : searchTab === 'album' ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {albumsList.map((alb) => (
                  <button
                    key={alb.key}
                    type="button"
                    onClick={() => setSelectedAlbumKey(alb.key)}
                    className="bg-[#181818] hover:bg-[#282828] rounded-xl p-3 text-left cursor-pointer transition"
                  >
                    <div className="w-full aspect-square rounded-lg overflow-hidden bg-[#737373]">
                      <MusicCoverImg src={alb.cover} alt={alb.title} iconSize={32} loading="lazy" />
                    </div>
                    <p className="text-sm font-bold text-white truncate mt-2">{alb.title}</p>
                    <p className="text-xs text-[#B3B3B3] truncate">
                      {alb.year} · {alb.artist}
                    </p>
                  </button>
                ))}
              </div>
            ) : searchTab === 'playlist' ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {allPlaylists.map((pl) => renderPlaylistCard(pl))}
              </div>
            ) : catalogTracks.length === 0 ? (
              <div className="py-10 text-center text-sm text-[#B3B3B3] bg-[#181818] rounded-xl px-4">
                Lagu tidak ditemukan. Coba kata kunci lain seperti Taylor Swift, Bernadya, atau Hindia.
              </div>
            ) : (
              <div className="space-y-1">
                {catalogTracks.map((song, idx) => renderSpotifyTrackRow(song, idx, catalogTracks))}
              </div>
            )}
          </div>
        )}

        {/* 6. DEFAULT SPOTIFY SECTIONS */}
        {!musicSettings.offlineMode && !isSearchMode && (
          <div className="space-y-8">
            {/* Quick Filter Shortcuts when chip Playlist / Artis / Album selected */}
            {(chipLower === 'semua' || chipLower === 'playlist') && (
              <section className="space-y-3">
                <h2 className="text-[20px] font-bold text-white">Dibuat Untuk Kamu</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {MADE_FOR_YOU_PLAYLISTS.map((pl) => renderPlaylistCard(pl))}
                </div>
              </section>
            )}

            {(chipLower === 'semua' || chipLower === 'musik') && (
              <>
                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-[20px] font-bold text-white">Trending Sekarang</h2>
                    <span className="text-xs font-semibold text-[#B3B3B3] tabular-nums">
                      {trendingCarousel.length} lagu
                    </span>
                  </div>
                  {isSearchingCatalog && trendingCarousel.length === 0 ? (
                    <div className="py-8 flex items-center justify-center gap-2 text-sm text-[#B3B3B3]">
                      <Loader2 size={20} className="animate-spin text-[#1DB954]" />
                      <span>Memuat Trending Sekarang...</span>
                    </div>
                  ) : (
                    <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
                      {trendingCarousel.map((song, idx) =>
                        renderHorizontalSongCard(song, idx, trendingCarousel)
                      )}
                    </div>
                  )}
                </section>

                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-[20px] font-bold text-white">Lagu Viral TikTok</h2>
                    <span className="text-xs font-semibold text-[#B3B3B3] tabular-nums">
                      {viralCarousel.length} lagu
                    </span>
                  </div>
                  <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
                    {viralCarousel.map((song, idx) =>
                      renderHorizontalSongCard(song, idx, viralCarousel)
                    )}
                  </div>
                </section>
              </>
            )}

            {(chipLower === 'semua' || chipLower === 'artis') && (
              <section className="space-y-3">
                <h2 className="text-[20px] font-bold text-white">Artis Populer</h2>
                <div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar">
                  {artistsList.map((art) => (
                    <button
                      key={art.name}
                      type="button"
                      onClick={() => setSelectedArtistName(art.name)}
                      className="w-[144px] shrink-0 flex flex-col items-center text-center cursor-pointer group active:scale-95 transition"
                    >
                      <div className="w-[140px] h-[140px] rounded-full overflow-hidden bg-[#737373] shadow-lg border border-white/10 group-hover:border-[#1DB954]">
                        <MusicCoverImg src={art.photo} alt={art.name} iconSize={40} loading="lazy" />
                      </div>
                      <p className="text-[16px] font-bold text-white truncate w-full mt-2.5">
                        {art.name}
                      </p>
                      <p className="text-[14px] text-[#B3B3B3]">Artis</p>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {(chipLower === 'semua' || chipLower === 'album') && albumsList.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-[20px] font-bold text-white">Album Populer</h2>
                <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
                  {albumsList.map((alb) => (
                    <button
                      key={alb.key}
                      type="button"
                      onClick={() => setSelectedAlbumKey(alb.key)}
                      className="w-[160px] shrink-0 bg-[#181818] hover:bg-[#282828] rounded-xl p-2.5 text-left cursor-pointer transition active:scale-[0.98]"
                    >
                      <div className="w-full aspect-square rounded-lg overflow-hidden bg-[#737373] shadow-md">
                        <MusicCoverImg src={alb.cover} alt={alb.title} iconSize={36} loading="lazy" />
                      </div>
                      <p className="text-[14px] font-bold text-white truncate mt-2.5">
                        {alb.title}
                      </p>
                      <p className="text-[13px] text-[#B3B3B3] truncate mt-0.5">
                        {alb.year} · {alb.artist}
                      </p>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {(chipLower === 'semua' || chipLower === 'playlist') && (
              <section className="space-y-3">
                <h2 className="text-[20px] font-bold text-white">Playlist Untuk Kamu</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {CURATED_FOR_YOU_PLAYLISTS.map((pl) => renderPlaylistCard(pl))}
                </div>
              </section>
            )}

            {/* SEMUA LAGU (100.000+ Lagu Global + Infinite Scroll) */}
            {(chipLower === 'semua' || chipLower === 'musik') && (
              <section className="space-y-3">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="text-[20px] font-bold text-white">Semua Lagu</h2>
                  <span className="text-xs font-bold text-[#1DB954] tabular-nums whitespace-nowrap">
                    {displayTotalSongs >= 100000
                      ? '100.000+ lagu'
                      : `${displayTotalSongs.toLocaleString('id-ID')} lagu`}
                  </span>
                </div>

                {isSearchingCatalog && catalogTracks.length === 0 ? (
                  <div className="py-12 bg-[#181818] rounded-xl flex flex-col items-center justify-center text-[#B3B3B3] gap-3 text-sm">
                    <Loader2 size={28} className="animate-spin text-[#1DB954]" />
                    <span>Memuat 100.000+ katalog lagu global...</span>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {catalogTracks.map((song, idx) =>
                      renderSpotifyTrackRow(song, idx, catalogTracks)
                    )}
                  </div>
                )}
              </section>
            )}
          </div>
        )}

        {/* INFINITE SCROLL SENTINEL (+50 Lagu per scroll, bebas mentok 1.381) */}
        {!musicSettings.offlineMode && hasMoreCatalog && catalogTracks.length > 0 && (
          <div ref={loadMoreTriggerRef} className="py-4 flex flex-col items-center gap-2">
            {isLoadingMore ? (
              <div className="flex items-center gap-2 text-sm text-[#B3B3B3]">
                <Loader2 size={18} className="animate-spin text-[#1DB954]" />
                <span>Memuat 50 lagu global berikutnya...</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={loadMoreCatalogSongs}
                className="px-5 py-2.5 rounded-full bg-[#2A2A2A] hover:bg-[#383838] text-white text-sm font-bold cursor-pointer transition"
              >
                Muat 50 Lagu Lagi ({catalogTracks.length.toLocaleString('id-ID')} dimuat ·{' '}
                {displayTotalSongs >= 100000 ? '100.000+' : displayTotalSongs.toLocaleString('id-ID')})
              </button>
            )}
          </div>
        )}

        {/* RIWAYAT MUSIK & TIKTOK */}
        <section className="space-y-3 pt-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-base font-bold text-white">
              <ListMusic size={20} className="text-[#1DB954]" />
              <span>Riwayat Musik ({historyTracks.length})</span>
            </div>
            {currentTrack && (
              <button
                type="button"
                onClick={onDeleteCurrent}
                className="text-xs text-red-300 hover:text-red-200 flex items-center gap-1.5 cursor-pointer bg-red-500/15 px-3.5 py-2 rounded-full border border-red-500/25 active:scale-95 transition whitespace-nowrap"
              >
                <Trash2 size={14} />
                <span>Hapus Lagu Aktif</span>
              </button>
            )}
          </div>

          {historyTracks.length === 0 ? (
            <div className="bg-[#181818] rounded-xl p-6 text-center text-sm text-[#B3B3B3]">
              Belum ada riwayat musik. Putar lagu atau paste link TikTok di atas.
            </div>
          ) : (
            <div className="space-y-1.5">
              {historyTracks.map((item) => {
                const isSelected = currentTrack?.id === item.id || currentTrack?.title === item.title;
                const replayTrack: TrackData = {
                  id: item.id,
                  title: item.title,
                  thumbnail: item.thumbnail,
                  cover: item.thumbnail,
                  url: item.videoUrl || item.audioUrl || item.previewUrl || item.sourceUrl,
                  videoUrl: item.videoUrl,
                  audioUrl: item.audioUrl || item.previewUrl,
                  previewUrl: item.previewUrl,
                  youtubeId: item.youtubeId,
                  playbackMode: item.playbackMode,
                  isCatalogSearch: Boolean(
                    item.isCatalogSearch ||
                      item.sourceType === 'itunes' ||
                      item.sourceType === 'deezer' ||
                      item.sourceType === 'jamendo'
                  ),
                  album: item.album,
                  durationMs: item.durationMs,
                  source: item.sourceType,
                  sourceType: item.sourceType,
                  author: item.author,
                  artist: item.author,
                  sourceUrl: item.sourceUrl,
                };
                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      ++activePlaySessionRef.current;
                      onPlayTrack(replayTrack);
                    }}
                    className="bg-[#181818] hover:bg-[#282828] rounded-xl p-2.5 flex items-center justify-between gap-3 cursor-pointer transition"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-[52px] h-[52px] rounded-lg overflow-hidden bg-[#737373] shrink-0 flex items-center justify-center">
                        <MusicCoverImg src={item.thumbnail} alt={item.title} iconSize={20} loading="lazy" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-[15px] font-bold truncate leading-snug ${
                            isSelected ? 'text-[#1DB954]' : 'text-white'
                          }`}
                        >
                          {item.title}
                        </p>
                        <p className="text-[13px] text-[#B3B3B3] truncate mt-0.5">
                          {item.author} ·{' '}
                          {item.sourceType === 'tiktok'
                            ? 'TikTok'
                            : item.sourceType === 'youtube'
                            ? 'YouTube'
                            : 'VN Music'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => {
                          ++activePlaySessionRef.current;
                          if (isSelected) onTogglePlay();
                          else onPlayTrack(replayTrack);
                        }}
                        className="w-11 h-11 rounded-full bg-[#1DB954] text-black flex items-center justify-center transition active:scale-95 cursor-pointer"
                        aria-label={isSelected && isPlaying ? 'Pause' : 'Play'}
                      >
                        {isSelected && isPlaying ? (
                          <Pause size={16} className="fill-black" />
                        ) : (
                          <Play size={16} className="fill-black ml-0.5" />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={(e) => handleDeleteHistoryItem(e, item.id)}
                        className="w-10 h-10 rounded-full flex items-center justify-center text-[#B3B3B3] hover:text-red-400 hover:bg-white/5 transition cursor-pointer"
                        aria-label="Hapus Dari Riwayat"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* MENU UNDUHAN OFFLINE (Top-Right Download Icon) */}
      {showDownloadsModal && (
        <div className="fixed inset-0 z-[10055] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#181818] border border-white/10 rounded-2xl max-w-lg w-full max-h-[88vh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between shrink-0">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Download size={19} className="text-[#1DB954]" />
                <span>Unduhan</span>
              </h3>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowDownloadPrefs((v) => !v)}
                  className={`h-8 px-2.5 rounded-full text-xs font-semibold flex items-center gap-1 cursor-pointer transition ${
                    showDownloadPrefs
                      ? 'bg-[#1DB954] text-black'
                      : 'bg-[#282828] text-[#B3B3B3] hover:text-white'
                  }`}
                  title="Preferensi Audio & Offline"
                >
                  <SlidersHorizontal size={14} />
                  <span>Preferensi</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowDownloadsModal(false);
                    setCacheNotice(null);
                  }}
                  className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center cursor-pointer"
                  aria-label="Tutup Menu Unduhan"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto text-sm">
              {/* 1. Offline Downloads Summary */}
              <div className="bg-[#1DB954]/15 border border-[#1DB954]/40 rounded-xl p-3.5 flex items-center justify-between gap-3">
                <div className="space-y-0.5 min-w-0">
                  <p className="text-sm font-bold text-[#1DB954] flex items-center gap-2">
                    <WifiOff size={15} />
                    <span>
                      {offlineTracks.length} Lagu Offline ·{' '}
                      {formatBytesMb(offlineTracks.reduce((acc, t) => acc + (t.sizeBytes || 0), 0))}
                    </span>
                  </p>
                  <p className="text-xs text-white/75">
                    Musik yang sudah diunduh tersimpan lokal dan bisa diputar tanpa internet.
                  </p>
                </div>
                {offlineTracks.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const list = offlineCatalogSongs;
                      if (list[0]) {
                        setPlaylist(
                          list.map((s) => toCatalogTrackData(s, 'offline'))
                        );
                        onPlayTrack(toCatalogTrackData(list[0], 'offline'));
                        setShowDownloadsModal(false);
                      }
                    }}
                    className="h-9 px-3.5 rounded-full bg-[#1DB954] text-black text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer active:scale-95 transition"
                  >
                    <Play size={14} className="fill-black" />
                    <span>Putar Semua</span>
                  </button>
                )}
              </div>

              {/* Quick Offline Mode Toggle */}
              <button
                type="button"
                onClick={() => updateMusicSettings({ offlineMode: !musicSettings.offlineMode })}
                className="w-full p-3 rounded-xl bg-[#242424] hover:bg-[#2C2C2C] flex items-center justify-between gap-3 text-left cursor-pointer transition"
              >
                <div className="flex items-start gap-2.5 min-w-0 flex-1">
                  <WifiOff size={17} className="text-[#1DB954] shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white">
                      Mode Offline - Hanya Putar Lagu Unduhan
                    </p>
                    <p className="text-[11px] text-[#B3B3B3] mt-0.5">
                      Putar musik dari penyimpanan offline tanpa kuota internet
                    </p>
                  </div>
                </div>
                <span
                  className={`w-11 h-6 rounded-full p-0.5 transition shrink-0 flex items-center ${
                    musicSettings.offlineMode ? 'bg-[#1DB954] justify-end' : 'bg-white/20 justify-start'
                  }`}
                >
                  <span className="w-5 h-5 rounded-full bg-white shadow" />
                </span>
              </button>

              {/* 2. Downloaded Music List (Playable Offline) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-wider text-[#B3B3B3]">
                    Musik Yang Sudah Diunduh ({offlineTracks.length})
                  </p>
                  {offlineTracks.length > 0 && (
                    <button
                      type="button"
                      onClick={async () => {
                        await clearAllOfflineDownloads();
                        setCacheNotice('Semua lagu unduhan dihapus!');
                      }}
                      className="text-[11px] font-bold text-red-300 hover:text-red-200 cursor-pointer"
                    >
                      Hapus Semua
                    </button>
                  )}
                </div>

                {offlineTracks.length === 0 ? (
                  <div className="bg-[#121212] border border-white/10 rounded-xl p-6 text-center space-y-2">
                    <Download size={28} className="mx-auto text-[#737373]" />
                    <p className="text-sm font-bold text-white">Belum Ada Lagu Diunduh</p>
                    <p className="text-xs text-[#B3B3B3]">
                      Tekan ikon unduhan pada lagu mana saja untuk menyimpannya dan memutarnya secara offline.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
                    {offlineTracks.map((tr) => {
                      const isSelected = currentTrack?.id === tr.id;
                      const offlineSong: CatalogSong = {
                        id: tr.id,
                        title: tr.title,
                        artist: tr.artist,
                        album: tr.album || 'Offline',
                        thumbnail: tr.thumbnail,
                        previewUrl: '',
                        durationMs: (tr.durationSec || 180) * 1000,
                        source: 'offline',
                        sourceUrl: '',
                        youtubeId: tr.youtubeId,
                      };
                      return (
                        <div
                          key={tr.id}
                          onClick={() => {
                            setPlaylist(
                              offlineCatalogSongs.map((s) => toCatalogTrackData(s, 'offline'))
                            );
                            onPlayTrack(toCatalogTrackData(offlineSong, 'offline'));
                            setShowDownloadsModal(false);
                          }}
                          className={`rounded-xl p-2.5 flex items-center justify-between gap-2.5 cursor-pointer transition ${
                            isSelected ? 'bg-[#282828]' : 'bg-[#242424] hover:bg-[#2C2C2C]'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <div className="w-11 h-11 rounded-md overflow-hidden bg-[#737373] shrink-0">
                              <MusicCoverImg src={tr.thumbnail} alt={tr.title} iconSize={18} loading="lazy" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p
                                className={`text-sm font-bold truncate ${
                                  isSelected ? 'text-[#1DB954]' : 'text-white'
                                }`}
                              >
                                {tr.title}
                              </p>
                              <p className="text-xs text-[#B3B3B3] truncate">
                                {tr.artist} · {formatBytesMb(tr.sizeBytes)} · Offline
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => {
                                if (isSelected) {
                                  onTogglePlay();
                                } else {
                                  setPlaylist(
                                    offlineCatalogSongs.map((s) => toCatalogTrackData(s, 'offline'))
                                  );
                                  onPlayTrack(toCatalogTrackData(offlineSong, 'offline'));
                                  setShowDownloadsModal(false);
                                }
                              }}
                              className="w-9 h-9 rounded-full bg-[#1DB954] text-black flex items-center justify-center cursor-pointer active:scale-95 transition"
                              title={isSelected && isPlaying ? 'Pause' : 'Putar Offline'}
                            >
                              {isSelected && isPlaying ? (
                                <Pause size={15} className="fill-black" />
                              ) : (
                                <Play size={15} className="fill-black ml-0.5" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => removeOfflineTrack(tr.id)}
                              className="w-8 h-8 rounded-full hover:bg-red-500/20 text-[#B3B3B3] hover:text-red-300 flex items-center justify-center cursor-pointer"
                              title="Hapus Unduhan"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 3. Collapsible Audio & Download Preferences */}
              {showDownloadPrefs && (
                <div className="pt-3 border-t border-white/10 space-y-4">
                  <div className="space-y-2">
                    {[
                      {
                        key: 'wifiOnlyDownload' as const,
                        label: 'Unduh Hanya Pakai WiFi',
                        sub: 'Cegah unduhan menggunakan kuota seluler',
                        icon: Wifi,
                      },
                      {
                        key: 'autoPlay' as const,
                        label: 'Auto Play',
                        sub: 'Otomatis lanjut ke lagu berikutnya saat lagu selesai',
                        icon: Play,
                      },
                      {
                        key: 'repeatDefault' as const,
                        label: 'Repeat Default',
                        sub: 'Ulangi lagu otomatis saat pemutaran baru',
                        icon: RefreshCw,
                      },
                      {
                        key: 'shuffleDefault' as const,
                        label: 'Shuffle Default',
                        sub: 'Acak urutan antrean secara default',
                        icon: Shuffle,
                      },
                    ].map((item) => {
                      const Icon = item.icon;
                      const active = Boolean(musicSettings[item.key]);
                      return (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => updateMusicSettings({ [item.key]: !active })}
                          className="w-full p-2.5 rounded-xl bg-[#242424] hover:bg-[#2C2C2C] flex items-center justify-between gap-3 text-left cursor-pointer transition"
                        >
                          <div className="flex items-start gap-2.5 min-w-0 flex-1">
                            <Icon size={16} className="text-[#1DB954] shrink-0 mt-0.5" />
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-white">{item.label}</p>
                              <p className="text-[11px] text-[#B3B3B3] mt-0.5">{item.sub}</p>
                            </div>
                          </div>
                          <span
                            className={`w-10 h-5 rounded-full p-0.5 transition shrink-0 flex items-center ${
                              active ? 'bg-[#1DB954] justify-end' : 'bg-white/20 justify-start'
                            }`}
                          >
                            <span className="w-4 h-4 rounded-full bg-white shadow" />
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        { v: 128, label: '128 kbps' },
                        { v: 256, label: '256 kbps' },
                        { v: 320, label: '320 kbps' },
                      ] as Array<{ v: DownloadQualityKbps; label: string }>
                    ).map((opt) => (
                      <button
                        key={opt.v}
                        type="button"
                        onClick={() => updateMusicSettings({ downloadQuality: opt.v })}
                        className={`py-2 px-2 rounded-xl text-[11px] font-bold border cursor-pointer transition ${
                          musicSettings.downloadQuality === opt.v
                            ? 'bg-[#1DB954] text-black border-[#1DB954]'
                            : 'bg-[#282828] text-white border-white/10'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  <div>
                    <div className="flex justify-between mb-1.5">
                      <span className="text-xs text-[#B3B3B3] flex items-center gap-1.5">
                        <Volume2 size={15} /> Volume Pemutar
                      </span>
                      <span className="font-mono tabular-nums text-white font-bold text-xs">
                        {Math.round(volume * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={Math.round(volume * 100)}
                      onChange={(e) => setVolume(Number(e.target.value) / 100)}
                      className="w-full h-1.5 accent-[#1DB954] cursor-pointer"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setResolvedFullMap({});
                        setResolvedYtMap({});
                        loadTrendingSongs();
                        setCacheNotice('Cache katalog dibersihkan!');
                      }}
                      className="py-2 px-3 rounded-xl bg-[#282828] hover:bg-[#333333] text-white font-bold text-xs cursor-pointer"
                    >
                      Hapus Cache
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setHistoryTracks([]);
                        try {
                          localStorage.removeItem(historyStorageKey);
                        } catch {}
                        setCacheNotice('Riwayat putar dihapus!');
                      }}
                      className="py-2 px-3 rounded-xl bg-[#282828] hover:bg-[#333333] text-white font-bold text-xs cursor-pointer"
                    >
                      Hapus Riwayat
                    </button>
                  </div>
                </div>
              )}

              {cacheNotice && (
                <p className="text-xs text-[#1DB954] font-semibold text-center">{cacheNotice}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
