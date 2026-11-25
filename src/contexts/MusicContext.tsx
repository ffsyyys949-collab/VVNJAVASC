import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import {
  Play,
  Pause,
  X,
  Music,
  ChevronDown,
  Heart,
  Shuffle,
  Repeat,
  SkipBack,
  SkipForward,
  Volume2,
  Youtube,
  Disc3,
  ListMusic,
  Download,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Trash2,
  WifiOff,
  Loader2,
  Gauge,
} from 'lucide-react';
import { getApiBaseUrl } from '../lib/apiBase.ts';
import { isApkWebView, safeApiFetch } from '../lib/zeDataSync.ts';
import {
  loadVNMusicSettings,
  saveVNMusicSettings,
  loadOfflineMetaIndexSync,
  getAllOfflineTrackMeta,
  getOfflineTrackRecord,
  deleteOfflineTrackRecord,
  clearAllOfflineTracks,
  downloadFullSongToOffline,
  isWifiConnection,
  type VNMusicSettings,
  type OfflineTrackMeta,
  type DownloadProgressState,
} from '../lib/offlineMusicDb.ts';

declare global {
  interface Window {
    mainAudio?: HTMLAudioElement;
    __zeMusicControl?: (action: string) => void;
  }
}

if (typeof window !== 'undefined') {
  if (!window.mainAudio) {
    window.mainAudio = new Audio();
  }
}

export type TrackSourceType =
  | 'tiktok'
  | 'youtube'
  | 'web'
  | 'itunes'
  | 'deezer'
  | 'jamendo'
  | 'soundcloud'
  | 'audius'
  | 'offline';

export interface TrackData {
  id?: string;
  title: string;
  thumbnail?: string;
  cover?: string;
  url?: string;
  videoUrl?: string;
  audioUrl?: string;
  previewUrl?: string;
  fullAudioUrl?: string;
  youtubeId?: string;
  youtubeDurationSec?: number;
  playbackMode?: 'full' | 'youtube' | 'preview' | 'offline';
  isPreviewFallback?: boolean;
  isCatalogSearch?: boolean;
  resolvedSourceLabel?: string;
  album?: string;
  durationMs?: number;
  source: TrackSourceType;
  sourceType?: TrackSourceType;
  author?: string;
  artist?: string;
  sourceUrl?: string;
  isrc?: string;
  releaseYear?: string;
  genre?: string;
  lyrics?: any;
}

export interface MusicContextType {
  currentTrack: TrackData | null;
  isPlaying: boolean;
  playlist: TrackData[];
  currentTimeSec: number;
  durationSec: number;
  volume: number;
  playbackRate: number;
  isLoop: boolean;
  isShuffle: boolean;
  youtubeId: string | null;
  playNonce: number;
  likedTrackIds: string[];
  likedTracks: TrackData[];
  isFullPlayerOpen: boolean;
  ytStatusText: string;
  musicSettings: VNMusicSettings;
  offlineTracks: OfflineTrackMeta[];
  offlineTrackIds: Set<string>;
  downloadProgressMap: Record<string, DownloadProgressState>;
  downloadNotice: string | null;
  setDownloadNotice: (msg: string | null) => void;
  updateMusicSettings: (patch: Partial<VNMusicSettings>) => void;
  downloadTrackOffline: (track: TrackData, skipWifiCheck?: boolean) => Promise<boolean>;
  removeOfflineTrack: (trackId: string) => Promise<void>;
  clearAllOfflineDownloads: () => Promise<void>;
  refreshOfflineTracks: () => Promise<void>;
  findAnotherFullVersion: () => Promise<void>;
  setPlaylist: React.Dispatch<React.SetStateAction<TrackData[]>>;
  playMusic: (urlOrTrack: string | TrackData, trackDetails?: Partial<TrackData>) => void;
  pauseMusic: () => void;
  resumeMusic: () => void;
  togglePlay: () => void;
  closePlayer: () => void;
  playNext: () => void;
  playPrevious: () => void;
  seekTo: (seconds: number) => void;
  setVolume: (vol: number) => void;
  setPlaybackRate: (rate: number) => void;
  setIsLoop: (loop: boolean) => void;
  setIsShuffle: (shuffle: boolean) => void;
  setCurrentTrack: (track: TrackData | null) => void;
  setIsPlaying: (playing: boolean) => void;
  setDurationSec: (sec: number) => void;
  setCurrentTimeSec: (sec: number) => void;
  toggleLikeTrack: (track: TrackData) => void;
  isTrackLiked: (trackId?: string) => boolean;
  setIsFullPlayerOpen: (open: boolean) => void;
  setYtStatusText: (txt: string) => void;
  switchPlaybackMode: (mode: 'full' | 'youtube' | 'preview') => Promise<void>;
}

const DEFAULT_PLAYLIST: TrackData[] = [];

const MusicContext = createContext<MusicContextType | null>(null);

export function extractYoutubeIdFromUrl(rawUrl?: string): string | null {
  if (!rawUrl) return null;
  const match = rawUrl.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|music\/)|youtu\.be\/)([A-Za-z0-9_-]{6,15})/i
  );
  return match ? match[1] : null;
}

export function isShortPreviewUrl(url?: string): boolean {
  if (!url) return false;
  return /mzstatic\.com|dzcdn\.net\/stream\/c-/i.test(url);
}

export function formatBytesMb(bytes: number): string {
  const mb = (Math.max(0, bytes) || 0) / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

export function MusicProvider({ children }: { children: React.ReactNode }) {
  const [musicSettings, setMusicSettings] = useState<VNMusicSettings>(() => loadVNMusicSettings());
  const [currentTrack, setCurrentTrack] = useState<TrackData | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playlist, setPlaylist] = useState<TrackData[]>(DEFAULT_PLAYLIST);
  const [trackIndex, setTrackIndex] = useState<number>(0);
  const [currentTimeSec, setCurrentTimeSec] = useState<number>(0);
  const [durationSec, setDurationSec] = useState<number>(0);
  const [volume, setVolumeState] = useState<number>(0.9);
  const [playbackRate, setPlaybackRateState] = useState<number>(1.0);
  const [isLoop, setIsLoop] = useState<boolean>(() => loadVNMusicSettings().repeatDefault);
  const [isShuffle, setIsShuffle] = useState<boolean>(() => loadVNMusicSettings().shuffleDefault);
  const [youtubeId, setYoutubeId] = useState<string | null>(null);
  const [playNonce, setPlayNonce] = useState<number>(0);
  const [isFullPlayerOpen, setIsFullPlayerOpen] = useState<boolean>(false);
  const [ytStatusText, setYtStatusText] = useState<string>('');
  const [downloadNotice, setDownloadNotice] = useState<string | null>(null);

  const [offlineTracks, setOfflineTracks] = useState<OfflineTrackMeta[]>(() =>
    loadOfflineMetaIndexSync()
  );
  const [downloadProgressMap, setDownloadProgressMap] = useState<
    Record<string, DownloadProgressState>
  >({});

  const [likedTracks, setLikedTracks] = useState<TrackData[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = JSON.parse(window.localStorage.getItem('ze_liked_tracks_v1') || '[]');
      return Array.isArray(raw) ? raw : [];
    } catch {
      return [];
    }
  });

  const offlineTrackIds = React.useMemo(
    () => new Set(offlineTracks.map((t) => t.id)),
    [offlineTracks]
  );

  const refreshOfflineTracks = useCallback(async () => {
    const metas = await getAllOfflineTrackMeta();
    setOfflineTracks(metas);
  }, []);

  useEffect(() => {
    refreshOfflineTracks();
  }, [refreshOfflineTracks]);

  const updateMusicSettings = useCallback((patch: Partial<VNMusicSettings>) => {
    setMusicSettings((prev) => {
      const next = { ...prev, ...patch };
      saveVNMusicSettings(next);
      if (patch.repeatDefault !== undefined) setIsLoop(Boolean(patch.repeatDefault));
      if (patch.shuffleDefault !== undefined) setIsShuffle(Boolean(patch.shuffleDefault));
      return next;
    });
  }, []);

  const likedTrackIds = likedTracks.map((t) => t.id || `${t.title}__${t.artist || t.author || ''}`);

  const isTrackLiked = useCallback(
    (trackId?: string) => {
      if (!trackId) return false;
      return likedTrackIds.includes(trackId);
    },
    [likedTrackIds]
  );

  const toggleLikeTrack = useCallback((track: TrackData) => {
    const key = track.id || `${track.title}__${track.artist || track.author || ''}`;
    if (!key) return;
    setLikedTracks((prev) => {
      const exists = prev.some(
        (item) => (item.id || `${item.title}__${item.artist || item.author || ''}`) === key
      );
      const next = exists
        ? prev.filter(
            (item) => (item.id || `${item.title}__${item.artist || item.author || ''}`) !== key
          )
        : [{ ...track, id: track.id || key }, ...prev].slice(0, 200);
      try {
        window.localStorage.setItem('ze_liked_tracks_v1', JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ytIframeRef = useRef<HTMLIFrameElement | null>(null);
  const activeObjectUrlRef = useRef<string | null>(null);
  const playSessionRef = useRef<number>(0);

  const isLoopRef = useRef(isLoop);
  const isShuffleRef = useRef(isShuffle);
  const playlistRef = useRef(playlist);
  const trackIndexRef = useRef(trackIndex);
  const youtubeIdRef = useRef(youtubeId);
  const currentTrackRef = useRef(currentTrack);
  const musicSettingsRef = useRef(musicSettings);
  const volumeRef = useRef(volume);
  const playbackRateRef = useRef(playbackRate);

  isLoopRef.current = isLoop;
  isShuffleRef.current = isShuffle;
  playlistRef.current = playlist;
  trackIndexRef.current = trackIndex;
  youtubeIdRef.current = youtubeId;
  currentTrackRef.current = currentTrack;
  musicSettingsRef.current = musicSettings;
  volumeRef.current = volume;
  playbackRateRef.current = playbackRate;

  const stopOtherDomMedia = useCallback(() => {
    if (typeof document === 'undefined') return;
    document.querySelectorAll('video, audio').forEach((el: any) => {
      if (
        el !== window.mainAudio &&
        !el.hasAttribute('data-bg-video') &&
        el.id !== 'bg-water-video' &&
        !el.hasAttribute('data-feed-video') &&
        !el.muted
      ) {
        try {
          el.pause();
        } catch {}
      }
    });
  }, []);

  const disposeMainAudio = useCallback(() => {
    if (typeof window === 'undefined' || !window.mainAudio) return;
    const audio = window.mainAudio;
    try {
      audio.pause();
      audio.currentTime = 0;
      audio.removeAttribute('src');
      audio.load();
    } catch {}
    if (activeObjectUrlRef.current) {
      try {
        URL.revokeObjectURL(activeObjectUrlRef.current);
      } catch {}
      activeObjectUrlRef.current = null;
    }
  }, []);

  const setVolume = useCallback((vol: number) => {
    const clamped = Math.max(0, Math.min(1, Number(vol) || 0));
    setVolumeState(clamped);
    if (typeof window !== 'undefined' && window.mainAudio) {
      window.mainAudio.volume = clamped;
    }
    if (ytIframeRef.current?.contentWindow) {
      try {
        ytIframeRef.current.contentWindow.postMessage(
          JSON.stringify({
            event: 'command',
            func: 'setVolume',
            args: [Math.round(clamped * 100)],
          }),
          '*'
        );
      } catch {}
    }
  }, []);

  const setPlaybackRate = useCallback((rate: number) => {
    const clamped = Math.max(0.5, Math.min(2.0, Number((Math.round(rate * 20) / 20).toFixed(2)) || 1.0));
    setPlaybackRateState(clamped);
    if (typeof window !== 'undefined' && window.mainAudio) {
      window.mainAudio.playbackRate = clamped;
    }
    if (ytIframeRef.current?.contentWindow) {
      try {
        ytIframeRef.current.contentWindow.postMessage(
          JSON.stringify({
            event: 'command',
            func: 'setPlaybackRate',
            args: [clamped],
          }),
          '*'
        );
      } catch {}
    }
  }, []);

  const mountAudioPlayback = useCallback(
    (audioPlayUrl: string, trackObj: TrackData, modeLabel?: { isPreviewFallback?: boolean; playbackMode?: TrackData['playbackMode']; statusText?: string }) => {
      if (typeof window === 'undefined') return;
      const audio = window.mainAudio || new Audio();
      window.mainAudio = audio;
      setYoutubeId(null);

      const normalizePlayableSrc = (raw: string) => {
        if (raw.startsWith('/') && isApkWebView()) {
          return `${getApiBaseUrl()}${raw}`;
        }
        return raw;
      };

      const finalAudioSrc = normalizePlayableSrc(audioPlayUrl);

      // TikTok tracks NEVER force-loop — respect user's Repeat setting so Auto Next fires naturally
      audio.volume = volumeRef.current;
      audio.playbackRate = playbackRateRef.current;
      audio.loop = isLoopRef.current;
      audio.src = finalAudioSrc;
      audio.load();

      audio
        .play()
        .then(() => {
          setIsPlaying(true);
        })
        .catch((err) => {
          console.warn('Audio play notice:', err);
          if (finalAudioSrc.startsWith('http') && !finalAudioSrc.includes('/api/')) {
            const proxyEndpoint = normalizePlayableSrc(
              trackObj.source === 'tiktok'
                ? `/api/tiktok/stream?url=${encodeURIComponent(finalAudioSrc)}`
                : `/api/music/audio-stream?url=${encodeURIComponent(finalAudioSrc)}`
            );
            audio.src = proxyEndpoint;
            audio.load();
            audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
          } else {
            setIsPlaying(false);
          }
        });

      const resolvedMode =
        modeLabel?.playbackMode ||
        (modeLabel?.isPreviewFallback || isShortPreviewUrl(audioPlayUrl) ? 'preview' : 'full');

      const nextTrackState: TrackData = {
        ...trackObj,
        playbackMode: resolvedMode,
        isPreviewFallback: Boolean(modeLabel?.isPreviewFallback ?? (resolvedMode === 'preview')),
      };
      setPlayNonce((n) => n + 1);
      setCurrentTrack(nextTrackState);
      if (modeLabel?.statusText !== undefined) {
        setYtStatusText(modeLabel.statusText);
      }
      setIsPlaying(true);
    },
    []
  );

  // Synchronize single <audio> element with state, Auto Next & Android MediaSession
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const audio = audioRef.current || window.mainAudio || new Audio();
    window.mainAudio = audio;
    audio.preload = 'auto';
    audio.volume = volumeRef.current;
    audio.loop = isLoopRef.current;

    const handleAudioPlay = () => {
      if (!youtubeIdRef.current) {
        setIsPlaying(true);
      }
    };
    const handleAudioPause = () => {
      if (!youtubeIdRef.current && audio.src) {
        setIsPlaying(false);
      }
    };
    const handleLoadedMetadata = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDurationSec(Math.round(audio.duration));
      }
    };
    const handleTimeUpdate = () => {
      if (!youtubeIdRef.current && audio.src) {
        setCurrentTimeSec(Math.floor(audio.currentTime || 0));
        if (Number.isFinite(audio.duration) && audio.duration > 0) {
          setDurationSec(Math.round(audio.duration));
        }
      }
      if (
        'mediaSession' in navigator &&
        typeof navigator.mediaSession.setPositionState === 'function'
      ) {
        if (Number.isFinite(audio.duration) && audio.duration > 0) {
          try {
            navigator.mediaSession.setPositionState({
              duration: audio.duration,
              playbackRate: audio.playbackRate || 1,
              position: Math.min(audio.currentTime || 0, audio.duration),
            });
          } catch {}
        }
      }
    };

    const handleAudioEnded = () => {
      if (isLoopRef.current && audio.src) {
        audio.currentTime = 0;
        audio.play().catch(() => {});
        return;
      }

      const list = playlistRef.current;
      const shouldAutoPlay = musicSettingsRef.current.autoPlay;
      if (shouldAutoPlay && list.length > 1) {
        const nextIdx = isShuffleRef.current
          ? Math.floor(Math.random() * list.length)
          : (trackIndexRef.current + 1) % list.length;
        const nextTrack = list[nextIdx];
        if (nextTrack) {
          setTrackIndex(nextIdx);
          musicHandlersRef.current.playMusic(nextTrack);
          return;
        }
      }

      // Clean stop at end — keep track selected & reset time to 0 so Replay / Next / Prev never freezes
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch {}
      setCurrentTimeSec(0);
      setIsPlaying(false);
    };

    const handleAudioError = () => {
      const tr = currentTrackRef.current;
      const src = audio.src || '';
      if (!tr || !src) return;

      // Never hijack offline object URLs
      if (src.startsWith('blob:')) {
        setIsPlaying(false);
        return;
      }

      // If TikTok or external audio URL failed directly, try backend stream proxy once
      if (src.startsWith('http') && !src.includes('/api/')) {
        const proxyUrl =
          tr.source === 'tiktok'
            ? `/api/tiktok/stream?url=${encodeURIComponent(src)}`
            : `/api/music/audio-stream?url=${encodeURIComponent(src)}`;
        audio.src = proxyUrl;
        audio.load();
        audio.play().catch(() => setIsPlaying(false));
        return;
      }

      // NEVER silently downgrade to 30s preview without telling the user!
      setIsPlaying(false);
      if (tr.previewUrl && !src.includes(tr.previewUrl) && isShortPreviewUrl(tr.previewUrl)) {
        setCurrentTrack((prev) =>
          prev ? { ...prev, isPreviewFallback: true, playbackMode: 'preview' } : prev
        );
        setYtStatusText('⚠️ Full stream gagal dimuat — klik Cari Full Lain');
      }
    };

    audio.addEventListener('play', handleAudioPlay);
    audio.addEventListener('pause', handleAudioPause);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleAudioEnded);
    audio.addEventListener('error', handleAudioError);

    const handleVideoPlay = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target && target.tagName === 'VIDEO') {
        const videoEl = target as HTMLVideoElement;
        if (
          videoEl.muted ||
          videoEl.hasAttribute('data-bg-video') ||
          videoEl.id === 'bg-water-video' ||
          videoEl.hasAttribute('data-feed-video')
        ) {
          return;
        }
        if (window.mainAudio && !window.mainAudio.paused) {
          window.mainAudio.pause();
          setIsPlaying(false);
        }
      }
    };

    document.addEventListener('play', handleVideoPlay, true);

    return () => {
      audio.removeEventListener('play', handleAudioPlay);
      audio.removeEventListener('pause', handleAudioPause);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleAudioEnded);
      audio.removeEventListener('error', handleAudioError);
      document.removeEventListener('play', handleVideoPlay, true);
    };
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.mainAudio) {
      window.mainAudio.loop = isLoop;
    }
  }, [isLoop]);

  // Monitor YouTube Full Player events cleanly (NO 3-second cut/downgrade to 30s preview!)
  useEffect(() => {
    if (!youtubeId || !isPlaying) return;

    const handleYtMessage = (event: MessageEvent) => {
      if (typeof event.origin === 'string' && !event.origin.includes('youtube.com')) return;
      try {
        const parsed = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (!parsed || typeof parsed !== 'object') return;
        const playerState =
          parsed.event === 'onStateChange'
            ? parsed.info
            : parsed.event === 'infoDelivery' &&
              parsed.info &&
              typeof parsed.info.playerState === 'number'
            ? parsed.info.playerState
            : null;

        if (playerState === 0) {
          // Track finished naturally on YouTube -> Repeat or Auto Next
          if (isLoopRef.current) {
            ytIframeRef.current?.contentWindow?.postMessage(
              JSON.stringify({ event: 'command', func: 'seekTo', args: [0, true] }),
              '*'
            );
            ytIframeRef.current?.contentWindow?.postMessage(
              JSON.stringify({ event: 'command', func: 'playVideo', args: [] }),
              '*'
            );
            setCurrentTimeSec(0);
          } else if (musicSettingsRef.current.autoPlay && playlistRef.current.length > 1) {
            musicHandlersRef.current.playNext();
          } else {
            setIsPlaying(false);
            setCurrentTimeSec(0);
          }
          return;
        }

        if (
          parsed.event === 'infoDelivery' &&
          parsed.info &&
          typeof parsed.info.currentTime === 'number'
        ) {
          setCurrentTimeSec(Math.floor(parsed.info.currentTime));
        }
        if (
          parsed.event === 'infoDelivery' &&
          parsed.info &&
          typeof parsed.info.duration === 'number' &&
          parsed.info.duration > 0
        ) {
          setDurationSec(Math.round(parsed.info.duration));
        }
      } catch {}
    };

    window.addEventListener('message', handleYtMessage);

    const timer = window.setInterval(() => {
      setCurrentTimeSec((prev) => {
        if (durationSec > 0 && prev >= durationSec) {
          if (isLoopRef.current) return 0;
          return prev;
        }
        return prev + 1;
      });
    }, 1000);

    return () => {
      window.removeEventListener('message', handleYtMessage);
      window.clearInterval(timer);
    };
  }, [youtubeId, isPlaying, durationSec]);

  const playMusic = useCallback(
    (urlOrTrack: string | TrackData, trackDetails?: Partial<TrackData>) => {
      if (typeof window === 'undefined') return;
      if (!window.mainAudio) {
        window.mainAudio = new Audio();
      }

      const sessionToken = ++playSessionRef.current;
      stopOtherDomMedia();

      let trackObj: TrackData;
      if (typeof urlOrTrack === 'string') {
        trackObj = {
          title: trackDetails?.title || 'Musik Audio',
          author: trackDetails?.author || 'VNJAVA Music',
          artist: trackDetails?.artist || trackDetails?.author || 'VNJAVA Official',
          thumbnail: trackDetails?.thumbnail || '',
          url: urlOrTrack,
          videoUrl: trackDetails?.videoUrl,
          audioUrl: urlOrTrack,
          source: trackDetails?.source || 'web',
          sourceType: trackDetails?.sourceType || trackDetails?.source || 'web',
          ...trackDetails,
        };
      } else {
        trackObj = {
          ...urlOrTrack,
          ...trackDetails,
          source: (trackDetails?.source || urlOrTrack.source || 'web') as TrackSourceType,
        };
      }

      // 1. Cleanly stop -> dispose -> reset previous playback before starting new track
      disposeMainAudio();
      setYoutubeId(null);
      setCurrentTimeSec(0);

      const estDuration =
        trackObj.durationMs && trackObj.durationMs > 0
          ? Math.max(5, Math.round(trackObj.durationMs / 1000))
          : trackObj.youtubeDurationSec && trackObj.youtubeDurationSec > 0
          ? trackObj.youtubeDurationSec
          : 0;
      setDurationSec(estDuration);

      // Keep playlist queue synced immediately
      setPlaylist((prev) => {
        const idx = prev.findIndex(
          (p) =>
            (p.id && trackObj.id && p.id === trackObj.id) ||
            (p.title === trackObj.title &&
              (p.artist || p.author) === (trackObj.artist || trackObj.author))
        );
        if (idx !== -1) {
          const updated = [...prev];
          updated[idx] = trackObj;
          setTrackIndex(idx);
          return updated;
        }
        setTrackIndex(0);
        return [trackObj, ...prev].slice(0, 80);
      });

      // Helper to execute online playback after checking offline cache
      const runOnlinePlayback = () => {
        if (playSessionRef.current !== sessionToken) return;

        const directYoutubeId =
          trackObj.youtubeId ||
          extractYoutubeIdFromUrl(trackObj.videoUrl || trackObj.url || trackObj.sourceUrl);

        const preferredFullAudio =
          trackObj.fullAudioUrl ||
          (trackObj.audioUrl && !isShortPreviewUrl(trackObj.audioUrl) ? trackObj.audioUrl : '');

        const useYoutubePlayer =
          Boolean(directYoutubeId) &&
          (trackObj.playbackMode === 'youtube' ||
            (!preferredFullAudio &&
              (trackObj.source === 'youtube' || !trackObj.isPreviewFallback)));

        if (useYoutubePlayer && directYoutubeId && trackObj.playbackMode === 'youtube') {
          setPlayNonce((n) => n + 1);
          setCurrentTrack({
            ...trackObj,
            youtubeId: directYoutubeId,
            playbackMode: 'youtube',
            isPreviewFallback: false,
          });
          setIsPlaying(true);
          window.setTimeout(() => {
            if (playSessionRef.current === sessionToken) {
              setYoutubeId(directYoutubeId);
            }
          }, 30);
          return;
        }

        const audioPlayUrl =
          preferredFullAudio ||
          (trackObj.playbackMode === 'preview' ? trackObj.previewUrl : '') ||
          trackObj.audioUrl ||
          trackObj.videoUrl ||
          trackObj.url ||
          trackObj.previewUrl ||
          '';

        if (!audioPlayUrl) {
          setIsPlaying(false);
          return;
        }

        const isPreview = Boolean(
          trackObj.isPreviewFallback ||
            (isShortPreviewUrl(audioPlayUrl) && !preferredFullAudio)
        );
        mountAudioPlayback(audioPlayUrl, trackObj, {
          playbackMode: isPreview ? 'preview' : 'full',
          isPreviewFallback: isPreview,
          statusText: isPreview
            ? '⚠️ FULL TIDAK KETEMU, INI CUMA PREVIEW 30 DETIK'
            : trackObj.resolvedSourceLabel ||
              (trackObj.source === 'tiktok' ? 'TikTok Full Audio' : 'Full Audio Aktif'),
        });
      };

      // Step 0: Check IndexedDB offline storage FIRST (works 100% offline with zero network!)
      if (trackObj.id) {
        getOfflineTrackRecord(trackObj.id)
          .then((offlineRec) => {
            if (playSessionRef.current !== sessionToken) return;
            if (offlineRec && offlineRec.blob) {
              const objUrl = URL.createObjectURL(offlineRec.blob);
              activeObjectUrlRef.current = objUrl;
              const offlineDur = offlineRec.durationSec || estDuration;
              if (offlineDur > 0) setDurationSec(offlineDur);
              mountAudioPlayback(
                objUrl,
                {
                  ...trackObj,
                  durationMs: offlineDur * 1000,
                  fullAudioUrl: objUrl,
                  audioUrl: objUrl,
                  resolvedSourceLabel: `Offline (${offlineRec.qualityKbps}kbps)`,
                },
                {
                  playbackMode: 'offline',
                  isPreviewFallback: false,
                  statusText: `⬇️ Memutar Offline (${offlineRec.qualityKbps}kbps)`,
                }
              );
              return;
            }
            runOnlinePlayback();
          })
          .catch(() => {
            runOnlinePlayback();
          });
      } else {
        runOnlinePlayback();
      }
    },
    [disposeMainAudio, mountAudioPlayback, stopOtherDomMedia]
  );

  const pauseMusic = useCallback(() => {
    if (typeof window !== 'undefined' && window.mainAudio) {
      window.mainAudio.pause();
    }
    if (ytIframeRef.current?.contentWindow) {
      try {
        ytIframeRef.current.contentWindow.postMessage(
          JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }),
          '*'
        );
      } catch {}
    }
    setIsPlaying(false);
  }, []);

  const resumeMusic = useCallback(() => {
    if (typeof window === 'undefined') return;
    stopOtherDomMedia();
    if (youtubeIdRef.current) {
      if (ytIframeRef.current?.contentWindow) {
        try {
          ytIframeRef.current.contentWindow.postMessage(
            JSON.stringify({ event: 'command', func: 'playVideo', args: [] }),
            '*'
          );
        } catch {}
      } else {
        setPlayNonce((n) => n + 1);
      }
      setIsPlaying(true);
      return;
    }
    if (window.mainAudio && window.mainAudio.src) {
      window.mainAudio.play().catch((err) => {
        console.warn('Resume playback error:', err);
      });
      setIsPlaying(true);
    } else if (currentTrackRef.current) {
      playMusic(currentTrackRef.current);
    }
  }, [playMusic, stopOtherDomMedia]);

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      pauseMusic();
    } else {
      if (!currentTrackRef.current) {
        if (playlistRef.current[0]) {
          playMusic(playlistRef.current[0]);
        }
        return;
      }
      resumeMusic();
    }
  }, [isPlaying, pauseMusic, playMusic, resumeMusic]);

  const playNext = useCallback(() => {
    const list = playlistRef.current;
    if (list.length === 0) return;
    const nextIdx = isShuffleRef.current
      ? Math.floor(Math.random() * list.length)
      : (trackIndexRef.current + 1) % list.length;
    setTrackIndex(nextIdx);
    playMusic(list[nextIdx]);
  }, [playMusic]);

  const playPrevious = useCallback(() => {
    const list = playlistRef.current;
    if (list.length === 0) return;
    const prevIdx = (trackIndexRef.current - 1 + list.length) % list.length;
    setTrackIndex(prevIdx);
    playMusic(list[prevIdx]);
  }, [playMusic]);

  const seekTo = useCallback((seconds: number) => {
    const clamped = Math.max(0, Math.floor(seconds));
    setCurrentTimeSec(clamped);
    if (typeof window !== 'undefined' && window.mainAudio && window.mainAudio.src) {
      try {
        window.mainAudio.currentTime = clamped;
      } catch {}
    }
    if (ytIframeRef.current?.contentWindow && youtubeIdRef.current) {
      try {
        ytIframeRef.current.contentWindow.postMessage(
          JSON.stringify({ event: 'command', func: 'seekTo', args: [clamped, true] }),
          '*'
        );
      } catch {}
    }
  }, []);

  const closePlayer = useCallback(() => {
    ++playSessionRef.current;
    disposeMainAudio();
    setYoutubeId(null);
    setCurrentTrack(null);
    setIsPlaying(false);
    setIsFullPlayerOpen(false);
    setCurrentTimeSec(0);
    setDurationSec(0);
    if (typeof window !== 'undefined') {
      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = null;
        navigator.mediaSession.playbackState = 'none';
        try {
          navigator.mediaSession.setActionHandler('play', null);
          navigator.mediaSession.setActionHandler('pause', null);
          navigator.mediaSession.setActionHandler('nexttrack', null);
          navigator.mediaSession.setActionHandler('previoustrack', null);
          navigator.mediaSession.setActionHandler('stop', null);
        } catch {}
      }
      window.ZeNative?.stopMusicNotification?.();
      if ('serviceWorker' in navigator) {
        if (navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({ type: 'DISMISS_MUSIC_NOTIFICATION' });
        } else {
          navigator.serviceWorker.ready
            .then((reg) => reg.active?.postMessage({ type: 'DISMISS_MUSIC_NOTIFICATION' }))
            .catch(() => {});
        }
      }
    }
  }, [disposeMainAudio]);

  const switchPlaybackMode = useCallback(
    async (mode: 'full' | 'youtube' | 'preview') => {
      const tr = currentTrackRef.current;
      if (!tr) return;

      if (mode === 'preview') {
        const previewUrl = tr.previewUrl || tr.audioUrl;
        if (!previewUrl) return;
        setYtStatusText('⚠️ FULL TIDAK KETEMU, INI CUMA PREVIEW 30 DETIK');
        playMusic({
          ...tr,
          audioUrl: previewUrl,
          fullAudioUrl: undefined,
          playbackMode: 'preview',
          isPreviewFallback: true,
        });
        return;
      }

      if (mode === 'full') {
        setYtStatusText('Mencari Full Audio...');
        const durTarget = tr.durationMs ? Math.round(tr.durationMs / 1000) : 0;
        const quality =
          musicSettingsRef.current.streamingQuality === 'low'
            ? '128'
            : musicSettingsRef.current.streamingQuality === 'high'
            ? '320'
            : '256';
        const res = await safeApiFetch<any>(
          `/api/music/resolve-full?title=${encodeURIComponent(tr.title)}&artist=${encodeURIComponent(tr.artist || tr.author || '')}&durationSec=${durTarget}&quality=${quality}`,
          { timeoutMs: 20000 }
        );
        if (res.ok && res.data?.fullAudioUrl && !res.data.isPreviewOnly) {
          playMusic({
            ...tr,
            fullAudioUrl: res.data.fullAudioUrl,
            audioUrl: res.data.fullAudioUrl,
            youtubeId: res.data.youtubeId || tr.youtubeId,
            durationMs:
              res.data.resolvedDurationSec >= 60
                ? res.data.resolvedDurationSec * 1000
                : tr.durationMs,
            playbackMode: 'full',
            isPreviewFallback: false,
            resolvedSourceLabel: `Full Audio (${res.data.sourceUsed})`,
          });
          return;
        }
        if (res.ok && res.data?.youtubeId) {
          playMusic({
            ...tr,
            youtubeId: res.data.youtubeId,
            playbackMode: 'youtube',
            isPreviewFallback: false,
            durationMs:
              res.data.youtubeDurationSec >= 60
                ? res.data.youtubeDurationSec * 1000
                : tr.durationMs,
          });
          return;
        }
        setYtStatusText('⚠️ FULL TIDAK KETEMU, INI CUMA PREVIEW 30 DETIK');
        return;
      }

      if (tr.youtubeId) {
        setYtStatusText('YouTube Full Audio Aktif');
        playMusic({
          ...tr,
          youtubeId: tr.youtubeId,
          playbackMode: 'youtube',
          isPreviewFallback: false,
        });
        return;
      }

      setYtStatusText('Mencari Full Audio di YouTube...');
      try {
        const durTarget = tr.durationMs ? Math.round(tr.durationMs / 1000) : 0;
        const ytRes = await safeApiFetch<{
          success?: boolean;
          top?: { videoId: string; durationSec?: number };
        }>(
          `/api/music/youtube-search?title=${encodeURIComponent(tr.title)}&artist=${encodeURIComponent(tr.artist || tr.author || '')}&targetDurationSec=${durTarget}`,
          { timeoutMs: 10000 }
        );
        if (ytRes.ok && ytRes.data?.top?.videoId) {
          const vid = ytRes.data.top.videoId;
          setYtStatusText('YouTube Full Audio Aktif');
          playMusic({
            ...tr,
            youtubeId: vid,
            playbackMode: 'youtube',
            isPreviewFallback: false,
            durationMs:
              ytRes.data.top.durationSec && ytRes.data.top.durationSec >= 60
                ? ytRes.data.top.durationSec * 1000
                : tr.durationMs,
          });
        } else {
          setYtStatusText('⚠️ FULL TIDAK KETEMU, INI CUMA PREVIEW 30 DETIK');
        }
      } catch {
        setYtStatusText('⚠️ FULL TIDAK KETEMU, INI CUMA PREVIEW 30 DETIK');
      }
    },
    [playMusic]
  );

  const findAnotherFullVersion = useCallback(async () => {
    await switchPlaybackMode('full');
  }, [switchPlaybackMode]);

  const downloadTrackOffline = useCallback(
    async (track: TrackData, skipWifiCheck = false): Promise<boolean> => {
      const id = track.id || `${track.title}__${track.artist || track.author || 'vn'}`;
      if (!id) return false;

      if (!skipWifiCheck && musicSettingsRef.current.wifiOnlyDownload) {
        const { isWifi, connectionType } = isWifiConnection();
        if (!isWifi) {
          setDownloadNotice(
            `Download diblokir (${connectionType}). Nonaktifkan "Download Hanya Pakai WiFi" di Pengaturan.`
          );
          return false;
        }
      }

      try {
        setDownloadNotice(null);
        await downloadFullSongToOffline(
          {
            id,
            title: track.title,
            artist: track.artist || track.author || 'Artis',
            album: track.album,
            thumbnail: track.thumbnail || track.cover,
            durationSec: track.durationMs ? Math.round(track.durationMs / 1000) : 0,
            fullAudioUrl:
              track.fullAudioUrl ||
              (track.audioUrl && !isShortPreviewUrl(track.audioUrl) ? track.audioUrl : undefined),
            source: track.source,
            youtubeId: track.youtubeId,
          },
          musicSettingsRef.current.downloadQuality,
          (prog) => {
            setDownloadProgressMap((prev) => ({ ...prev, [id]: prog }));
          }
        );
        await refreshOfflineTracks();
        setDownloadProgressMap((prev) => {
          const copy = { ...prev };
          delete copy[id];
          return copy;
        });
        return true;
      } catch (err: any) {
        setDownloadProgressMap((prev) => ({
          ...prev,
          [id]: {
            percent: 0,
            loadedBytes: 0,
            totalBytes: 0,
            status: 'error',
            errorMsg: err?.message || 'Gagal download offline',
          },
        }));
        setDownloadNotice(err?.message || 'Gagal download lagu offline');
        return false;
      }
    },
    [refreshOfflineTracks]
  );

  const removeOfflineTrack = useCallback(
    async (trackId: string) => {
      await deleteOfflineTrackRecord(trackId);
      await refreshOfflineTracks();
    },
    [refreshOfflineTracks]
  );

  const clearAllOfflineDownloads = useCallback(async () => {
    await clearAllOfflineTracks();
    setOfflineTracks([]);
  }, []);

  const musicHandlersRef = useRef({
    playMusic,
    pauseMusic,
    resumeMusic,
    togglePlay,
    playNext,
    playPrevious,
    closePlayer,
  });
  musicHandlersRef.current = {
    playMusic,
    pauseMusic,
    resumeMusic,
    togglePlay,
    playNext,
    playPrevious,
    closePlayer,
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;

    window.__zeMusicControl = (action) => {
      const h = musicHandlersRef.current;
      if (action === 'play') h.resumeMusic();
      else if (action === 'pause') h.pauseMusic();
      else if (action === 'toggle') h.togglePlay();
      else if (action === 'next') h.playNext();
      else if (action === 'prev') h.playPrevious();
      else if (action === 'stop') h.closePlayer();
    };

    const handleSwMessage = (event: MessageEvent) => {
      const data = event.data;
      if (data && data.type === 'NATIVE_MUSIC_CONTROL' && data.action) {
        window.__zeMusicControl?.(data.action);
      }
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleSwMessage);
    }

    return () => {
      delete window.__zeMusicControl;
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleSwMessage);
      }
    };
  }, []);

  // ANDROID NATIVE MEDIASESSION + FOREGROUND SERVICE NOTIFICATION
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const toAbsoluteUrl = (rawUrl?: string) => {
      if (!rawUrl) return '';
      if (
        rawUrl.startsWith('http://') ||
        rawUrl.startsWith('https://') ||
        rawUrl.startsWith('data:') ||
        rawUrl.startsWith('blob:')
      ) {
        return rawUrl;
      }
      return `${window.location.origin}${rawUrl.startsWith('/') ? '' : '/'}${rawUrl}`;
    };

    if (currentTrack) {
      const trackTitle = currentTrack.title || 'VN MUSIC';
      const trackArtist = currentTrack.artist || currentTrack.author || 'VN MUSIC';
      const coverUrl = toAbsoluteUrl(
        currentTrack.thumbnail || currentTrack.cover || '/assets/vnjava_logo.jpg'
      );
      const audioUrl = toAbsoluteUrl(
        currentTrack.fullAudioUrl ||
          currentTrack.audioUrl ||
          currentTrack.previewUrl ||
          currentTrack.videoUrl ||
          currentTrack.url ||
          ''
      );

      if (!youtubeId) {
        window.ZeNative?.updateMusicNotification?.(
          trackTitle,
          trackArtist,
          coverUrl,
          audioUrl,
          isPlaying
        );
      }

      if ('mediaSession' in navigator) {
        const artwork = [
          { src: '/assets/vnjava_logo.jpg', sizes: '192x192', type: 'image/jpeg' },
          { src: '/assets/vnjava_logo.jpg', sizes: '512x512', type: 'image/jpeg' },
        ];
        if (currentTrack.thumbnail || currentTrack.cover) {
          artwork.unshift({
            src: currentTrack.thumbnail || currentTrack.cover || '',
            sizes: '512x512',
            type: 'image/jpeg',
          });
        }

        navigator.mediaSession.metadata = new MediaMetadata({
          title: trackTitle,
          artist: trackArtist,
          album: currentTrack.album || 'VN MUSIC',
          artwork,
        });

        navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';

        try {
          navigator.mediaSession.setActionHandler('play', () =>
            musicHandlersRef.current.resumeMusic()
          );
          navigator.mediaSession.setActionHandler('pause', () =>
            musicHandlersRef.current.pauseMusic()
          );
          navigator.mediaSession.setActionHandler('previoustrack', () =>
            musicHandlersRef.current.playPrevious()
          );
          navigator.mediaSession.setActionHandler('nexttrack', () =>
            musicHandlersRef.current.playNext()
          );
          navigator.mediaSession.setActionHandler('seekto', (details) => {
            if (details.seekTime !== undefined) seekTo(details.seekTime);
          });
          navigator.mediaSession.setActionHandler('stop', () =>
            musicHandlersRef.current.closePlayer()
          );
        } catch {}
      }

      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        const msgPayload = {
          type: 'SHOW_MUSIC_NOTIFICATION',
          title: trackTitle,
          artist: trackArtist,
          cover: currentTrack.thumbnail || currentTrack.cover || '/assets/vnjava_logo.jpg',
          isPlaying,
        };
        if (navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage(msgPayload);
        } else {
          navigator.serviceWorker.ready
            .then((reg) => {
              reg.active?.postMessage(msgPayload);
            })
            .catch(() => {});
        }
      }
    } else {
      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = null;
        navigator.mediaSession.playbackState = 'none';
      }
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'DISMISS_MUSIC_NOTIFICATION' });
      }
    }
  }, [currentTrack, isPlaying, youtubeId, seekTo]);

  return (
    <MusicContext.Provider
      value={{
        currentTrack,
        isPlaying,
        playlist,
        currentTimeSec,
        durationSec,
        volume,
        playbackRate,
        isLoop,
        isShuffle,
        youtubeId,
        playNonce,
        likedTrackIds,
        likedTracks,
        isFullPlayerOpen,
        ytStatusText,
        musicSettings,
        offlineTracks,
        offlineTrackIds,
        downloadProgressMap,
        downloadNotice,
        setDownloadNotice,
        updateMusicSettings,
        downloadTrackOffline,
        removeOfflineTrack,
        clearAllOfflineDownloads,
        refreshOfflineTracks,
        findAnotherFullVersion,
        setPlaylist,
        playMusic,
        pauseMusic,
        resumeMusic,
        togglePlay,
        closePlayer,
        playNext,
        playPrevious,
        seekTo,
        setVolume,
        setPlaybackRate,
        setIsLoop,
        setIsShuffle,
        setCurrentTrack,
        setIsPlaying,
        setDurationSec,
        setCurrentTimeSec,
        toggleLikeTrack,
        isTrackLiked,
        setIsFullPlayerOpen,
        setYtStatusText,
        switchPlaybackMode,
      }}
    >
      <audio ref={audioRef} preload="auto" playsInline className="hidden" />
      {youtubeId && (
        <div
          aria-hidden="true"
          className="fixed bottom-0 right-0 w-px h-px opacity-[0.01] pointer-events-none overflow-hidden z-[-1]"
        >
          <iframe
            ref={ytIframeRef}
            key={`${youtubeId}_${playNonce}`}
            src={`https://www.youtube.com/embed/${youtubeId}?autoplay=${isPlaying ? 1 : 0}&enablejsapi=1&playsinline=1&rel=0${typeof window !== 'undefined' ? `&origin=${encodeURIComponent(window.location.origin)}` : ''}`}
            title="VN Music YouTube Player"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            onLoad={() => {
              try {
                ytIframeRef.current?.contentWindow?.postMessage(
                  JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }),
                  '*'
                );
                ytIframeRef.current?.contentWindow?.postMessage(
                  JSON.stringify({
                    event: 'command',
                    func: 'setVolume',
                    args: [Math.round(volume * 100)],
                  }),
                  '*'
                );
              } catch {}
            }}
          />
        </div>
      )}
      {children}
      <GlobalMiniPlayer />
      <SpotifyFullPlayerModal />
    </MusicContext.Provider>
  );
}

function PlayerCoverImg({
  src,
  alt,
  className = 'w-full h-full object-cover',
  iconSize = 24,
  draggable,
}: {
  src?: string;
  alt: string;
  className?: string;
  iconSize?: number;
  draggable?: boolean;
}) {
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    setBroken(false);
  }, [src]);

  if (!src || broken) {
    return (
      <div className="w-full h-full bg-[#737373] flex items-center justify-center pointer-events-none">
        <Music size={iconSize} className="text-black" strokeWidth={2} />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
      className={className}
      draggable={draggable}
    />
  );
}

// SPOTIFY MINI PLAYER: 72px height, #282828, 56x56 cover, 16px/14px text, Heart + 48x48 Play/Pause
export function GlobalMiniPlayer() {
  const {
    currentTrack,
    isPlaying,
    togglePlay,
    closePlayer,
    currentTimeSec,
    durationSec,
    isTrackLiked,
    toggleLikeTrack,
    setIsFullPlayerOpen,
    offlineTrackIds,
  } = useMusic();
  const [isMinimized, setIsMinimized] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const draggingRef = useRef(false);
  const startPosRef = useRef({ clientX: 0, clientY: 0, elemLeft: 0, elemTop: 0 });
  const hasDraggedRef = useRef(false);

  const bubbleElemRef = useRef<HTMLDivElement | null>(null);
  const liveDragPosRef = useRef<{ x: number; y: number } | null>(null);

  if (!currentTrack) return null;

  const coverImg = currentTrack.cover || currentTrack.thumbnail || '';
  const trackTitle = currentTrack.title || 'Memutar Musik';
  const trackArtist = currentTrack.artist || currentTrack.author || 'VN MUSIC';
  const miniProgress =
    durationSec > 0 ? Math.min(100, Math.max(0, (currentTimeSec / durationSec) * 100)) : 0;
  const liked = isTrackLiked(currentTrack.id || `${trackTitle}__${trackArtist}`);
  const isOfflineReady = currentTrack.id ? offlineTrackIds.has(currentTrack.id) : false;

  const startDrag = (clientX: number, clientY: number, elem: HTMLElement) => {
    draggingRef.current = true;
    hasDraggedRef.current = false;
    const rect = elem.getBoundingClientRect();
    startPosRef.current = {
      clientX,
      clientY,
      elemLeft: rect.left,
      elemTop: rect.top,
    };
    liveDragPosRef.current = { x: rect.left, y: rect.top };

    let dragRafId = 0;
    let pendingX = rect.left;
    let pendingY = rect.top;

    const applyTransform = () => {
      dragRafId = 0;
      const target = bubbleElemRef.current || elem;
      target.style.left = '0px';
      target.style.top = '0px';
      target.style.transform = `translate3d(${pendingX}px, ${pendingY}px, 0)`;
    };

    const onMove = (moveX: number, moveY: number) => {
      if (!draggingRef.current) return;
      const dx = moveX - startPosRef.current.clientX;
      const dy = moveY - startPosRef.current.clientY;
      if (Math.hypot(dx, dy) > 5) {
        hasDraggedRef.current = true;
      }
      pendingX = Math.max(8, Math.min(window.innerWidth - 64, startPosRef.current.elemLeft + dx));
      pendingY = Math.max(10, Math.min(window.innerHeight - 70, startPosRef.current.elemTop + dy));
      liveDragPosRef.current = { x: pendingX, y: pendingY };
      if (!dragRafId) {
        dragRafId = window.requestAnimationFrame(applyTransform);
      }
    };

    const finishDrag = () => {
      draggingRef.current = false;
      if (dragRafId) {
        window.cancelAnimationFrame(dragRafId);
        dragRafId = 0;
      }
      if (liveDragPosRef.current && hasDraggedRef.current) {
        setPosition({ ...liveDragPosRef.current });
      }
    };

    const handleMouseMove = (e: MouseEvent) => onMove(e.clientX, e.clientY);
    const handleMouseUp = () => {
      finishDrag();
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches[0]) onMove(e.touches[0].clientX, e.touches[0].clientY);
    };
    const handleTouchEnd = () => {
      finishDrag();
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleTouchEnd);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    startDrag(e.clientX, e.clientY, e.currentTarget);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches[0]) {
      startDrag(e.touches[0].clientX, e.touches[0].clientY, e.currentTarget);
    }
  };

  const handleClickCircle = () => {
    if (!hasDraggedRef.current) {
      setIsMinimized(false);
    }
  };

  if (isMinimized) {
    const bubbleStyle: React.CSSProperties = position
      ? {
          position: 'fixed',
          left: '0px',
          top: '0px',
          transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
          willChange: 'transform',
          touchAction: 'none',
          userSelect: 'none',
        }
      : {
          position: 'fixed',
          left: '0px',
          top: '0px',
          transform: 'translate3d(16px, 60px, 0)',
          willChange: 'transform',
          touchAction: 'none',
          userSelect: 'none',
        };

    return (
      <div
        ref={bubbleElemRef}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onClick={handleClickCircle}
        style={bubbleStyle}
        className="z-[999] w-[56px] h-[56px] rounded-full bg-[#282828] border-2 border-[#1DB954] shadow-2xl overflow-hidden cursor-grab active:cursor-grabbing select-none group active:scale-95 transition-transform"
        title="Geser posisi • Klik untuk kembali jadi Mini Player"
      >
        <PlayerCoverImg
          src={coverImg}
          alt={trackTitle}
          iconSize={22}
          draggable={false}
          className={`w-full h-full object-cover pointer-events-none select-none ${
            isPlaying ? 'animate-[spin_10s_linear_infinite]' : ''
          }`}
        />

        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          <span className="text-white text-[10px] font-bold drop-shadow">▲</span>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="spotify-mini-player"
      className="fixed bottom-[70px] left-0 right-0 w-full z-50 px-2.5 pointer-events-none"
    >
      <div className="max-w-3xl mx-auto pointer-events-auto">
        <div
          onClick={() => setIsFullPlayerOpen(true)}
          className="bg-[#282828] hover:bg-[#303030] border border-white/10 rounded-xl h-[72px] px-2.5 shadow-[0_12px_32px_rgba(0,0,0,0.68)] relative overflow-hidden flex flex-col justify-center cursor-pointer transition-colors"
        >
          <div className="flex items-center justify-between gap-2.5">
            <div className="flex items-center gap-3 overflow-hidden min-w-0 flex-1">
              <div className="w-[56px] h-[56px] rounded-lg bg-[#737373] overflow-hidden border border-white/10 flex items-center justify-center shrink-0 relative">
                <PlayerCoverImg src={coverImg} alt={trackTitle} iconSize={24} />
                {isOfflineReady && (
                  <span
                    className="absolute right-0.5 bottom-0.5 w-4 h-4 rounded-full bg-[#1DB954] text-black flex items-center justify-center shadow"
                    title="Tersedia Offline"
                  >
                    <Download size={10} strokeWidth={3} />
                  </span>
                )}
              </div>

              <div className="overflow-hidden min-w-0 flex-1">
                <p className="text-[16px] font-bold text-white truncate leading-tight">
                  {trackTitle}
                </p>
                <p className="text-[14px] text-[#B3B3B3] truncate mt-0.5 leading-tight flex items-center gap-1.5">
                  <span className="truncate">{trackArtist}</span>
                  {currentTrack.isPreviewFallback && (
                    <span className="text-[10px] font-bold text-red-400 shrink-0">
                      (PREVIEW 30s)
                    </span>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => toggleLikeTrack(currentTrack)}
                className="w-10 h-10 rounded-full hover:bg-white/10 flex items-center justify-center active:scale-90 transition cursor-pointer"
                title={liked ? 'Hapus dari Lagu Disukai' : 'Sukai Lagu'}
                aria-label="Sukai Lagu"
              >
                <Heart
                  size={20}
                  className={
                    liked ? 'text-[#1DB954] fill-[#1DB954]' : 'text-[#B3B3B3] hover:text-white'
                  }
                />
              </button>

              <button
                type="button"
                onClick={togglePlay}
                className="w-[48px] h-[48px] rounded-full bg-white text-black flex items-center justify-center active:scale-95 transition cursor-pointer shadow-md"
                title={isPlaying ? 'Pause' : 'Play'}
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? (
                  <Pause className="w-5 h-5 fill-black" />
                ) : (
                  <Play className="w-5 h-5 fill-black ml-0.5" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setIsMinimized(true)}
                className="w-8 h-8 rounded-full hover:bg-white/10 text-[#B3B3B3] hover:text-white flex items-center justify-center active:scale-95 transition cursor-pointer"
                title="Perkecil jadi Bubble"
                aria-label="Perkecil Player"
              >
                <ChevronDown className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={closePlayer}
                className="w-8 h-8 rounded-full hover:bg-white/10 text-[#B3B3B3] hover:text-white flex items-center justify-center active:scale-95 transition cursor-pointer"
                title="Tutup Musik"
                aria-label="Tutup Musik"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-white/15">
            <div
              className="h-full bg-[#1DB954] transition-all duration-300"
              style={{ width: `${miniProgress}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// SPOTIFY FULL PLAYER MODAL (Cover 320x320, Full Duration Progress, Offline Status, Explicit Preview Warning)
function SpotifyFullPlayerModal() {
  const {
    currentTrack,
    isPlaying,
    playlist,
    currentTimeSec,
    durationSec,
    volume,
    playbackRate,
    isLoop,
    isShuffle,
    youtubeId,
    isFullPlayerOpen,
    setIsFullPlayerOpen,
    togglePlay,
    playMusic,
    playNext,
    playPrevious,
    seekTo,
    setVolume,
    setPlaybackRate,
    setIsLoop,
    setIsShuffle,
    isTrackLiked,
    toggleLikeTrack,
    switchPlaybackMode,
    findAnotherFullVersion,
    ytStatusText,
    offlineTrackIds,
    downloadProgressMap,
    downloadTrackOffline,
    removeOfflineTrack,
  } = useMusic();

  if (!isFullPlayerOpen || !currentTrack) return null;

  const coverImg = currentTrack.cover || currentTrack.thumbnail || '';
  const trackTitle = currentTrack.title || 'Memutar Musik';
  const trackArtist = currentTrack.artist || currentTrack.author || 'VN MUSIC';
  const trackKey = currentTrack.id || `${trackTitle}__${trackArtist}`;
  const liked = isTrackLiked(trackKey);
  const isDownloaded = Boolean(currentTrack.id && offlineTrackIds.has(currentTrack.id));
  const dlProgress = currentTrack.id ? downloadProgressMap[currentTrack.id] : undefined;
  const isYoutubeMode = Boolean(currentTrack.playbackMode === 'youtube' || youtubeId);
  const isFullAudioMode =
    currentTrack.playbackMode === 'full' || currentTrack.playbackMode === 'offline';

  const effectiveDuration = Math.max(
    durationSec || 0,
    currentTrack.durationMs ? Math.round(currentTrack.durationMs / 1000) : 0
  );
  const progressPercent =
    effectiveDuration > 0
      ? Math.min(100, Math.max(0, (currentTimeSec / effectiveDuration) * 100))
      : 0;

  const formatTime = (sec: number) => {
    const clean = Math.max(0, Math.floor(sec || 0));
    const m = Math.floor(clean / 60);
    const s = clean % 60;
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (effectiveDuration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seekTo(pos * effectiveDuration);
  };

  const upNext = playlist.filter(
    (item) => (item.id || item.title) !== (currentTrack.id || currentTrack.title)
  );

  return (
    <div
      data-testid="spotify-full-player-modal"
      className="fixed inset-0 z-[10060] bg-[#121212] text-white overflow-y-auto flex flex-col"
    >
      {/* Top Bar */}
      <div className="sticky top-0 z-10 bg-[#181818]/95 backdrop-blur-md px-4 py-3 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setIsFullPlayerOpen(false)}
          className="w-11 h-11 rounded-full hover:bg-white/10 flex items-center justify-center cursor-pointer active:scale-90 transition"
          aria-label="Tutup Full Player"
        >
          <ChevronDown size={26} />
        </button>

        <div className="text-center min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-widest text-[#B3B3B3]">
            SEDANG DIPUTAR
          </p>
          <p className="text-xs font-bold text-white truncate max-w-[200px]">
            {currentTrack.album || 'VN Music Global'}
          </p>
        </div>

        <button
          type="button"
          onClick={() => toggleLikeTrack(currentTrack)}
          className="w-11 h-11 rounded-full hover:bg-white/10 flex items-center justify-center cursor-pointer active:scale-90 transition"
          aria-label="Sukai Lagu"
        >
          <Heart
            size={22}
            className={liked ? 'text-[#1DB954] fill-[#1DB954]' : 'text-[#B3B3B3]'}
          />
        </button>
      </div>

      {/* Main Content */}
      <div className="max-w-lg w-full mx-auto px-6 py-4 flex-1 flex flex-col items-center">
        {/* Cover 320x320 with Offline green badge */}
        <div className="w-[min(320px,78vw)] h-[min(320px,78vw)] rounded-xl overflow-hidden bg-[#737373] shadow-[0_20px_60px_rgba(0,0,0,0.75)] flex items-center justify-center shrink-0 relative">
          <PlayerCoverImg src={coverImg} alt={trackTitle} iconSize={72} />
          {isDownloaded && (
            <span className="absolute right-3 bottom-3 px-2.5 py-1 rounded-full bg-[#1DB954] text-black text-xs font-bold flex items-center gap-1 shadow-xl">
              <Download size={13} strokeWidth={3} />
              <span>Offline</span>
            </span>
          )}
        </div>

        {/* EXPLICIT 30-SECOND PREVIEW WARNING BANNER (Only shown when ALL full sources fail) */}
        {currentTrack.isPreviewFallback && (
          <div className="w-full mt-4 p-3 rounded-xl bg-red-500/20 border border-red-500/50 flex flex-col sm:flex-row items-center justify-between gap-2.5">
            <div className="flex items-center gap-2 text-xs font-bold text-red-200">
              <AlertTriangle size={18} className="text-red-400 shrink-0" />
              <span>⚠️ FULL TIDAK KETEMU, INI CUMA PREVIEW 30 DETIK</span>
            </div>
            <button
              type="button"
              onClick={findAnotherFullVersion}
              className="px-3.5 py-1.5 rounded-full bg-white text-black text-xs font-bold hover:bg-white/90 active:scale-95 transition flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              <RefreshCw size={13} />
              <span>Cari Full Lain</span>
            </button>
          </div>
        )}

        {/* Title 24px + Artist 18px + Offline Badge/Download Button */}
        <div className="w-full mt-6 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-[24px] font-bold text-white leading-tight truncate">
              {trackTitle}
            </h2>
            <p className="text-[18px] text-[#B3B3B3] mt-1 truncate">{trackArtist}</p>
            {ytStatusText && (
              <p
                className={`text-xs font-semibold mt-1 ${
                  currentTrack.isPreviewFallback ? 'text-red-400' : 'text-[#1DB954]'
                }`}
              >
                {ytStatusText}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => toggleLikeTrack(currentTrack)}
            className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 cursor-pointer active:scale-90 transition"
            aria-label={liked ? 'Hapus dari disukai' : 'Sukai'}
          >
            <Heart
              size={24}
              className={
                liked ? 'text-[#1DB954] fill-[#1DB954]' : 'text-[#B3B3B3] hover:text-white'
              }
            />
          </button>
        </div>

        {/* Offline Status & Download Action Button directly under title */}
        {currentTrack.source !== 'tiktok' && currentTrack.id && (
          <div className="w-full mt-3 flex flex-wrap items-center gap-2">
            {dlProgress && dlProgress.status !== 'error' ? (
              <div className="w-full bg-[#282828] rounded-xl p-2.5 border border-[#1DB954]/40">
                <div className="flex items-center justify-between text-xs font-bold text-[#1DB954] mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <Loader2 size={14} className="animate-spin" />
                    Mendownload {dlProgress.percent}% - {formatBytesMb(dlProgress.loadedBytes)} /{' '}
                    {formatBytesMb(dlProgress.totalBytes)}
                  </span>
                </div>
                <div className="h-1.5 bg-white/15 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#1DB954] transition-all"
                    style={{ width: `${dlProgress.percent}%` }}
                  />
                </div>
              </div>
            ) : isDownloaded ? (
              <>
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#1DB954]/20 border border-[#1DB954]/50 text-[#1DB954] text-xs font-bold">
                  <WifiOff size={13} />
                  <span>Tersedia Offline</span>
                </div>
                <button
                  type="button"
                  onClick={() => currentTrack.id && removeOfflineTrack(currentTrack.id)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-[#282828] hover:bg-red-500/20 text-xs font-bold text-[#B3B3B3] hover:text-red-300 border border-white/10 transition cursor-pointer"
                >
                  <Trash2 size={13} />
                  <span>Hapus Download</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => downloadTrackOffline(currentTrack)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#282828] hover:bg-[#333333] border border-white/15 text-xs font-bold text-white transition active:scale-95 cursor-pointer"
              >
                <Download size={15} className="text-[#1DB954]" />
                <span>Download Untuk Offline</span>
              </button>
            )}
          </div>
        )}

        {/* Mode Switches (Full Audio vs YouTube Full) */}
        {currentTrack.source !== 'tiktok' && (
          <div className="w-full flex items-center gap-2.5 mt-4">
            <button
              type="button"
              onClick={() => switchPlaybackMode('full')}
              className={`flex-1 min-h-[40px] px-3 py-2 rounded-full text-xs font-bold flex items-center justify-center gap-1.5 border transition cursor-pointer active:scale-95 whitespace-nowrap ${
                isFullAudioMode
                  ? 'bg-[#1DB954] text-black border-[#1DB954]'
                  : 'bg-[#282828] border-white/10 text-white hover:bg-[#333333]'
              }`}
            >
              <Disc3 size={15} />
              <span>Putar Full Audio</span>
            </button>
            <button
              type="button"
              onClick={() => switchPlaybackMode('youtube')}
              className={`flex-1 min-h-[40px] px-3 py-2 rounded-full text-xs font-bold flex items-center justify-center gap-1.5 border transition cursor-pointer active:scale-95 whitespace-nowrap ${
                isYoutubeMode
                  ? 'bg-white text-black border-white'
                  : 'bg-[#282828] border-white/10 text-white hover:bg-[#333333]'
              }`}
            >
              <Youtube size={15} />
              <span>Putar Full YouTube</span>
            </button>
          </div>
        )}

        {/* GARIS 1: Smooth Seek Progress Slider (Maju/Mundur Langsung Tanpa Mengulang Lagu) */}
        <div className="w-full mt-5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#B3B3B3]">
              Progress &amp; Seek Lagu
            </span>
            <span className="text-[11px] font-mono text-[#1DB954] font-semibold">
              {Math.round(progressPercent)}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={Math.max(1, effectiveDuration)}
            step={1}
            value={Math.min(currentTimeSec, Math.max(1, effectiveDuration))}
            onChange={(e) => seekTo(Number(e.target.value))}
            aria-label="Progress & Seek Lagu"
            data-testid="music-seek-slider"
            className="w-full h-2 rounded-full accent-[#1DB954] cursor-pointer appearance-none bg-white/20"
            style={{
              background: `linear-gradient(to right, #1DB954 ${progressPercent}%, rgba(255,255,255,0.2) ${progressPercent}%)`,
            }}
          />
          <div className="flex justify-between text-xs text-[#B3B3B3] mt-1.5 font-mono tabular-nums">
            <span>{formatTime(currentTimeSec)}</span>
            <span>{formatTime(effectiveDuration)}</span>
          </div>
        </div>



        {/* Main Controls: Shuffle · Prev · 72x72 #1DB954 Play/Pause · Next · Repeat */}
        <div className="w-full flex items-center justify-between mt-4">
          <button
            type="button"
            onClick={() => setIsShuffle(!isShuffle)}
            className="w-11 h-11 rounded-full flex items-center justify-center cursor-pointer active:scale-90 transition"
            aria-label="Shuffle"
          >
            <Shuffle size={22} className={isShuffle ? 'text-[#1DB954]' : 'text-[#B3B3B3]'} />
          </button>

          <button
            type="button"
            onClick={playPrevious}
            className="w-12 h-12 rounded-full flex items-center justify-center cursor-pointer active:scale-90 transition"
            aria-label="Sebelumnya"
          >
            <SkipBack size={30} className="text-white fill-white" />
          </button>

          <button
            type="button"
            onClick={togglePlay}
            className="w-[72px] h-[72px] rounded-full bg-[#1DB954] text-black flex items-center justify-center shadow-[0_8px_24px_rgba(29,185,84,0.45)] cursor-pointer active:scale-95 hover:scale-105 transition"
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <Pause size={30} className="fill-black text-black" />
            ) : (
              <Play size={30} className="fill-black text-black ml-1" />
            )}
          </button>

          <button
            type="button"
            onClick={playNext}
            className="w-12 h-12 rounded-full flex items-center justify-center cursor-pointer active:scale-90 transition"
            aria-label="Berikutnya"
          >
            <SkipForward size={30} className="text-white fill-white" />
          </button>

          <button
            type="button"
            onClick={() => setIsLoop(!isLoop)}
            className="w-11 h-11 rounded-full flex items-center justify-center cursor-pointer active:scale-90 transition"
            aria-label="Repeat"
          >
            <Repeat size={22} className={isLoop ? 'text-[#1DB954]' : 'text-[#B3B3B3]'} />
          </button>
        </div>

        {/* Volume */}
        <div className="w-full flex items-center gap-3 mt-5">
          <Volume2 size={18} className="text-[#B3B3B3] shrink-0" />
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(volume * 100)}
            onChange={(e) => setVolume(Number(e.target.value) / 100)}
            aria-label="Volume"
            className="flex-1 h-1.5 accent-[#1DB954] cursor-pointer"
          />
          <span className="text-xs font-mono tabular-nums text-[#B3B3B3] w-9 text-right">
            {Math.round(volume * 100)}%
          </span>
        </div>

        {/* Lagu Berikutnya (Queue) */}
        {upNext.length > 0 && (
          <div className="w-full mt-8 pb-8">
            <div className="flex items-center gap-2 mb-3">
              <ListMusic size={18} className="text-[#1DB954]" />
              <h3 className="text-base font-bold text-white">
                Lagu Berikutnya ({upNext.length})
              </h3>
            </div>
            <div className="space-y-1.5">
              {upNext.slice(0, 15).map((item, idx) => (
                <button
                  key={`${item.id || item.title}_${idx}`}
                  type="button"
                  onClick={() => playMusic(item)}
                  className="w-full p-2 rounded-xl bg-[#181818] hover:bg-[#282828] flex items-center gap-3 text-left cursor-pointer transition"
                >
                  <div className="w-11 h-11 rounded-md overflow-hidden bg-[#737373] shrink-0 flex items-center justify-center relative">
                    <PlayerCoverImg src={item.thumbnail || item.cover} alt={item.title} iconSize={18} />
                    {item.id && offlineTrackIds.has(item.id) && (
                      <span className="absolute right-0.5 bottom-0.5 w-3.5 h-3.5 rounded-full bg-[#1DB954] text-black flex items-center justify-center">
                        <Download size={8} strokeWidth={3} />
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-white truncate">{item.title}</p>
                    <p className="text-xs text-[#B3B3B3] truncate">
                      {item.artist || item.author || 'VN Music'}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export { GlobalMiniPlayer as MiniPlayer, GlobalMiniPlayer as MusicPlayerBar };

export function useMusic() {
  const context = useContext(MusicContext);
  if (!context) {
    throw new Error('useMusic must be used within MusicProvider');
  }
  return context;
}
