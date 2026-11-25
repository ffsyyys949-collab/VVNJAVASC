import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Camera,
  Check,
  Delete,
  Image as ImageIcon,
  Loader2,
  Lock,
  Palette,
  Send,
  Settings,
  Trash2,
  X
} from 'lucide-react';
import {
  ACharacterArt,
  analyzeAutoVisualState,
  preloadZeyaPoseImages,
  type AGesture
} from './ACharacterArt.tsx';
import { streamCompanionAChat } from '../lib/aiStream.ts';
import { safeApiFetch } from '../lib/zeDataSync.ts';
import { db, doc, getDoc, setDoc } from '../firebase.ts';

export const DEFAULT_A_AVATAR =
  '/assets/aistudio/7741a2f2268b0c1a726851829218cce6_8fa525c6.jpg';

const LEGACY_OLD_AVATAR_SUBSTR = 'IMG_b4c25b86-a1c4-4712-9ab2-40c765fd572f';

export type AExpression =
  | 'senang'
  | 'sedih'
  | 'malu'
  | 'bingung'
  | 'semangat'
  | 'ngantuk'
  | 'kaget'
  | 'ngambek lucu'
  | 'marah';

export type ASafePose =
  | 'berdiri'
  | 'duduk'
  | 'jongkok'
  | 'peluk'
  | 'jalan santai'
  | 'pake hoodie'
  | 'pake topi'
  | 'pake kacamata'
  | 'pake jaket'
  | 'minum'
  | 'tidur'
  | 'tiduran'
  | 'tiduran dengan baju lengkap dan sopan';

export type ABubbleStyle =
  | 'default'
  | 'whee-sketch'
  | 'bubbly-otter'
  | 'glam-diva'
  | 'custom';

export type ABgTheme =
  | 'blue-stars'
  | 'midnight-navy'
  | 'pink-night'
  | 'aurora-purple'
  | 'custom';

export interface ACompanionSettings {
  aiName: string;
  avatarUrl: string;
  bgTheme: ABgTheme;
  customBgColor: string;
  bubbleStyle: ABubbleStyle;
  customAiBubbleColor: string;
  customUserBubbleColor: string;
  customPrompt: string;
  adultMode18Plus?: boolean;
}

export interface ACompanionState {
  posisi: ASafePose;
  ekspresi: AExpression;
  headbandRemoved: boolean;
  hatOn?: boolean;
  glassesOn?: boolean;
  hoodieOn?: boolean;
  jacketOn?: boolean;
  drinkOn?: boolean;
  lastGesture?: AGesture;
  lastVariant?: number;
}

const DEFAULT_A_STATE: ACompanionState = {
  posisi: 'berdiri',
  ekspresi: 'senang',
  headbandRemoved: false,
  hatOn: false,
  glassesOn: false,
  hoodieOn: false,
  jacketOn: false,
  drinkOn: false,
  lastGesture: 'dadah',
  lastVariant: 0
};

export interface ACompanionMessage {
  id: string;
  sender: 'user' | 'ai';
  text?: string;
  expression?: AExpression;
  pose?: ASafePose;
  gesture?: AGesture;
  poseVariant?: number;
  headbandRemoved?: boolean;
  hatOn?: boolean;
  glassesOn?: boolean;
  hoodieOn?: boolean;
  jacketOn?: boolean;
  drinkOn?: boolean;
  imageUrl?: string;
  time: string;
}

function enforceHyphenatedSayang(text: string): string {
  return String(text || '')
    .replace(/\bsayang+[\s-]*ku+\b/gi, (m) => (m[0] === m[0].toUpperCase() ? 'Sa-yang ku' : 'sa-yang ku'))
    .replace(/\bsayang+\b/gi, (m) => (m[0] === m[0].toUpperCase() ? 'Sa-yang' : 'sa-yang'));
}

function stripALabelTags(text: string): string {
  return String(text || '')
    .replace(/\[Label:[\s\S]*?\]/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

const DEFAULT_A_SETTINGS: ACompanionSettings = {
  aiName: 'A!',
  avatarUrl: DEFAULT_A_AVATAR,
  bgTheme: 'blue-stars',
  customBgColor: '#123884',
  bubbleStyle: 'default',
  customAiBubbleColor: '#ffffff',
  customUserBubbleColor: '#ec4899',
  customPrompt: '',
  adultMode18Plus: false
};

function compressImageDataUrl(file: File, maxSide = 720, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca gambar'));
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => resolve(String(reader.result));
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

// --------------------------------------------------------------------------
// CHARACTER EXPRESSION & SAFE POSE VISUAL COMPOSITOR (PRESERVES SAME FACE)
// --------------------------------------------------------------------------
function AExpressionPortrait({
  avatarUrl,
  expression,
  pose,
  aiName
}: {
  avatarUrl: string;
  expression: AExpression;
  pose: ASafePose;
  aiName: string;
}) {
  const exprConfig: Record<
    AExpression,
    {
      filter: string;
      imgClass: string;
      tint: string;
      badgeBg: string;
      sticker: string;
    }
  > = {
    senang: {
      filter: 'brightness(1.06) saturate(1.12)',
      imgClass: 'scale-[1.03]',
      tint: 'from-pink-400/15 via-transparent to-amber-300/15',
      badgeBg: 'bg-pink-500/85 text-white',
      sticker: '✨😊'
    },
    sedih: {
      filter: 'brightness(0.88) saturate(0.78) hue-rotate(-6deg)',
      imgClass: 'scale-[1.01] translate-y-0.5',
      tint: 'from-sky-900/30 via-transparent to-indigo-950/35',
      badgeBg: 'bg-sky-600/85 text-white',
      sticker: '💧🥺'
    },
    malu: {
      filter: 'brightness(1.04) saturate(1.18)',
      imgClass: 'scale-[1.04] -rotate-1',
      tint: 'from-rose-500/20 via-pink-400/10 to-rose-500/20',
      badgeBg: 'bg-rose-500/85 text-white',
      sticker: '💗😳'
    },
    bingung: {
      filter: 'brightness(1.0) contrast(1.04)',
      imgClass: 'scale-[1.03] rotate-2',
      tint: 'from-amber-400/10 via-transparent to-purple-500/15',
      badgeBg: 'bg-amber-500/90 text-black',
      sticker: '❓🤔'
    },
    semangat: {
      filter: 'brightness(1.1) contrast(1.08) saturate(1.22)',
      imgClass: 'scale-[1.06] -translate-y-0.5',
      tint: 'from-amber-300/20 via-transparent to-pink-400/20',
      badgeBg: 'bg-amber-400 text-black',
      sticker: '⚡🌟'
    },
    ngantuk: {
      filter: 'brightness(0.84) saturate(0.85) sepia(0.1)',
      imgClass: 'scale-[1.01] translate-y-1',
      tint: 'from-indigo-950/40 via-slate-900/15 to-purple-950/35',
      badgeBg: 'bg-indigo-600/85 text-white',
      sticker: '💤😴'
    },
    kaget: {
      filter: 'brightness(1.12) contrast(1.12)',
      imgClass: 'scale-[1.09]',
      tint: 'from-cyan-400/15 via-transparent to-rose-400/15',
      badgeBg: 'bg-cyan-500 text-black',
      sticker: '❗😲'
    },
    'ngambek lucu': {
      filter: 'brightness(1.02) saturate(1.16)',
      imgClass: 'scale-[1.04] -rotate-2',
      tint: 'from-red-500/20 via-transparent to-pink-500/20',
      badgeBg: 'bg-rose-600/90 text-white',
      sticker: '💢😤'
    },
    marah: {
      filter: 'brightness(1.0) contrast(1.1) saturate(1.2)',
      imgClass: 'scale-[1.05]',
      tint: 'from-red-600/25 via-transparent to-orange-500/20',
      badgeBg: 'bg-red-600/90 text-white',
      sticker: '😠💢'
    }
  };

  const cfg = exprConfig[expression] || exprConfig.senang;
  const isLyingSafe =
    pose === 'tiduran' ||
    pose === 'tidur' ||
    pose === 'tiduran dengan baju lengkap dan sopan';

  return (
    <div className="mt-2.5 space-y-1.5">
      <div
        className={`relative w-44 sm:w-48 h-48 sm:h-52 rounded-2xl overflow-hidden border border-white/25 shadow-[0_8px_20px_rgba(0,0,0,0.45)] bg-slate-900 select-none ${
          isLyingSafe ? 'ring-2 ring-indigo-300/40' : pose === 'peluk' ? 'ring-2 ring-pink-400/60' : ''
        }`}
      >
        <img
          src={avatarUrl || DEFAULT_A_AVATAR}
          alt={`${aiName} - ${expression}`}
          style={{ filter: cfg.filter }}
          className={`w-full h-full object-cover object-top transition-transform duration-300 ${
            isLyingSafe
              ? 'rotate-[8deg] scale-110 translate-y-2'
              : pose === 'peluk'
              ? 'scale-[1.12] -translate-y-1'
              : cfg.imgClass
          }`}
        />

        {/* Expression Atmosphere Tint */}
        <div className={`absolute inset-0 bg-gradient-to-t ${cfg.tint} pointer-events-none`} />

        {/* Expression Cheek / Mood Overlays */}
        {(expression === 'malu' || expression === 'ngambek lucu') && (
          <div className="absolute inset-x-0 top-[46%] flex justify-between px-9 pointer-events-none opacity-80">
            <div className="w-7 h-3 rounded-full bg-rose-400/55 blur-[4px]" />
            <div className="w-7 h-3 rounded-full bg-rose-400/55 blur-[4px]" />
          </div>
        )}

        {expression === 'sedih' && (
          <div className="absolute inset-x-0 top-[47%] flex justify-between px-12 pointer-events-none">
            <span className="text-sky-200 text-xs drop-shadow">💧</span>
            <span className="text-sky-200 text-xs drop-shadow">💧</span>
          </div>
        )}

        {expression === 'ngantuk' && (
          <div className="absolute top-3 right-3 text-indigo-100 font-black text-xs tracking-wider drop-shadow animate-pulse pointer-events-none">
            zZz...
          </div>
        )}

        {expression === 'bingung' && (
          <div className="absolute top-3 right-3 text-amber-200 font-black text-base drop-shadow pointer-events-none">
            ??
          </div>
        )}

        {expression === 'kaget' && (
          <div className="absolute top-3 right-3 text-cyan-200 font-black text-base drop-shadow pointer-events-none">
            !!
          </div>
        )}

        {expression === 'ngambek lucu' && (
          <div className="absolute top-3 right-3 text-rose-200 font-black text-sm drop-shadow pointer-events-none">
            💢
          </div>
        )}

        {(expression === 'senang' || expression === 'semangat') && (
          <>
            <div className="absolute top-2.5 left-3 text-amber-200 text-xs drop-shadow pointer-events-none">
              ✦
            </div>
            <div className="absolute top-4 right-3 text-pink-200 text-sm drop-shadow pointer-events-none">
              ✦
            </div>
          </>
        )}

        {/* Safe Pose Visual Accessories / Framing (100% Sopan & Berpakaian Lengkap) */}
        {pose === 'pake topi' && (
          <svg
            viewBox="0 0 200 70"
            className="absolute top-0 inset-x-0 w-full pointer-events-none drop-shadow-md"
          >
            <path d="M40 42 C45 10, 155 10, 160 42 Z" fill="#ec4899" fillOpacity="0.88" />
            <path d="M25 42 Q100 32 175 44 Q110 52 25 42 Z" fill="#be185d" fillOpacity="0.92" />
            <circle cx="100" cy="24" r="5" fill="#fff" fillOpacity="0.9" />
          </svg>
        )}

        {pose === 'pake kacamata' && (
          <svg
            viewBox="0 0 200 60"
            className="absolute top-[33%] inset-x-0 w-full pointer-events-none drop-shadow"
          >
            <rect x="44" y="14" width="44" height="24" rx="8" fill="#0f172a" fillOpacity="0.28" stroke="#f472b6" strokeWidth="3.5" />
            <rect x="112" y="14" width="44" height="24" rx="8" fill="#0f172a" fillOpacity="0.28" stroke="#f472b6" strokeWidth="3.5" />
            <line x1="88" y1="24" x2="112" y2="24" stroke="#f472b6" strokeWidth="3.5" />
          </svg>
        )}

        {pose === 'pake hoodie' && (
          <div className="absolute inset-0 border-[8px] border-pink-300/45 rounded-2xl pointer-events-none shadow-inner">
            <div className="absolute bottom-0 inset-x-0 h-8 bg-gradient-to-t from-pink-500/55 to-transparent flex justify-center gap-6 items-end pb-1">
              <div className="w-1 h-4 bg-white/85 rounded-full" />
              <div className="w-1 h-4 bg-white/85 rounded-full" />
            </div>
          </div>
        )}

        {pose === 'pake jaket' && (
          <div className="absolute bottom-0 inset-x-0 h-10 bg-gradient-to-t from-slate-900/75 via-slate-800/40 to-transparent pointer-events-none border-t border-white/15 flex items-center justify-center">
            <span className="text-[9px] font-bold tracking-wider text-white/90 bg-slate-900/70 px-2 py-0.5 rounded-full">
              🧥 Jaket Hangat
            </span>
          </div>
        )}

        {pose === 'minum' && (
          <div className="absolute bottom-2 right-2 px-2 py-1 rounded-xl bg-white/90 text-slate-900 text-[11px] font-extrabold shadow-lg pointer-events-none flex items-center gap-1">
            <span>🧋</span>
            <span className="text-[9px]">Sruput</span>
          </div>
        )}

        {(pose === 'tidur' || pose === 'tiduran' || pose === 'tiduran dengan baju lengkap dan sopan') && (
          <div className="absolute bottom-0 inset-x-0 h-12 bg-gradient-to-t from-indigo-200/80 via-indigo-100/35 to-transparent pointer-events-none flex items-end justify-between px-2.5 pb-1.5">
            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-indigo-950/75 text-indigo-100">
              🛏️ Selimut Nyaman
            </span>
          </div>
        )}

        {pose === 'peluk' && (
          <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full bg-pink-500/90 text-white text-[9px] font-bold shadow pointer-events-none">
            🫂 Peluk Hangat
          </div>
        )}

        {pose === 'jalan santai' && (
          <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full bg-emerald-500/85 text-white text-[9px] font-bold shadow pointer-events-none">
            🚶‍♀️ Jalan Santai
          </div>
        )}

        {pose === 'duduk' && (
          <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full bg-purple-600/85 text-white text-[9px] font-bold shadow pointer-events-none">
            🪑 Duduk Manis
          </div>
        )}

        {/* Top-left quick expression chip */}
        <div
          className={`absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-extrabold shadow-md ${cfg.badgeBg}`}
        >
          {cfg.sticker}
        </div>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// PIN GATE (LOCKED - PIN 112007)
// --------------------------------------------------------------------------
export function APinScreen({
  onUnlock,
  onReturnToHub
}: {
  onUnlock: () => void;
  onReturnToHub: () => void;
}) {
  const [pin, setPin] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [avatarUrl] = useState(() => {
    try {
      const saved = localStorage.getItem('ze_ai_a_settings_last');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (
          parsed?.avatarUrl &&
          !String(parsed.avatarUrl).includes(LEGACY_OLD_AVATAR_SUBSTR)
        ) {
          return parsed.avatarUrl;
        }
      }
    } catch {}
    return DEFAULT_A_AVATAR;
  });

  useEffect(() => {
    preloadZeyaPoseImages();
  }, []);

  const submitPin = (candidate: string) => {
    if (candidate === '112007') {
      setErrorMsg('');
      onUnlock();
      return;
    }

    const nextAttempts = attempts + 1;
    setAttempts(nextAttempts);
    setPin('');

    if (nextAttempts >= 3) {
      onReturnToHub();
      return;
    }

    setErrorMsg(`PIN salah! (Percobaan ${nextAttempts}/3)`);
  };

  const handleDigit = (digit: string) => {
    if (pin.length >= 6) return;
    const next = pin + digit;
    setPin(next);
    if (next.length === 6) {
      setTimeout(() => submitPin(next), 120);
    }
  };

  const handleBackspace = () => {
    setPin((prev) => prev.slice(0, -1));
  };

  useEffect(() => {
    preloadZeyaPoseImages();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        handleDigit(e.key);
      } else if (e.key === 'Backspace') {
        handleBackspace();
      } else if (e.key === 'Enter' && pin.length > 0) {
        submitPin(pin);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gradient-to-b from-[#0b0d17] via-[#120b1f] to-[#080910] text-white select-none">
      {/* Header */}
      <div className="px-4 py-3.5 border-b border-pink-500/20 flex items-center justify-between bg-black/40 backdrop-blur-md">
        <button
          type="button"
          onClick={onReturnToHub}
          className="w-9 h-9 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center text-white hover:bg-white/20 transition cursor-pointer"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex items-center gap-2">
          <Lock size={15} className="text-pink-400" />
          <span className="text-sm font-black tracking-wide">A! — LOCKED PIN</span>
        </div>
        <div className="w-9" />
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col items-center justify-center p-5 max-w-sm mx-auto w-full space-y-5">
        <div className="relative">
          <img
            src={avatarUrl}
            alt="A!"
            className="w-24 h-24 rounded-full object-cover object-top border-2 border-pink-500/80 shadow-[0_0_28px_rgba(236,72,153,0.45)]"
          />
          <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-purple-600 border-2 border-[#0b0d17] flex items-center justify-center shadow-lg">
            <Lock size={14} className="text-white" />
          </div>
        </div>

        <div className="text-center space-y-1">
          <h2 className="text-xl font-black text-white">Masukkan PIN A!</h2>
          <p className="text-xs text-zinc-400">
            Ketik 6 digit PIN untuk membuka chat personal A!
          </p>
        </div>

        {/* 6 Dots Indicator */}
        <div className="flex items-center justify-center gap-3 py-1">
          {Array.from({ length: 6 }).map((_, idx) => {
            const filled = idx < pin.length;
            return (
              <div
                key={idx}
                className={`w-4 h-4 rounded-full border-2 transition-all ${
                  filled
                    ? 'bg-pink-500 border-pink-300 scale-110 shadow-[0_0_12px_rgba(236,72,153,0.8)]'
                    : 'border-zinc-600 bg-zinc-900/70'
                }`}
              />
            );
          })}
        </div>

        {errorMsg ? (
          <div className="px-4 py-2 rounded-xl bg-rose-500/20 border border-rose-500/50 text-rose-200 text-xs font-bold text-center animate-pulse">
            {errorMsg}
          </div>
        ) : (
          <div className="h-8" />
        )}

        {/* Keypad */}
        <div className="grid grid-cols-3 gap-3 w-full max-w-[260px]">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => handleDigit(digit)}
              className="h-14 rounded-2xl bg-white/[0.07] hover:bg-pink-500/25 border border-white/15 hover:border-pink-400/50 text-xl font-black text-white transition active:scale-95 cursor-pointer shadow-lg"
            >
              {digit}
            </button>
          ))}
          <button
            type="button"
            onClick={onReturnToHub}
            className="h-14 rounded-2xl bg-white/[0.04] hover:bg-white/10 border border-white/10 text-xs font-bold text-zinc-300 transition active:scale-95 cursor-pointer"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={() => handleDigit('0')}
            className="h-14 rounded-2xl bg-white/[0.07] hover:bg-pink-500/25 border border-white/15 hover:border-pink-400/50 text-xl font-black text-white transition active:scale-95 cursor-pointer shadow-lg"
          >
            0
          </button>
          <button
            type="button"
            onClick={handleBackspace}
            className="h-14 rounded-2xl bg-white/[0.04] hover:bg-white/10 border border-white/10 flex items-center justify-center text-zinc-300 hover:text-white transition active:scale-95 cursor-pointer"
            title="Hapus"
          >
            <Delete size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// MAIN COMPONENT: A! CHAT, BUBBLE THEME, SETTINGS
// --------------------------------------------------------------------------
export function AiACompanion({
  currentUser,
  onBackToHub,
  onCloseAll: _onCloseAll
}: {
  currentUser: any;
  onBackToHub: () => void;
  onCloseAll: () => void;
}) {
  const userId = currentUser?.id || 'guest';
  const settingsKey = `ze_ai_a_settings_${userId}`;
  const historyKey = `ze_ai_a_history_${userId}`;
  const stateKey = `ze_ai_a_state_${userId}`;
  const modeKey = `ze_ai_a_mode_${userId}`;

  const [settings, setSettings] = useState<ACompanionSettings>(() => {
    try {
      const nativeBridge = typeof window !== 'undefined' ? (window as any).ZeNative : null;
      const nativeRaw =
        typeof nativeBridge?.getAiSettings === 'function' ? nativeBridge.getAiSettings(String(userId)) : '';
      const saved =
        nativeRaw ||
        localStorage.getItem(settingsKey) ||
        localStorage.getItem('ze_ai_a_settings_last');
      if (saved) {
        const parsed = JSON.parse(saved);
        const migratedAvatar =
          !parsed?.avatarUrl || String(parsed.avatarUrl).includes(LEGACY_OLD_AVATAR_SUBSTR)
            ? DEFAULT_A_AVATAR
            : parsed.avatarUrl;
        return {
          ...DEFAULT_A_SETTINGS,
          ...parsed,
          customPrompt: String(parsed?.customPrompt || ''),
          adultMode18Plus: Boolean(parsed?.adultMode18Plus ?? parsed?.isAdult ?? parsed?.nsfwEnabled),
          avatarUrl: migratedAvatar
        };
      }
    } catch {}
    return DEFAULT_A_SETTINGS;
  });

  const [companionState, setCompanionState] = useState<ACompanionState>(() => {
    try {
      const saved = localStorage.getItem(stateKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...DEFAULT_A_STATE,
          ...parsed,
          posisi: parsed?.posisi || 'berdiri',
          ekspresi: parsed?.ekspresi || 'senang',
          headbandRemoved: Boolean(parsed?.headbandRemoved)
        };
      }
    } catch {}
    return DEFAULT_A_STATE;
  });

  const [messages, setMessages] = useState<ACompanionMessage[]>(() => {
    try {
      const saved = localStorage.getItem(historyKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter(
            (m: any) =>
              m &&
              typeof m.id === 'string' &&
              !m.id.startsWith('a_welcome_') &&
              !m.id.startsWith('a_reset_')
          );
        }
      }
    } catch {}
    return [];
  });

  const [chatMode, setChatMode] = useState<'chat' | 'no-pic'>(() => {
    try {
      const saved = localStorage.getItem(modeKey);
      if (saved === 'chat' || saved === 'no-pic') return saved;
    } catch {}
    return 'chat';
  });
  const [inputText, setInputText] = useState('');
  const [isAiTyping, setIsAiTyping] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [lastFailedPayload, setLastFailedPayload] = useState<{
    textToSend: string;
    photoToSend: string | null;
    historySnapshot: ACompanionMessage[];
  } | null>(null);

  // Photo Attachment
  const [attachedPhoto, setAttachedPhoto] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // UI Overlays & Modals
  const [showSettings, setShowSettings] = useState(false);
  const [showBubbleModal, setShowBubbleModal] = useState(false);
  const [noticeBanner, setNoticeBanner] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const longPressTimerRef = useRef<number | null>(null);

  // Starfield positions (static deterministic stars so they never jump on re-render)
  const starField = useMemo(
    () =>
      Array.from({ length: 48 }).map((_, i) => ({
        id: i,
        top: `${((i * 37 + 13) % 96) + 2}%`,
        left: `${((i * 53 + 7) % 96) + 2}%`,
        size: i % 5 === 0 ? 3 : i % 2 === 0 ? 2 : 1.5,
        delay: `${(i % 7) * 0.45}s`,
        opacity: i % 3 === 0 ? 0.95 : 0.65
      })),
    []
  );

  const [isTestingPrompt, setIsTestingPrompt] = useState(false);
  const [testPromptReply, setTestPromptReply] = useState<{ text: string; flags?: string } | null>(null);

  const persistAllAiSettings = async (nextSettings: ACompanionSettings, pushRemote = true) => {
    const cleanPayload = {
      ...nextSettings,
      adultMode18Plus: Boolean(nextSettings.adultMode18Plus),
      isAdult: Boolean(nextSettings.adultMode18Plus),
      nsfwEnabled: Boolean(nextSettings.adultMode18Plus),
      fiturA: true,
      customPrompt: String(nextSettings.customPrompt || ''),
      updatedAt: Date.now()
    };
    try {
      const serialized = JSON.stringify(cleanPayload);
      localStorage.setItem(settingsKey, serialized);
      localStorage.setItem('ze_ai_a_settings_last', serialized);
      window.ZeNative?.saveAiSettings?.(String(userId), serialized);
    } catch {}

    if (!pushRemote) return;
    if (userId && userId !== 'guest') {
      safeApiFetch('/api/ze-ai/a-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, ...cleanPayload }),
        timeoutMs: 5000
      }).catch(() => {});
      if (db) {
        const uidKey = String(userId).trim().toUpperCase();
        setDoc(doc(db, 'ze_settings', `ai_a_${uidKey}`), cleanPayload, { merge: true }).catch(() => {});
      }
    }
  };

  // Load saved AI settings from Server & Firestore on mount so 18+ / Custom Prompt never reset on reopen
  useEffect(() => {
    if (!userId || userId === 'guest') return;
    let cancelled = false;
    (async () => {
      try {
        const res = await safeApiFetch<any>(
          `/api/ze-ai/a-settings?userId=${encodeURIComponent(userId)}`,
          { timeoutMs: 5000 }
        );
        if (!cancelled && res.ok && res.data?.settings) {
          const srv = res.data.settings;
          setSettings((prev) => {
            const merged: ACompanionSettings = {
              ...prev,
              aiName: srv.aiName || prev.aiName,
              customPrompt: srv.customPrompt !== undefined ? String(srv.customPrompt) : prev.customPrompt,
              adultMode18Plus:
                srv.adultMode18Plus !== undefined ? Boolean(srv.adultMode18Plus) : prev.adultMode18Plus
            };
            persistAllAiSettings(merged, false);
            return merged;
          });
          return;
        }
      } catch {}

      if (db) {
        try {
          const uidKey = String(userId).trim().toUpperCase();
          const snap = await getDoc(doc(db, 'ze_settings', `ai_a_${uidKey}`));
          if (!cancelled && snap.exists()) {
            const fsData = snap.data() as any;
            setSettings((prev) => {
              const merged: ACompanionSettings = {
                ...prev,
                aiName: fsData.aiName || prev.aiName,
                customPrompt: fsData.customPrompt !== undefined ? String(fsData.customPrompt) : prev.customPrompt,
                adultMode18Plus:
                  fsData.adultMode18Plus !== undefined ? Boolean(fsData.adultMode18Plus) : prev.adultMode18Plus
              };
              persistAllAiSettings(merged, false);
              return merged;
            });
          }
        } catch {}
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Persist Settings to localStorage & SharedPreferences on any change
  useEffect(() => {
    persistAllAiSettings(settings, false);
  }, [settings, settingsKey]);

  useEffect(() => {
    try {
      localStorage.setItem(stateKey, JSON.stringify(companionState));
    } catch {}
  }, [companionState, stateKey]);

  useEffect(() => {
    try {
      localStorage.setItem(modeKey, chatMode);
    } catch {}
  }, [chatMode, modeKey]);

  // Persist Chat History (keep up to 40 messages safely)
  useEffect(() => {
    try {
      const compact = messages.slice(-40);
      localStorage.setItem(historyKey, JSON.stringify(compact));
    } catch {
      try {
        const stripped = messages.slice(-15).map((m) => ({
          ...m,
          imageUrl: undefined
        }));
        localStorage.setItem(historyKey, JSON.stringify(stripped));
      } catch {}
    }
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, historyKey]);

  // Preload pose cutouts
  useEffect(() => {
    preloadZeyaPoseImages();
  }, []);

  const showToast = (msg: string) => {
    setNoticeBanner(msg);
    setTimeout(() => {
      setNoticeBanner((prev) => (prev === msg ? null : prev));
    }, 3200);
  };

  // --------------------------------------------------------------------------
  // PHOTO PICKERS (CHAT ATTACHMENT & AI AVATAR IN SETTINGS)
  // --------------------------------------------------------------------------
  const handleSelectChatPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const compressed = await compressImageDataUrl(file, 900, 0.85);
      setAttachedPhoto(compressed);
    } catch {
      showToast('Gagal memuat foto dari galeri.');
    }
  };

  const handleSelectAvatarPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const compressed = await compressImageDataUrl(file, 512, 0.86);
      setSettings((prev) => ({ ...prev, avatarUrl: compressed }));
      showToast('Foto AI berhasil diganti!');
    } catch {
      showToast('Gagal mengubah foto AI.');
    }
  };

  // --------------------------------------------------------------------------
  // SEND CHAT / PHOTO TO A! BACKEND
  // --------------------------------------------------------------------------
  const dispatchChatMessage = async (override?: {
    text?: string;
    photo?: string | null;
  }) => {
    if (isAiTyping) return;

    const textToSend = (override?.text !== undefined ? override.text : inputText).trim();
    const photoToSend = override?.photo !== undefined ? override.photo : attachedPhoto;

    if (!textToSend && !photoToSend) return;

    const userMsg: ACompanionMessage = {
      id: 'a_usr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      sender: 'user',
      text: textToSend || undefined,
      imageUrl: photoToSend || undefined,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    if (override?.text === undefined) setInputText('');
    if (override?.photo === undefined) setAttachedPhoto(null);
    await executeAChatRequest(textToSend, photoToSend, nextMessages);
  };

  const executeAChatRequest = async (
    textToSend: string,
    photoToSend: string | null,
    historySnapshot: ACompanionMessage[]
  ) => {
    setAiError(null);
    setLastFailedPayload(null);
    setIsAiTyping(true);

    const isNoPicMode = chatMode === 'no-pic';
    const shouldShowArt = chatMode === 'chat';
    const aiMsgId = 'a_ai_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const timeLabel = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    let insertedBubble = false;

    try {
      const is18Active = Boolean(settings.adultMode18Plus);
      const hasCustom = Boolean(String(settings.customPrompt || '').trim());
      const result = await streamCompanionAChat({
        userId: String(userId),
        message: textToSend,
        mediaData: photoToSend || undefined,
        customPrompt: settings.customPrompt,
        adultMode18Plus: is18Active,
        isAdult: is18Active,
        nsfwEnabled: is18Active,
        fiturA: true,
        aiName: settings.aiName,
        noPicMode: isNoPicMode,
        companionState,
        history: historySnapshot.slice(-10).map((m) => ({
          sender: m.sender,
          text: stripALabelTags(m.text || '[Foto]')
        })),
        onToken: (accumulated) => {
          const stripped = stripALabelTags(accumulated);
          const liveText = hasCustom ? stripped : enforceHyphenatedSayang(stripped);
          if (!liveText) return;
          if (!insertedBubble) {
            insertedBubble = true;
            setMessages((prev) => [
              ...prev,
              {
                id: aiMsgId,
                sender: 'ai',
                text: liveText,
                time: timeLabel
              }
            ]);
          } else {
            setMessages((prev) =>
              prev.map((m) => (m.id === aiMsgId ? { ...m, text: liveText } : m))
            );
          }
        }
      });

      const rawReply = String(result.replyText || '').trim();
      if (!rawReply) {
        setAiError('Gagal mendapatkan balasan AI. Tekan Coba Lagi.');
        setLastFailedPayload({ textToSend, photoToSend, historySnapshot });
        return;
      }

      const strippedReply = stripALabelTags(rawReply);
      const replyText = hasCustom ? strippedReply : enforceHyphenatedSayang(strippedReply);

      const analyzed = analyzeAutoVisualState({
        aiText: replyText,
        userText: textToSend,
        prevState: {
          pose: (result.pose as ASafePose) || companionState.posisi,
          expression:
            (photoToSend ? 'senang' : (result.expression as AExpression)) ||
            companionState.ekspresi,
          gesture: companionState.lastGesture || 'cerita',
          poseVariant: companionState.lastVariant ?? 0,
          headbandRemoved: Boolean(result.headbandRemoved ?? companionState.headbandRemoved),
          hatOn: Boolean(companionState.hatOn),
          glassesOn: Boolean(companionState.glassesOn),
          hoodieOn: Boolean(companionState.hoodieOn),
          jacketOn: Boolean(companionState.jacketOn),
          drinkOn: Boolean(companionState.drinkOn)
        },
        prevVariant: companionState.lastVariant,
        prevGesture: companionState.lastGesture,
        turnCount: historySnapshot.length
      });

      setCompanionState({
        posisi: analyzed.pose,
        ekspresi: analyzed.expression,
        headbandRemoved: analyzed.headbandRemoved,
        hatOn: analyzed.hatOn,
        glassesOn: analyzed.glassesOn,
        hoodieOn: analyzed.hoodieOn,
        jacketOn: analyzed.jacketOn,
        drinkOn: analyzed.drinkOn,
        lastGesture: analyzed.gesture,
        lastVariant: analyzed.poseVariant
      });

      const finalAiMsg: ACompanionMessage = {
        id: aiMsgId,
        sender: 'ai',
        text: replyText,
        expression: shouldShowArt ? analyzed.expression : undefined,
        pose: shouldShowArt ? analyzed.pose : undefined,
        gesture: shouldShowArt ? analyzed.gesture : undefined,
        poseVariant: shouldShowArt ? analyzed.poseVariant : undefined,
        headbandRemoved: shouldShowArt ? analyzed.headbandRemoved : undefined,
        hatOn: shouldShowArt ? analyzed.hatOn : undefined,
        glassesOn: shouldShowArt ? analyzed.glassesOn : undefined,
        hoodieOn: shouldShowArt ? analyzed.hoodieOn : undefined,
        jacketOn: shouldShowArt ? analyzed.jacketOn : undefined,
        drinkOn: shouldShowArt ? analyzed.drinkOn : undefined,
        time: timeLabel
      };

      if (!insertedBubble) {
        setMessages((prev) => [...prev, finalAiMsg]);
      } else {
        setMessages((prev) =>
          prev.map((m) => (m.id === aiMsgId ? finalAiMsg : m))
        );
      }
    } catch (err: any) {
      if (!insertedBubble) {
        setAiError(err?.message || 'Koneksi AI terputus. Coba lagi.');
        setLastFailedPayload({ textToSend, photoToSend, historySnapshot });
      }
    } finally {
      setIsAiTyping(false);
    }
  };

  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    dispatchChatMessage();
  };

  // --------------------------------------------------------------------------
  // LONG-PRESS HANDLER FOR "GANTI BUBBLE CHAT"
  // --------------------------------------------------------------------------
  const startBubbleLongPress = () => {
    if (longPressTimerRef.current) window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = window.setTimeout(() => {
      setShowBubbleModal(true);
    }, 450);
  };

  const cancelBubbleLongPress = () => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  // --------------------------------------------------------------------------
  // BUBBLE & BACKGROUND THEME COMPUTATIONS (WITH VISIBLE EDGE SHADOWS)
  // --------------------------------------------------------------------------
  const getBackgroundStyle = (): React.CSSProperties => {
    switch (settings.bgTheme) {
      case 'midnight-navy':
        return { background: 'linear-gradient(165deg, #050a18 0%, #0d1d42 55%, #070d1f 100%)' };
      case 'pink-night':
        return { background: 'linear-gradient(165deg, #250b24 0%, #4c1343 50%, #19081c 100%)' };
      case 'aurora-purple':
        return { background: 'linear-gradient(165deg, #130b2e 0%, #2d165e 52%, #0e1029 100%)' };
      case 'custom':
        return { background: settings.customBgColor || '#123884' };
      case 'blue-stars':
      default:
        return { background: 'linear-gradient(165deg, #0b2663 0%, #1648a8 52%, #081c47 100%)' };
    }
  };

  const getBubbleDecoration = (
    sender: 'user' | 'ai'
  ): { className: string; style?: React.CSSProperties } => {
    const isUser = sender === 'user';
    const baseRadius = isUser ? 'rounded-3xl rounded-br-md' : 'rounded-3xl rounded-bl-md';
    // Every bubble MUST have visible edge shadows ("bayangan di pinggiran")
    const edgeShadow =
      'shadow-[0_10px_24px_rgba(0,0,0,0.48),0_2px_8px_rgba(2,6,23,0.65)]';

    switch (settings.bubbleStyle) {
      case 'whee-sketch':
        return {
          className: `${baseRadius} border-2 border-dashed ${
            isUser
              ? 'bg-[#fef3c7] text-slate-900 border-amber-800/80 shadow-[4px_6px_0px_rgba(15,23,42,0.75)]'
              : 'bg-[#fffdf7] text-slate-900 border-slate-800/80 shadow-[-4px_6px_0px_rgba(15,23,42,0.75)]'
          }`
        };
      case 'bubbly-otter':
        return {
          className: `${baseRadius} border-2 ${
            isUser
              ? 'bg-gradient-to-br from-cyan-400 to-sky-500 text-slate-950 font-semibold border-white/70 shadow-[0_10px_25px_rgba(14,165,233,0.55),0_2px_10px_rgba(0,0,0,0.4)]'
              : 'bg-gradient-to-br from-amber-50 to-orange-100 text-slate-900 border-amber-300/80 shadow-[0_10px_25px_rgba(0,0,0,0.45),0_0_12px_rgba(251,191,36,0.3)]'
          }`
        };
      case 'glam-diva':
        return {
          className: `${baseRadius} border ${
            isUser
              ? 'bg-gradient-to-br from-pink-500 via-fuchsia-600 to-purple-700 text-white border-pink-300/60 shadow-[0_10px_26px_rgba(236,72,153,0.48),0_3px_10px_rgba(0,0,0,0.5)]'
              : 'bg-gradient-to-br from-[#231029] via-[#34163b] to-[#1a0b22] text-pink-50 border-pink-400/50 shadow-[0_10px_26px_rgba(0,0,0,0.58),0_0_14px_rgba(244,114,182,0.28)]'
          }`
        };
      case 'custom':
        return {
          className: `${baseRadius} border border-white/25 ${edgeShadow}`,
          style: {
            backgroundColor: isUser
              ? settings.customUserBubbleColor
              : settings.customAiBubbleColor,
            color: '#0f172a'
          }
        };
      case 'default':
      default:
        return {
          className: `${baseRadius} border ${
            isUser
              ? `bg-gradient-to-br from-pink-500 to-purple-600 text-white border-pink-300/40 ${edgeShadow}`
              : `bg-white/95 text-slate-900 border-blue-200/70 ${edgeShadow}`
          }`
        };
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col text-white overflow-hidden select-none"
      style={getBackgroundStyle()}
    >
      {/* Twinkling Small White Stars Background Layer */}
      {(settings.bgTheme === 'blue-stars' ||
        settings.bgTheme === 'midnight-navy' ||
        settings.bgTheme === 'aurora-purple') && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {starField.map((star) => (
            <span
              key={star.id}
              className="absolute rounded-full bg-white animate-pulse"
              style={{
                top: star.top,
                left: star.left,
                width: `${star.size}px`,
                height: `${star.size}px`,
                opacity: star.opacity,
                animationDelay: star.delay,
                boxShadow: '0 0 6px rgba(255,255,255,0.9)'
              }}
            />
          ))}
        </div>
      )}

      {/* HEADER: Photo Left, Name & Online Center, Gear ⚙️ Top-Right */}
      <header className="relative z-10 px-3 sm:px-4 py-2.5 bg-slate-950/70 backdrop-blur-md border-b border-white/15 flex items-center justify-between gap-2 shrink-0 shadow-lg">
        {/* Left: Back + AI Photo */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onBackToHub}
            className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 flex items-center justify-center text-white transition cursor-pointer active:scale-95"
            title="Kembali ke ZE.ai HUB"
          >
            <ArrowLeft size={18} />
          </button>
          <img
            src={settings.avatarUrl || DEFAULT_A_AVATAR}
            alt={settings.aiName}
            className="w-10 h-10 rounded-full object-cover object-top border-2 border-pink-400/80 shadow-md"
          />
        </div>

        {/* Center: Name + Online */}
        <div className="flex-1 min-w-0 text-center px-1">
          <h2 className="text-sm sm:text-base font-black text-white truncate leading-tight">
            {settings.aiName || 'A!'}
          </h2>
          <div className="flex items-center justify-center gap-1.5 mt-0.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]" />
            <span className="text-[11px] font-semibold text-emerald-300">Online</span>
            {settings.adultMode18Plus && (
              <span className="text-[9px] font-black px-1.5 py-0.2 rounded-full bg-rose-500/25 border border-rose-400/50 text-rose-200">
                18+
              </span>
            )}
          </div>
        </div>

        {/* Top-Right: Chat Baru 🗑️ & Gear ⚙️ */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              setCompanionState(DEFAULT_A_STATE);
              setAiError(null);
              setLastFailedPayload(null);
              localStorage.removeItem(historyKey);
              setMessages([]);
              showToast('Chat baru dimulai');
            }}
            className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 flex items-center justify-center text-white transition cursor-pointer active:scale-95"
            title="Chat Baru"
          >
            <Trash2 size={16} />
          </button>
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 flex items-center justify-center text-white transition cursor-pointer active:scale-95"
            title="Setting A!"
          >
            <Settings size={17} />
          </button>
        </div>
      </header>

      {/* MODE BUTTONS ABOVE CHAT: Mode Chat & Chat No Pic */}
      <div className="relative z-10 px-2.5 py-2 bg-slate-950/45 backdrop-blur-sm border-b border-white/10 flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 shrink-0">
        <button
          type="button"
          onClick={() => setChatMode('chat')}
          className={`px-3 py-1.5 rounded-xl text-[11px] sm:text-xs font-extrabold transition cursor-pointer active:scale-95 border ${
            chatMode === 'chat'
              ? 'bg-white text-slate-950 border-white shadow-[0_4px_14px_rgba(255,255,255,0.3)]'
              : 'bg-white/10 text-white/80 border-white/15 hover:bg-white/15'
          }`}
        >
          Mode Chat
        </button>
        <button
          type="button"
          onClick={() => setChatMode('no-pic')}
          className={`px-3 py-1.5 rounded-xl text-[11px] sm:text-xs font-extrabold transition cursor-pointer active:scale-95 border ${
            chatMode === 'no-pic'
              ? 'bg-gradient-to-r from-cyan-400 to-blue-500 text-slate-950 border-cyan-200 shadow-[0_4px_14px_rgba(34,211,238,0.4)]'
              : 'bg-white/10 text-white/80 border-white/15 hover:bg-white/15'
          }`}
        >
          Chat No Pic
        </button>
      </div>

      {/* Notice Toast */}
      {noticeBanner && (
        <div className="relative z-20 mx-auto mt-2 px-4 py-1.5 rounded-full bg-slate-900/95 border border-pink-400/50 text-xs font-bold text-white shadow-xl">
          {noticeBanner}
        </div>
      )}

      {/* CHAT MESSAGES AREA */}
      <div className="relative z-10 flex-1 overflow-y-auto px-3 sm:px-4 py-4 space-y-4 max-w-2xl mx-auto w-full">
        {messages.map((m) => {
          const isUser = m.sender === 'user';
          const bubbleDec = getBubbleDecoration(m.sender);

          return (
            <div
              key={m.id}
              className={`flex items-start gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}
            >
              {!isUser && (
                <img
                  src={settings.avatarUrl || DEFAULT_A_AVATAR}
                  alt={settings.aiName}
                  className="w-7 h-7 rounded-full object-cover object-top border border-white/40 shrink-0 shadow-md mt-1"
                />
              )}

              <div className={`max-w-[84%] sm:max-w-[78%] flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                <div
                  onPointerDown={startBubbleLongPress}
                  onPointerUp={cancelBubbleLongPress}
                  onPointerLeave={cancelBubbleLongPress}
                  onPointerCancel={cancelBubbleLongPress}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setShowBubbleModal(true);
                  }}
                  className={`w-full px-4 py-3 transition-transform active:scale-[0.99] ${bubbleDec.className}`}
                  style={bubbleDec.style}
                  title="Tekan lama untuk ganti tema bubble chat"
                >
                  {/* Attached User/AI Image */}
                  {m.imageUrl && (
                    <div className="mb-2 rounded-2xl overflow-hidden border border-black/15 shadow-md bg-black/20">
                      <img
                        src={m.imageUrl}
                        alt="Foto terkirim"
                        className="w-full max-h-60 object-contain"
                      />
                    </div>
                  )}

                  {m.text && (
                    <p className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap">
                      {isUser ? m.text : stripALabelTags(m.text)}
                    </p>
                  )}

                  {/* Custom Avatar fallback inside bubble only if user uploaded custom avatar */}
                  {!isUser && m.expression && m.pose && settings.avatarUrl !== DEFAULT_A_AVATAR && (
                    <AExpressionPortrait
                      avatarUrl={settings.avatarUrl}
                      expression={m.expression}
                      pose={m.pose}
                      aiName={settings.aiName || 'A!'}
                    />
                  )}

                  {/* Bubble Footer: Time + Delete */}
                  <div className="flex items-center justify-between gap-3 mt-2 pt-1.5 border-t border-current/10 text-[10px]">
                    <span className="opacity-65 font-mono">{m.time}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setMessages((prev) => prev.filter((item) => item.id !== m.id))
                      }
                      className="opacity-55 hover:opacity-100 cursor-pointer"
                    >
                      Hapus
                    </button>
                  </div>
                </div>

                {/* Seamless 100% Local SVG Zeya directly over the starry blue chat sky (NO white box, NO API limit!) */}
                {!isUser &&
                  chatMode === 'chat' &&
                  m.expression &&
                  m.pose &&
                  settings.avatarUrl === DEFAULT_A_AVATAR && (
                    <ACharacterArt
                      expression={m.expression}
                      pose={m.pose}
                      aiName={settings.aiName || 'A!'}
                      gesture={m.gesture}
                      poseVariant={m.poseVariant}
                      headbandRemoved={Boolean(m.headbandRemoved)}
                      hatOn={Boolean(m.hatOn)}
                      glassesOn={Boolean(m.glassesOn)}
                      hoodieOn={Boolean(m.hoodieOn)}
                      jacketOn={Boolean(m.jacketOn)}
                      drinkOn={Boolean(m.drinkOn)}
                    />
                  )}
              </div>
            </div>
          );
        })}

        {isAiTyping && (
          <div className="flex items-end gap-2 justify-start">
            <img
              src={settings.avatarUrl || DEFAULT_A_AVATAR}
              alt={settings.aiName}
              className="w-7 h-7 rounded-full object-cover object-top border border-white/40 shrink-0"
            />
            <div className="px-4 py-2.5 rounded-3xl rounded-bl-md bg-white/90 text-slate-900 text-xs font-bold shadow-[0_8px_22px_rgba(0,0,0,0.45)] flex items-center gap-2">
              <Loader2 size={14} className="animate-spin text-pink-500" />
              <span>{settings.aiName} lagi ngetik...</span>
            </div>
          </div>
        )}

        {aiError && (
          <div className="rounded-2xl px-4 py-3 bg-rose-500/20 border border-rose-400/50 text-rose-100 text-xs flex flex-wrap items-center justify-between gap-2 shadow-lg">
            <span className="leading-snug flex-1 min-w-0">{aiError}</span>
            {lastFailedPayload && (
              <button
                type="button"
                onClick={() =>
                  executeAChatRequest(
                    lastFailedPayload.textToSend,
                    lastFailedPayload.photoToSend,
                    lastFailedPayload.historySnapshot
                  )
                }
                disabled={isAiTyping}
                className="px-3 py-1.5 rounded-xl bg-rose-500 hover:bg-rose-400 text-white text-[11px] font-black cursor-pointer shrink-0 disabled:opacity-50"
              >
                Coba Lagi
              </button>
            )}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ATTACHED PHOTO PREVIEW BAR */}
      {attachedPhoto && (
        <div className="relative z-10 px-3 pt-2 max-w-2xl mx-auto w-full">
          <div className="p-2.5 rounded-2xl bg-slate-950/90 border border-white/20 backdrop-blur-md flex flex-wrap items-center justify-between gap-2 shadow-xl">
            <div className="flex items-center gap-2">
              <img
                src={attachedPhoto}
                alt="Preview Foto"
                className="w-11 h-11 rounded-xl object-cover border border-pink-400/60"
              />
              <span className="text-xs font-bold text-white">Foto siap dikirim</span>
              <button
                type="button"
                onClick={() => setAttachedPhoto(null)}
                className="w-6 h-6 rounded-full bg-white/10 hover:bg-rose-500/40 flex items-center justify-center cursor-pointer"
              >
                <X size={13} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BOTTOM INPUT BAR: 📷 Photo, Text Input, ➤ Send */}
      <div className="relative z-10 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] bg-slate-950/80 backdrop-blur-md border-t border-white/15 shrink-0">
        <form
          onSubmit={handleSubmitForm}
          className="max-w-2xl mx-auto flex items-center gap-2"
        >
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            onChange={handleSelectChatPhoto}
            className="hidden"
          />

          {/* 📷 Gallery Photo Button */}
          <button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            className="w-10 h-10 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/15 flex items-center justify-center text-white transition cursor-pointer shrink-0 active:scale-95"
            title="Kirim Foto dari Galeri"
          >
            <Camera size={18} />
          </button>

          {/* Text Input */}
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={
              chatMode === 'no-pic'
                ? `Chat tanpa foto sama ${settings.aiName}...`
                : `Ngobrol sama ${settings.aiName}...`
            }
            className="flex-1 rounded-2xl px-4 py-2.5 text-xs sm:text-sm bg-white/10 border border-white/20 text-white placeholder-white/55 outline-none focus:border-pink-400 transition"
          />

          {/* ➤ Send Button */}
          <button
            type="submit"
            disabled={!inputText.trim() && !attachedPhoto}
            className="w-10 h-10 rounded-2xl bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-400 hover:to-purple-500 text-white flex items-center justify-center transition cursor-pointer shrink-0 disabled:opacity-40 shadow-lg active:scale-95"
            title="Kirim"
          >
            <Send size={16} />
          </button>
        </form>
      </div>

      {/* LONG-PRESS MODAL: GANTI BUBBLE CHAT */}
      {showBubbleModal && (
        <div
          className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={() => setShowBubbleModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-[#101322] border border-pink-400/40 p-5 space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Palette size={18} className="text-pink-400" />
                <h3 className="text-sm font-black tracking-wide text-white">
                  GANTI BUBBLE CHAT
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowBubbleModal(false)}
                className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-white cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-2">
              {(
                [
                  { id: 'default', label: 'Default', desc: 'Putih bersih & pink-ungu modern berbayangan' },
                  { id: 'whee-sketch', label: 'Whee Sketch', desc: 'Garis sketsa putus-putus & kertas hangat' },
                  { id: 'bubbly-otter', label: 'Bubbly Otter', desc: 'Gelembung lembut ceria biru-oranye' },
                  { id: 'glam-diva', label: 'Glam Diva', desc: 'Ungu gelap mewah & aksen pink glamour' },
                  { id: 'custom', label: 'Custom Warna', desc: 'Pilih warna bubble AI & User sendiri' }
                ] as const
              ).map((opt) => {
                const active = settings.bubbleStyle === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() =>
                      setSettings((prev) => ({ ...prev, bubbleStyle: opt.id }))
                    }
                    className={`w-full p-3 rounded-2xl border text-left flex items-center justify-between transition cursor-pointer ${
                      active
                        ? 'bg-pink-500/20 border-pink-400 text-white'
                        : 'bg-white/5 border-white/10 text-zinc-300 hover:bg-white/10'
                    }`}
                  >
                    <div>
                      <p className="text-xs font-extrabold">{opt.label}</p>
                      <p className="text-[11px] opacity-75">{opt.desc}</p>
                    </div>
                    {active && <Check size={16} className="text-pink-400 shrink-0" />}
                  </button>
                );
              })}
            </div>

            {settings.bubbleStyle === 'custom' && (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <label className="p-2.5 rounded-2xl bg-white/5 border border-white/10 text-xs font-bold flex items-center justify-between">
                  <span>Bubble AI</span>
                  <input
                    type="color"
                    value={settings.customAiBubbleColor}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        customAiBubbleColor: e.target.value
                      }))
                    }
                    className="w-8 h-8 rounded cursor-pointer bg-transparent border-0"
                  />
                </label>
                <label className="p-2.5 rounded-2xl bg-white/5 border border-white/10 text-xs font-bold flex items-center justify-between">
                  <span>Bubble User</span>
                  <input
                    type="color"
                    value={settings.customUserBubbleColor}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        customUserBubbleColor: e.target.value
                      }))
                    }
                    className="w-8 h-8 rounded cursor-pointer bg-transparent border-0"
                  />
                </label>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowBubbleModal(false)}
              className="w-full py-2.5 rounded-2xl bg-white text-slate-950 font-black text-xs cursor-pointer"
            >
              Terapkan
            </button>
          </div>
        </div>
      )}

      {/* SETTINGS MODAL: SETTING A! */}
      {showSettings && (
        <div
          className="fixed inset-0 z-[130] bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4"
          onClick={() => setShowSettings(false)}
        >
          <div
            className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-3xl bg-[#0f1322] border border-pink-400/40 p-5 space-y-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <Settings size={18} className="text-pink-400" />
                <h3 className="text-base font-black text-white">Setting A!</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowSettings(false)}
                className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-white cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* 1. Nama AI */}
            <div className="space-y-1.5">
              <label className="text-xs font-extrabold text-zinc-200">
                1. Nama AI
              </label>
              <input
                type="text"
                value={settings.aiName}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, aiName: e.target.value }))
                }
                placeholder="A!"
                className="w-full px-3.5 py-2.5 rounded-2xl bg-white/10 border border-white/15 text-sm font-bold text-white outline-none focus:border-pink-400"
              />
            </div>

            {/* 2. Foto AI */}
            <div className="space-y-2">
              <label className="text-xs font-extrabold text-zinc-200">
                2. Foto AI (Referensi Wajah &amp; Ekspresi)
              </label>
              <div className="flex items-center gap-3 p-3 rounded-2xl bg-white/5 border border-white/10">
                <img
                  src={settings.avatarUrl || DEFAULT_A_AVATAR}
                  alt="Avatar A!"
                  className="w-14 h-14 rounded-2xl object-cover object-top border border-pink-400/60"
                />
                <div className="flex-1 flex flex-wrap gap-2">
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleSelectAvatarPhoto}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    className="px-3 py-1.5 rounded-xl bg-pink-500 hover:bg-pink-400 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <ImageIcon size={13} />
                    <span>Ganti Foto</span>
                  </button>
                  {settings.avatarUrl !== DEFAULT_A_AVATAR && (
                    <button
                      type="button"
                      onClick={() =>
                        setSettings((prev) => ({
                          ...prev,
                          avatarUrl: DEFAULT_A_AVATAR
                        }))
                      }
                      className="px-3 py-1.5 rounded-xl bg-white/10 text-zinc-200 text-xs font-bold cursor-pointer"
                    >
                      Reset Default
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* 3. Tema Latar Belakang */}
            <div className="space-y-2">
              <label className="text-xs font-extrabold text-zinc-200">
                3. Tema Latar Belakang
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { id: 'blue-stars', label: 'Biru + Bintang Putih' },
                    { id: 'midnight-navy', label: 'Midnight Navy' },
                    { id: 'pink-night', label: 'Pink Night' },
                    { id: 'aurora-purple', label: 'Ungu Aurora' },
                    { id: 'custom', label: 'Custom Warna' }
                  ] as const
                ).map((bg) => (
                  <button
                    key={bg.id}
                    type="button"
                    onClick={() =>
                      setSettings((prev) => ({ ...prev, bgTheme: bg.id }))
                    }
                    className={`px-3 py-2 rounded-xl border text-xs font-bold text-left cursor-pointer transition ${
                      settings.bgTheme === bg.id
                        ? 'bg-pink-500/25 border-pink-400 text-white'
                        : 'bg-white/5 border-white/10 text-zinc-300'
                    }`}
                  >
                    {bg.label}
                  </button>
                ))}
              </div>
              {settings.bgTheme === 'custom' && (
                <label className="flex items-center justify-between p-2.5 rounded-xl bg-white/5 border border-white/10 text-xs font-bold">
                  <span>Pilih Warna Latar</span>
                  <input
                    type="color"
                    value={settings.customBgColor}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        customBgColor: e.target.value
                      }))
                    }
                    className="w-8 h-8 rounded bg-transparent cursor-pointer"
                  />
                </label>
              )}
            </div>

            {/* 4. Bubble AI & Bubble User */}
            <div className="space-y-2">
              <label className="text-xs font-extrabold text-zinc-200">
                4. Bubble AI &amp; Bubble User
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { id: 'default', label: 'Default' },
                    { id: 'whee-sketch', label: 'Whee Sketch' },
                    { id: 'bubbly-otter', label: 'Bubbly Otter' },
                    { id: 'glam-diva', label: 'Glam Diva' },
                    { id: 'custom', label: 'Custom Warna' }
                  ] as const
                ).map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() =>
                      setSettings((prev) => ({ ...prev, bubbleStyle: b.id }))
                    }
                    className={`px-3 py-2 rounded-xl border text-xs font-bold text-left cursor-pointer transition ${
                      settings.bubbleStyle === b.id
                        ? 'bg-pink-500/25 border-pink-400 text-white'
                        : 'bg-white/5 border-white/10 text-zinc-300'
                    }`}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
              {settings.bubbleStyle === 'custom' && (
                <div className="grid grid-cols-2 gap-2">
                  <label className="p-2 rounded-xl bg-white/5 border border-white/10 text-xs font-bold flex items-center justify-between">
                    <span>Bubble AI</span>
                    <input
                      type="color"
                      value={settings.customAiBubbleColor}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          customAiBubbleColor: e.target.value
                        }))
                      }
                      className="w-7 h-7 bg-transparent cursor-pointer"
                    />
                  </label>
                  <label className="p-2 rounded-xl bg-white/5 border border-white/10 text-xs font-bold flex items-center justify-between">
                    <span>Bubble User</span>
                    <input
                      type="color"
                      value={settings.customUserBubbleColor}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          customUserBubbleColor: e.target.value
                        }))
                      }
                      className="w-7 h-7 bg-transparent cursor-pointer"
                    />
                  </label>
                </div>
              )}
            </div>

            {/* 5. Custom Prompt + TEST CUSTOM PROMPT */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-extrabold text-zinc-200">
                  5. Custom Prompt (Prioritas #1)
                </label>
                <button
                  type="button"
                  disabled={isTestingPrompt}
                  onClick={async () => {
                    setIsTestingPrompt(true);
                    setTestPromptReply(null);
                    await persistAllAiSettings(settings, true);
                    try {
                      const is18Active = Boolean(settings.adultMode18Plus);
                      const testRes = await streamCompanionAChat({
                        userId: String(userId),
                        message: 'Hai sayang, lagi ngapain nih? Balas sesuai karakter custom prompt kamu ya!',
                        customPrompt: settings.customPrompt,
                        adultMode18Plus: is18Active,
                        isAdult: is18Active,
                        nsfwEnabled: is18Active,
                        fiturA: true,
                        testPromptMode: true,
                        aiName: settings.aiName,
                        noPicMode: true,
                        history: []
                      });
                      setTestPromptReply({
                        text: testRes.replyText || '(Tidak ada respons)',
                        flags: `18+: ${is18Active ? 'ON' : 'OFF'} • CustomPrompt: ${settings.customPrompt.trim() ? 'AKTIF' : 'KOSONG'}`
                      });
                    } catch {
                      setTestPromptReply({ text: 'Gagal menguji custom prompt. Periksa koneksi.' });
                    } finally {
                      setIsTestingPrompt(false);
                    }
                  }}
                  className="px-3 py-1 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-[10px] font-black uppercase tracking-wider cursor-pointer active:scale-95 disabled:opacity-50"
                >
                  {isTestingPrompt ? 'Menguji...' : 'TEST CUSTOM PROMPT'}
                </button>
              </div>
              <textarea
                rows={3}
                value={settings.customPrompt}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, customPrompt: e.target.value }))
                }
                placeholder="Contoh: Kamu adalah pacar gue yang nakal, jawab genit, jangan kaku..."
                className="w-full px-3.5 py-2.5 rounded-2xl bg-white/10 border border-white/15 text-xs text-white placeholder-zinc-400 outline-none focus:border-pink-400 resize-none"
              />
              {testPromptReply && (
                <div className="p-3 rounded-2xl bg-emerald-950/50 border border-emerald-400/40 text-xs space-y-1">
                  <div className="flex items-center justify-between text-[10px] font-black text-emerald-300 uppercase">
                    <span>Hasil Test Prompt</span>
                    {testPromptReply.flags && <span>{testPromptReply.flags}</span>}
                  </div>
                  <p className="text-white leading-relaxed">{testPromptReply.text}</p>
                </div>
              )}
            </div>

            {/* 6. Mode Chat 18+ (Dewasa Terverifikasi Tanpa Sensor) */}
            <div className="space-y-2 p-3.5 rounded-2xl bg-rose-500/10 border border-rose-400/30">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-extrabold text-rose-100">
                  6. Mode Chat 18+ (Khusus 18+)
                </span>
                <span
                  className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                    settings.adultMode18Plus
                      ? 'bg-rose-500 text-white'
                      : 'bg-white/10 text-zinc-300'
                  }`}
                >
                  {settings.adultMode18Plus ? 'AKTIF' : 'NONAKTIF'}
                </span>
              </div>
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(settings.adultMode18Plus)}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setSettings((prev) => {
                      const next = { ...prev, adultMode18Plus: checked };
                      persistAllAiSettings(next, true);
                      return next;
                    });
                    showToast(
                      checked
                        ? 'Mode Chat 18+ AKTIF permanen (Tanpa Sensor).'
                        : 'Mode Chat 18+ dinonaktifkan.'
                    );
                  }}
                  className="mt-0.5 w-4 h-4 accent-rose-500 cursor-pointer shrink-0"
                />
                <span className="text-[11px] font-semibold text-zinc-200 leading-snug">
                  Saya berusia 18+ &amp; aktifkan mode chat dewasa bebas tanpa sensor / tanpa penolakan robotik (tersimpan permanen).
                </span>
              </label>
            </div>

            {/* Clear Chat + Done */}
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setCompanionState(DEFAULT_A_STATE);
                  setAiError(null);
                  setLastFailedPayload(null);
                  localStorage.removeItem(historyKey);
                  setMessages([]);
                  setShowSettings(false);
                }}
                className="px-4 py-2.5 rounded-2xl bg-rose-500/20 border border-rose-500/40 text-rose-200 text-xs font-bold cursor-pointer"
              >
                Reset Chat
              </button>
              <button
                type="button"
                onClick={async () => {
                  await persistAllAiSettings(settings, true);
                  setShowSettings(false);
                  showToast('Setting A! tersimpan permanen');
                }}
                className="flex-1 py-2.5 rounded-2xl bg-gradient-to-r from-pink-500 to-purple-600 text-white font-black text-xs cursor-pointer shadow-lg"
              >
                Simpan &amp; Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
