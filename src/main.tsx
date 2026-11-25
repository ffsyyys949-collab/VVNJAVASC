import React, { Component } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.warn('ErrorBoundary caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#080808] text-white flex flex-col items-center justify-center p-6 text-center">
          <div className="bg-[#141414] border border-white/10 rounded-[24px] p-6 max-w-sm w-full">
            <h2 className="text-lg font-bold mb-2">Terjadi Kesalahan Tampilan</h2>
            <p className="text-xs text-white/50 mb-4">{this.state.error?.message || 'Error tidak terduga'}</p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="bg-white text-black px-5 py-2 rounded-full text-xs font-bold hover:bg-white/90 active:scale-95 transition"
            >
              Muat Ulang
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

import { MusicProvider } from './contexts/MusicContext.tsx';
import { initFpsEngine } from './contexts/fpsEngine.ts';
import { buildAuthHeaders, getApiBaseUrl, startServerUrlSync } from './lib/apiBase.ts';

startServerUrlSync();

// Global API & APK Bridge:
// 1. Automatically attach Authorization: Bearer <token> & x-ze-actor-id on every /api/* request (Web & APK)
// 2. When inside Native APK (appassets.androidplatform.net), route /api/*, /uploads/*, SSE, and WS to live HTTPS URL
if (typeof window !== 'undefined') {
  const isBundledApk = window.location.hostname === 'appassets.androidplatform.net';
  const getDynamicApiBase = () => getApiBaseUrl().replace(/\/+$/, '');

  const rewritePathToApiBase = (url: string): string => {
    if (!isBundledApk) return url;
    const apiBase = getDynamicApiBase();
    if (url.startsWith('https://appassets.androidplatform.net/') || url.startsWith('http://appassets.androidplatform.net/')) {
      try {
        const parsed = new URL(url);
        if (parsed.pathname.startsWith('/api/') || parsed.pathname === '/api' || parsed.pathname.startsWith('/uploads/')) {
          return `${apiBase}${parsed.pathname}${parsed.search}`;
        }
      } catch {}
    }
    if (url.startsWith('/api/') || url === '/api' || url.startsWith('/uploads/')) {
      return `${apiBase}${url}`;
    }
    return url;
  };

  const isOurApiUrl = (rawUrl: string): boolean => {
    try {
      const apiBase = getDynamicApiBase();
      if (rawUrl.startsWith('/api/') || rawUrl === '/api') return true;
      if (rawUrl.startsWith(apiBase + '/api')) return true;
      const parsed = new URL(rawUrl, window.location.href);
      return parsed.pathname.startsWith('/api/') || parsed.pathname === '/api';
    } catch {
      return false;
    }
  };

  const safeOverrideWindowProp = <K extends 'fetch' | 'EventSource' | 'WebSocket'>(
    key: K,
    value: (typeof globalThis)[K]
  ): void => {
    try {
      const desc = Object.getOwnPropertyDescriptor(window, key);
      if (!desc || desc.configurable) {
        Object.defineProperty(window, key, {
          value,
          writable: true,
          configurable: true,
          enumerable: desc?.enumerable ?? true,
        });
        return;
      }
      if (desc.writable) {
        (window as unknown as Record<string, unknown>)[key] = value;
      }
    } catch {
      try {
        (window as unknown as Record<string, unknown>)[key] = value;
      } catch {
        // Ignore read-only/non-configurable host globals
      }
    }
  };

  if (typeof window.fetch === 'function') {
    const origFetch = window.fetch.bind(window);
    const wrappedFetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const apiBase = getDynamicApiBase();
      if (typeof input === 'string') {
        const targetUrl = rewritePathToApiBase(input);
        if (isOurApiUrl(targetUrl)) {
          return origFetch(targetUrl, { ...init, headers: buildAuthHeaders(init?.headers) });
        }
        return origFetch(targetUrl, init);
      }
      if (input instanceof URL) {
        const targetUrl = isBundledApk && input.hostname === 'appassets.androidplatform.net'
          ? rewritePathToApiBase(input.pathname + input.search)
          : input.toString();
        if (isOurApiUrl(targetUrl)) {
          return origFetch(targetUrl, { ...init, headers: buildAuthHeaders(init?.headers) });
        }
        return origFetch(targetUrl, init);
      }
      if (typeof Request !== 'undefined' && input instanceof Request) {
        try {
          const parsed = new URL(input.url);
          const rewritten =
            isBundledApk &&
            parsed.hostname === 'appassets.androidplatform.net' &&
            (parsed.pathname.startsWith('/api/') || parsed.pathname.startsWith('/uploads/'))
              ? `${apiBase}${parsed.pathname}${parsed.search}`
              : input.url;
          if (isOurApiUrl(rewritten)) {
            const mergedHeaders = buildAuthHeaders(init?.headers || input.headers);
            return origFetch(new Request(rewritten, input), { ...init, headers: mergedHeaders });
          }
          if (rewritten !== input.url) {
            return origFetch(new Request(rewritten, input), init);
          }
        } catch {}
      }
      return origFetch(input, init);
    }) as typeof window.fetch;
    safeOverrideWindowProp('fetch', wrappedFetch);
  }

  if (isBundledApk && typeof window.EventSource !== 'undefined') {
    const OrigEventSource = window.EventSource;
    const WrappedEventSource = class extends OrigEventSource {
      constructor(url: string | URL, eventSourceInitDict?: EventSourceInit) {
        const str = typeof url === 'string' ? rewritePathToApiBase(url) : url.toString();
        super(str, eventSourceInitDict);
      }
    } as typeof window.EventSource;
    safeOverrideWindowProp('EventSource', WrappedEventSource);
  }

  if (isBundledApk && typeof window.WebSocket !== 'undefined') {
    const OrigWebSocket = window.WebSocket;
    const WrappedWebSocket = class extends OrigWebSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        const apiBase = getDynamicApiBase();
        let target = typeof url === 'string' ? url : url.toString();
        try {
          const parsed = new URL(target, window.location.href);
          if (parsed.hostname === 'appassets.androidplatform.net') {
            const apiUrl = new URL(apiBase);
            const wsProto = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:';
            target = `${wsProto}//${apiUrl.host}${parsed.pathname}${parsed.search}`;
          }
        } catch {}
        super(target, protocols);
      }
    } as typeof window.WebSocket;
    safeOverrideWindowProp('WebSocket', WrappedWebSocket);
  }
}

initFpsEngine();

// Global Anti-Select / Anti-Copy Lockdown at App Root (blocks SelectionArea, long-press, double-tap highlight, copy/select-all)
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const isEditableTarget = (target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    if (tag === 'TEXTAREA') {
      const ta = target as HTMLTextAreaElement;
      return !ta.readOnly && !ta.disabled;
    }
    if (tag === 'INPUT') {
      const inp = target as HTMLInputElement;
      const nonTextTypes = new Set(['button', 'submit', 'reset', 'checkbox', 'radio', 'range', 'file', 'color', 'hidden']);
      return !inp.readOnly && !inp.disabled && !nonTextTypes.has((inp.type || 'text').toLowerCase());
    }
    return target.isContentEditable;
  };

  const clearNonEditableSelection = () => {
    try {
      const active = document.activeElement;
      if (isEditableTarget(active)) return;
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
        sel.removeAllRanges();
      }
    } catch {}
  };

  document.addEventListener(
    'selectstart',
    (e) => {
      if (!isEditableTarget(e.target)) {
        e.preventDefault();
        clearNonEditableSelection();
      }
    },
    true
  );

  document.addEventListener('selectionchange', () => {
    try {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
      const anchorNode = sel.anchorNode;
      const anchorEl =
        anchorNode instanceof HTMLElement
          ? anchorNode
          : anchorNode?.parentElement || document.activeElement;
      if (!isEditableTarget(anchorEl) && !isEditableTarget(document.activeElement)) {
        sel.removeAllRanges();
      }
    } catch {}
  });

  document.addEventListener(
    'dblclick',
    (e) => {
      if (!isEditableTarget(e.target)) {
        clearNonEditableSelection();
      }
    },
    true
  );

  // Bubble phase preserves React onContextMenu handlers while stopping native browser/Android "Salin" popup
  document.addEventListener('contextmenu', (e) => {
    if (!isEditableTarget(e.target)) {
      e.preventDefault();
    }
  });

  document.addEventListener(
    'copy',
    (e) => {
      if (!isEditableTarget(e.target) && !isEditableTarget(document.activeElement)) {
        e.preventDefault();
        clearNonEditableSelection();
      }
    },
    true
  );

  document.addEventListener(
    'cut',
    (e) => {
      if (!isEditableTarget(e.target) && !isEditableTarget(document.activeElement)) {
        e.preventDefault();
      }
    },
    true
  );

  document.addEventListener(
    'keydown',
    (e) => {
      if ((e.ctrlKey || e.metaKey) && !isEditableTarget(e.target)) {
        const key = e.key.toLowerCase();
        if (key === 'a' || key === 'c' || key === 'x') {
          e.preventDefault();
        }
      }
    },
    true
  );

  document.addEventListener(
    'dragstart',
    (e) => {
      if (!isEditableTarget(e.target)) {
        e.preventDefault();
      }
    },
    true
  );
}

// Register ZE.io Service Worker for Native Notifications & Background Services (web/PWA only; APK uses native Foreground Services)
if (
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  window.location.hostname !== 'appassets.androidplatform.net'
) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('ZE.io Service Worker registration skipped:', err);
    });
  });
}

const PRELOAD_IMAGE_ASSETS = ['/assets/bg_water_still.webp', '/assets/banner_poster.webp'];
const PRELOAD_VIDEO_ASSETS = [
  '/assets/aistudio/ssstik.io_1793231239969_f00ac994.mp4',
  '/assets/aistudio/ssstik.io_1792870405896_cd0f92f4.mp4',
];

function preloadCriticalStartupAssets(): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve();
  }

  const imagePromises = PRELOAD_IMAGE_ASSETS.map(
    (src) =>
      new Promise<void>((resolve) => {
        const img = new Image();
        img.decoding = 'sync';
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          resolve();
        };
        img.onload = () => {
          if (typeof img.decode === 'function') {
            img.decode().then(finish).catch(finish);
          } else {
            finish();
          }
        };
        img.onerror = finish;
        img.src = src;
        if (img.complete) finish();
      })
  );

  // Warm up autoplay videos so banner & background decode immediately on Home entry
  PRELOAD_VIDEO_ASSETS.forEach((src) => {
    try {
      const v = document.createElement('video');
      v.preload = 'auto';
      v.muted = true;
      v.playsInline = true;
      v.src = src;
      v.load();
    } catch {}
  });

  // Never stall initial paint longer than 250ms if a slower device takes longer to decode
  return Promise.race([
    Promise.all(imagePromises).then(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, 250)),
  ]);
}

const rootEl = document.getElementById('root');
if (rootEl) {
  const root = createRoot(rootEl);
  preloadCriticalStartupAssets().finally(() => {
    root.render(
      <ErrorBoundary>
        <MusicProvider>
          <div className="select-none">
            <App />
          </div>
        </MusicProvider>
      </ErrorBoundary>
    );
  });
}

