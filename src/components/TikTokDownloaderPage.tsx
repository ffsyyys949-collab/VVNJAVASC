import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Film,
  Download,
  Music,
  Link as LinkIcon,
  Clipboard,
  AlertCircle,
  Clock,
  Play,
  Share2,
  Trash2,
  CheckCircle2,
  RefreshCw,
  HelpCircle,
} from 'lucide-react';
import { getHomeThemeTokens, useHomeUiConfig } from '../contexts/homeUiConfig.ts';
import { resolveTikTokVideo, downloadMediaAsset, isApkWebView } from '../lib/zeDataSync.ts';
import { getApiBaseUrl } from '../lib/apiBase.ts';

export interface TikTokVideoData {
  title: string;
  author: string;
  avatar?: string;
  cover: string;
  play: string;
  hdplay?: string;
  music?: string;
  proxiedPlay?: string;
  proxiedHdPlay?: string;
  proxiedMusic?: string;
  resolvedUrl?: string;
  succeededApi?: string;
  apiLogs?: string[];
  musicTitle?: string;
  duration?: number;
  id?: string;
  timestamp?: number;
}

function toPlayableMediaUrl(rawUrl?: string): string {
  if (!rawUrl) return '';
  if (rawUrl.startsWith('/') && isApkWebView()) {
    return `${getApiBaseUrl()}${rawUrl}`;
  }
  return rawUrl;
}

export function TikTokDownloaderPage({
  onBack,
  onPlayAsMusic,
}: {
  onBack: () => void;
  onPlayAsMusic?: (track: {
    title: string;
    videoUrl?: string;
    audioUrl?: string;
    thumbnail: string;
    author: string;
    source: 'tiktok';
    sourceType: 'tiktok';
  }) => void;
}) {
  const [urlInput, setUrlInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showLongLinkGuide, setShowLongLinkGuide] = useState(false);
  const [apiLogs, setApiLogs] = useState<string[]>([]);
  const [videoData, setVideoData] = useState<TikTokVideoData | null>(null);
  const [downloadingType, setDownloadingType] = useState<string | null>(null);
  const [copiedStatus, setCopiedStatus] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<
    Record<string, { pct: number; status: 'progress' | 'done' | 'error'; msg?: string }>
  >({});

  const { config: homeUiConfig } = useHomeUiConfig();
  const themeTokens = getHomeThemeTokens(
    homeUiConfig.themeId,
    homeUiConfig.boxStyle,
    homeUiConfig.shadowIntensity,
    homeUiConfig.shadowThickness
  );
  const [history, setHistory] = useState<TikTokVideoData[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('ze_tiktok_history') || '[]');
    } catch {
      return [];
    }
  });

  // Auto check clipboard on mount
  useEffect(() => {
    if (navigator.clipboard && navigator.clipboard.readText) {
      navigator.clipboard
        .readText()
        .then((text) => {
          if (text && (text.includes('tiktok.com') || text.includes('douyin.com')) && !urlInput) {
            setUrlInput(text.trim());
          }
        })
        .catch(() => {});
    }
  }, []);

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrlInput(text.trim());
        setErrorMsg(null);
      }
    } catch {
      // fallback
    }
  };

  const handleResetInput = async () => {
    setUrlInput('');
    setErrorMsg(null);
    setVideoData(null);
    setApiLogs([]);
    setDownloadProgress({});
    setShowLongLinkGuide(false);
    try {
      const text = await navigator.clipboard?.readText?.();
      if (text && (text.includes('tiktok.com') || text.includes('douyin.com'))) {
        setUrlInput(text.trim());
      }
    } catch {}
  };

  const handleFetchVideo = async (targetUrl?: string) => {
    const link = (targetUrl || urlInput).trim();
    if (!link) return;

    if (!link.includes('tiktok.com') && !link.includes('douyin.com')) {
      setErrorMsg('Format link harus berasal dari tiktok.com atau vt.tiktok.com.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    setVideoData(null);
    setApiLogs([]);

    try {
      const d = await resolveTikTokVideo(link);
      const newVideo: TikTokVideoData = {
        id: d.id || 'tt_' + Date.now(),
        title: d.title || 'TikTok Video (No Watermark)',
        author: d.author?.nickname || d.author?.unique_id || 'TikTok Creator',
        avatar: d.author?.avatar,
        cover: d.cover || '',
        play: d.play || '',
        hdplay: d.hdplay || d.play || '',
        music: d.music || d.music_info?.play || '',
        proxiedPlay: d.proxiedPlay,
        proxiedHdPlay: d.proxiedHdPlay,
        proxiedMusic: d.proxiedMusic,
        resolvedUrl: d.resolvedUrl,
        succeededApi: d.succeededApi,
        apiLogs: d.apiLogs,
        musicTitle: d.music_info?.title || d.title,
        duration: (d as any).duration || 0,
        timestamp: Date.now(),
      };

      setVideoData(newVideo);
      if (Array.isArray(d.apiLogs)) {
        setApiLogs(d.apiLogs);
      }

      // Save to history
      setHistory((prev) => {
        const next = [newVideo, ...prev.filter((item) => item.id !== newVideo.id)].slice(0, 20);
        localStorage.setItem('ze_tiktok_history', JSON.stringify(next));
        return next;
      });
    } catch (e: any) {
      if (Array.isArray(e?.apiLogs)) {
        setApiLogs(e.apiLogs);
      }
      setErrorMsg(
        e?.message ||
          'Semua API TikTok lagi down / diblokir. Coba lagi 1 menit lagi atau paste link panjang.'
      );
      if (e?.redirectFailed || link.includes('vt.tiktok.com') || link.includes('vm.tiktok.com')) {
        setShowLongLinkGuide(true);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.__zeNativeDownloadProgress = (downloadId, pct, status, message) => {
      setDownloadProgress((prev) => ({
        ...prev,
        [downloadId]: { pct, status, msg: message },
      }));
      if (status === 'done') {
        setTimeout(() => {
          setDownloadingType(null);
        }, 1200);
      } else if (status === 'error') {
        setDownloadingType(null);
        if (message) setErrorMsg(message);
      }
    };
    return () => {
      delete window.__zeNativeDownloadProgress;
    };
  }, []);

  const triggerDownload = async (
    url: string,
    filename: string,
    typeKey: string,
    mimeType = 'video/mp4'
  ) => {
    if (!url) return;
    setDownloadingType(typeKey);
    const cleanFilename = filename.replace(/[/\\?%*:|"<>]/g, '_');
    const downloadId = `dl_${typeKey}_${Date.now()}`;

    setDownloadProgress((prev) => ({
      ...prev,
      [downloadId]: { pct: 1, status: 'progress', msg: 'Memulai unduhan...' },
    }));

    const resolvedUrl = toPlayableMediaUrl(url);
    const nativeBridge = typeof window !== 'undefined' ? window.ZeNative : undefined;

    if (nativeBridge?.downloadMediaWithProgress) {
      const started = nativeBridge.downloadMediaWithProgress(
        downloadId,
        resolvedUrl,
        cleanFilename,
        mimeType
      );
      if (started) return;
    }

    try {
      const ok = await downloadMediaAsset(resolvedUrl, cleanFilename, mimeType);
      if (!ok) {
        setErrorMsg('Gagal mengunduh media. Coba tekan tombol download sekali lagi.');
        setDownloadingType(null);
      } else {
        setDownloadProgress((prev) => ({
          ...prev,
          [downloadId]: { pct: 100, status: 'done', msg: 'Tersimpan di Galeri' },
        }));
        setTimeout(() => setDownloadingType(null), 1200);
      }
    } catch (e: any) {
      setErrorMsg(e?.message || 'Gagal mengunduh otomatis. Coba lagi.');
      setDownloadingType(null);
    }
  };

  const handleShare = async (data: TikTokVideoData) => {
    const shareUrl = data.resolvedUrl || data.play || window.location.href;
    if (navigator.share) {
      navigator
        .share({
          title: data.title,
          text: `Lihat video TikTok ini tanpa watermark: ${data.title}`,
          url: shareUrl,
        })
        .catch(() => {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(shareUrl);
      setCopiedStatus(true);
      setTimeout(() => setCopiedStatus(false), 2000);
    }
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem('ze_tiktok_history');
  };

  const previewVideoSrc = videoData
    ? toPlayableMediaUrl(videoData.proxiedPlay || videoData.play)
    : '';
  const standardDownloadUrl = videoData
    ? toPlayableMediaUrl(videoData.proxiedPlay || videoData.play)
    : '';
  const hdDownloadUrl = videoData
    ? toPlayableMediaUrl(videoData.proxiedHdPlay || videoData.hdplay || videoData.proxiedPlay || videoData.play)
    : '';
  const musicDownloadUrl = videoData
    ? toPlayableMediaUrl(videoData.proxiedMusic || videoData.music || videoData.proxiedPlay || videoData.play)
    : '';

  return (
    <div className="min-h-screen bg-[#050505] text-white pb-[120px] select-none">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-black/70 backdrop-blur-xl border-b border-white/[0.08] px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <button
            onClick={onBack}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white cursor-pointer transition active:scale-95 shrink-0"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-1.5 whitespace-nowrap overflow-hidden text-ellipsis">
              <Film size={18} className="text-white shrink-0" strokeWidth={1.5} />
              <span className="truncate">TikTok Downloader No WM</span>
            </h2>
            <p className="text-[10px] text-white/50 line-clamp-2 leading-[1.3] overflow-hidden">
              Download video TikTok tanpa watermark asli HD &amp; MP3
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleResetInput}
          className="bg-white/10 hover:bg-white/20 border border-white/20 px-2.5 py-1 rounded-full text-[10px] font-semibold text-white flex items-center gap-1 shrink-0 whitespace-nowrap cursor-pointer active:scale-95 transition"
          title="Bersihkan input dan paste ulang"
        >
          <RefreshCw size={11} />
          <span>Paste Ulang</span>
        </button>
      </div>

      <div className="p-4 max-w-md mx-auto space-y-4">
        {/* Main Input Form */}
        <div className="bg-[#141414]/90 backdrop-blur-[24px] border border-white/10 rounded-[28px] p-5 shadow-[0_8px_32px_rgba(0,0,0,0.5)] relative overflow-hidden">
          <div className="absolute -top-10 -right-10 w-28 h-28 bg-white/5 rounded-full blur-2xl pointer-events-none" />

          <p className="text-xs font-semibold text-white/80 mb-2 flex items-center gap-1.5">
            <LinkIcon size={14} className="text-white" strokeWidth={1.5} />
            Paste Link Video TikTok (Pendek vt.tiktok.com / Panjang)
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleFetchVideo();
            }}
            className="space-y-3"
          >
            <div className="bg-black/50 border border-white/15 rounded-full px-4 py-2.5 flex items-center gap-2 focus-within:border-white/40 transition">
              <input
                type="text"
                placeholder="https://vt.tiktok.com/... atau https://www.tiktok.com/@..."
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                className="bg-transparent flex-1 text-xs text-white placeholder-white/30 outline-none"
              />
              <button
                type="button"
                onClick={handlePaste}
                className="px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/20 text-white/80 text-[10px] font-semibold flex items-center gap-1 cursor-pointer transition active:scale-95 shrink-0"
                title="Paste dari Clipboard"
              >
                <Clipboard size={11} /> Paste
              </button>
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={!urlInput.trim() || isLoading}
                className="flex-1 py-3.5 rounded-full bg-white text-black font-bold text-xs hover:bg-white/90 active:scale-95 transition disabled:opacity-40 cursor-pointer shadow-lg flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                    <span>Mengambil Video (5 Server)...</span>
                  </>
                ) : (
                  <>
                    <Download size={15} />
                    <span>Get Video (No Watermark)</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {errorMsg && (
            <div className="mt-3 p-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-200 text-xs space-y-2.5">
              <div className="flex items-start gap-2">
                <AlertCircle size={16} className="shrink-0 text-red-400 mt-0.5" />
                <span className="leading-relaxed">{errorMsg}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setShowLongLinkGuide((v) => !v)}
                  className="px-3 py-1.5 rounded-full bg-white/15 hover:bg-white/25 text-white font-semibold text-[11px] flex items-center gap-1 cursor-pointer transition"
                >
                  <HelpCircle size={12} />
                  <span>Coba Dengan Link Panjang</span>
                </button>
                <button
                  type="button"
                  onClick={handleResetInput}
                  className="px-3 py-1.5 rounded-full bg-white text-black font-bold text-[11px] flex items-center gap-1 cursor-pointer transition"
                >
                  <RefreshCw size={11} />
                  <span>Paste Ulang</span>
                </button>
              </div>
            </div>
          )}

          {showLongLinkGuide && (
            <div className="mt-3 p-3 rounded-2xl bg-sky-500/10 border border-sky-400/25 text-[11px] text-sky-100 space-y-1.5">
              <p className="font-bold text-sky-300">Cara Ambil Link Panjang TikTok:</p>
              <ol className="list-decimal list-inside space-y-1 text-white/80">
                <li>Buka video di aplikasi TikTok atau browser HP.</li>
                <li>Tap ikon <b>Bagikan (Share)</b> → <b>Salin Tautan</b> atau buka link pendek di browser lalu salin URL panjang di address bar.</li>
                <li>Contoh format panjang: <span className="font-mono text-sky-300">https://www.tiktok.com/@user/video/7106594312292453675</span></li>
                <li>Tap <b>Paste Ulang</b> di atas lalu tekan <b>Get Video (No Watermark)</b>.</li>
              </ol>
            </div>
          )}
        </div>

        {/* Video Result Card + Embedded Video Preview */}
        {videoData && (
          <div className="bg-[#181818]/95 backdrop-blur-[28px] border border-white/15 rounded-[28px] p-5 shadow-[0_12px_40px_rgba(0,0,0,0.6)] space-y-4">
            {/* Embedded Real Video Preview */}
            {previewVideoSrc && (
              <div className="w-full rounded-2xl overflow-hidden bg-black border border-white/10 relative">
                <video
                  src={previewVideoSrc}
                  poster={videoData.cover}
                  controls
                  playsInline
                  preload="metadata"
                  className="w-full max-h-[340px] object-contain bg-black"
                />
              </div>
            )}

            <div className="flex gap-3.5 items-start">
              <div className="w-16 h-20 rounded-xl overflow-hidden bg-black/60 border border-white/10 shrink-0 relative shadow-md">
                {videoData.cover ? (
                  <img
                    src={videoData.cover}
                    alt={videoData.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white/40">
                    <Film size={20} />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent flex items-end justify-center pb-1">
                  <span className="text-[10px] text-white/90 font-mono font-medium">
                    {videoData.duration ? `${videoData.duration}s` : 'HD'}
                  </span>
                </div>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[9px] uppercase font-mono font-bold bg-sky-500/20 text-sky-300 px-2 py-0.5 rounded-full">
                    No Watermark
                  </span>
                  {videoData.succeededApi && (
                    <span className="text-[9px] font-mono bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full truncate max-w-[130px]">
                      {videoData.succeededApi}
                    </span>
                  )}
                  <button
                    onClick={() => handleShare(videoData)}
                    className="p-1 rounded-full text-white/60 hover:text-white transition ml-auto cursor-pointer"
                    title="Bagikan Tautan"
                  >
                    <Share2 size={14} />
                  </button>
                </div>

                {copiedStatus && (
                  <p className="text-[10px] text-emerald-400 font-semibold mb-1">
                    Tautan disalin ke clipboard!
                  </p>
                )}

                <p className="text-sm font-bold text-white line-clamp-2 leading-snug">
                  {videoData.title}
                </p>

                <p className="text-xs text-white/60 mt-1 truncate">By {videoData.author}</p>

                {videoData.musicTitle && (
                  <p className="text-[11px] text-white/40 mt-1 truncate flex items-center gap-1 font-mono">
                    <Music size={11} /> {videoData.musicTitle}
                  </p>
                )}
              </div>
            </div>

            {/* Real Download Action Buttons */}
            {(() => {
              const progKey = Object.keys(downloadProgress).find((k) => k.includes('standard'));
              const prog = progKey ? downloadProgress[progKey] : null;
              const isProg = downloadingType === 'standard' || (prog && prog.status === 'progress');
              const isDone = prog && prog.status === 'done';
              const pctVal = prog?.pct || (isProg ? 50 : 0);

              return (
                <div className="space-y-2.5">
                  <div className="space-y-1.5">
                    <button
                      onClick={() =>
                        triggerDownload(
                          standardDownloadUrl,
                          `${videoData.title || 'tiktok'}_no_wm.mp4`,
                          'standard'
                        )
                      }
                      disabled={Boolean(isProg) || !standardDownloadUrl}
                      className="w-full py-3.5 rounded-full bg-white text-black font-bold text-xs hover:bg-white/90 active:scale-95 transition flex items-center justify-center gap-2 cursor-pointer shadow-lg disabled:opacity-70"
                    >
                      {isProg ? (
                        <>
                          <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                          <span>Mengunduh... {pctVal}%</span>
                        </>
                      ) : isDone ? (
                        <>
                          <CheckCircle2 size={16} className="text-green-600" />
                          <span>Tersimpan di Galeri</span>
                        </>
                      ) : (
                        <>
                          <Download size={16} strokeWidth={2} />
                          <span>Download Video No Watermark (HD MP4)</span>
                        </>
                      )}
                    </button>

                    {isProg && (
                      <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                        <div
                          className="h-full bg-sky-400 transition-all duration-200"
                          style={{ width: `${Math.max(5, pctVal)}%` }}
                        />
                      </div>
                    )}

                    {isDone && (
                      <button
                        type="button"
                        onClick={() => {
                          const nb = typeof window !== 'undefined' ? window.ZeNative : undefined;
                          if (nb?.openNativeGallery) {
                            nb.openNativeGallery('video/mp4');
                          }
                        }}
                        className="w-full py-2.5 rounded-full bg-green-500/20 border border-green-400/40 text-green-300 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition shadow-md"
                      >
                        <Film size={14} />
                        <span>Buka Galeri</span>
                      </button>
                    )}
                  </div>

                  {hdDownloadUrl && (
                    <button
                      onClick={() =>
                        triggerDownload(
                          hdDownloadUrl,
                          `${videoData.title || 'tiktok'}_ultra_hd.mp4`,
                          'hd'
                        )
                      }
                      disabled={downloadingType === 'hd'}
                      className="w-full py-3 rounded-full bg-white/10 hover:bg-white/15 border border-white/20 text-white font-semibold text-xs active:scale-95 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                    >
                      {downloadingType === 'hd' ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>Mengunduh Full HD...</span>
                        </>
                      ) : (
                        <>
                          <Download size={15} />
                          <span>Download HD No WM (Kualitas Tertinggi)</span>
                        </>
                      )}
                    </button>
                  )}

                  {musicDownloadUrl && (
                    <button
                      onClick={() => {
                        const cleanName = `${videoData.title || 'tiktok'}_audio.mp3`.replace(
                          /[/\\?%*:|"<>]/g,
                          '_'
                        );
                        triggerDownload(musicDownloadUrl, cleanName, 'mp3', 'audio/mpeg');
                      }}
                      disabled={downloadingType === 'mp3'}
                      className="w-full py-2.5 rounded-full bg-transparent hover:bg-white/5 border border-white/15 text-white/80 font-medium text-xs active:scale-95 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                    >
                      {downloadingType === 'mp3' ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>Mengunduh Audio MP3...</span>
                        </>
                      ) : (
                        <>
                          <Music size={14} />
                          <span>Download Audio MP3</span>
                        </>
                      )}
                    </button>
                  )}

                  {/* Integration with Music Lab */}
                  {onPlayAsMusic && (
                    <button
                      onClick={() => {
                        onPlayAsMusic({
                          title: videoData.title,
                          videoUrl: standardDownloadUrl || videoData.play,
                          audioUrl: musicDownloadUrl || videoData.music,
                          thumbnail: videoData.cover,
                          author: videoData.author,
                          source: 'tiktok',
                          sourceType: 'tiktok',
                        });
                      }}
                      className="w-full py-2.5 rounded-full bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 text-purple-200 font-semibold text-xs active:scale-95 transition flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Play size={14} className="fill-purple-300" />
                      <span>Putar Sebagai Background Music di VNJAVA</span>
                    </button>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* Download History */}
        {history.length > 0 && (
          <div
            data-logo-anim={homeUiConfig.logoAnimation}
            style={themeTokens.cardStyle}
            className="p-5"
          >
            <div className="flex items-center justify-between mb-3">
              <h3
                style={{ color: themeTokens.cardTitleColor }}
                className="text-xs font-semibold flex items-center gap-1.5 uppercase tracking-wider"
              >
                <Clock size={13} /> Riwayat Download ({history.length})
              </h3>
              <button
                onClick={clearHistory}
                style={{ color: themeTokens.cardSubtitleColor }}
                className="text-[10px] hover:opacity-100 opacity-75 flex items-center gap-1 cursor-pointer transition"
              >
                <Trash2 size={11} /> Bersihkan
              </button>
            </div>

            <div className="space-y-2.5">
              {history.map((item, idx) => (
                <div
                  key={item.id || idx}
                  style={themeTokens.cardStyle}
                  className="ze-feature-card p-2.5 flex items-center justify-between gap-3 transition"
                >
                  <div
                    onClick={() => {
                      setUrlInput(item.resolvedUrl || item.play);
                      setVideoData(item);
                      setErrorMsg(null);
                    }}
                    className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer"
                  >
                    <img
                      src={item.cover}
                      alt={item.title}
                      className="w-10 h-10 rounded-xl object-cover border border-white/10 shrink-0 ze-video-thumb-zoom"
                    />
                    <div className="min-w-0 flex-1">
                      <p
                        style={{ color: themeTokens.cardTitleColor }}
                        className="text-xs font-medium truncate"
                      >
                        {item.title}
                      </p>
                      <p
                        style={{ color: themeTokens.cardSubtitleColor }}
                        className="text-[10px] truncate"
                      >
                        {item.author}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() =>
                        triggerDownload(
                          toPlayableMediaUrl(item.proxiedPlay || item.play),
                          `${item.title}_no_wm.mp4`,
                          `hist_${idx}`
                        )
                      }
                      style={themeTokens.iconBoxStyle}
                      className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer transition active:scale-95"
                      title="Download Ulang"
                    >
                      <Download size={13} style={{ color: themeTokens.cardIconColor }} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
