import React, { useMemo, useRef, useState } from 'react';
import { ArrowLeft, Coins, Crown, Disc3, Flame, Gem, Lock } from 'lucide-react';
import {
  CHARACTER_DEFS,
  DEFAULT_WEAPONS,
  GACHA_SPIN_COST,
  GACHA_WHEEL_SLICES,
  LEGENDARY_SKIN_ORDER,
  STICKMAN_SKINS,
  UPGRADE_MATERIALS,
  stickmanAudio,
  type GachaSliceUI,
  type StickmanCharacterId,
  type StickmanProfile,
  type StickmanSkinId,
  type UpgradeMaterialId
} from './stickmanTypes';
import { LobbyStickmanCanvas, MaterialArtwork, WeaponArtwork } from './StickmanArt';
import { StickmanModernLogo } from './StickmanModernLogo';

export interface GachaSpinResult {
  success: boolean;
  message: string;
  sliceIndex?: number;
  slice?: GachaSliceUI;
  awardedCharacterId?: StickmanCharacterId | null;
  awardedSkinId?: StickmanSkinId | null;
  awardedMaterial?: { id: UpgradeMaterialId; amount: number } | null;
  awardedMaterialId?: UpgradeMaterialId | null;
  awardedMaterialAmount?: number;
  skinLockedByWeapon?: boolean;
  isDuplicateReward?: boolean;
  coinsAdded?: number;
}

interface StickmanGachaPageProps {
  profile: StickmanProfile;
  diamondBalance: number;
  isOwner: boolean;
  onBack: () => void;
  onGoShop: () => void;
  onEquipCharacter?: (characterId: StickmanCharacterId) => Promise<{ success: boolean; message: string }>;
  onSpin: (currency: 'coins' | 'diamond') => Promise<GachaSpinResult>;
}

interface SliceAngleRange {
  slice: GachaSliceUI;
  startDeg: number;
  endDeg: number;
  midDeg: number;
}

function renderSliceVectorIcon(slice: GachaSliceUI) {
  if (slice.kind === 'character') {
    // Mini Mythic THE VAN with flaming crimson wings & glowing red eyes
    return (
      <g>
        <path d="M-3 4 C-16 -12, -26 -14, -27 -2 C-20 2, -22 8, -26 12 C-17 15, -12 16, -3 10 Z" fill="#ef4444" stroke="#fde047" strokeWidth="1" />
        <path d="M3 4 C16 -12, 26 -14, 27 -2 C20 2, 22 8, 26 12 C17 15, 12 16, 3 10 Z" fill="#ef4444" stroke="#fde047" strokeWidth="1" />
        <circle cx="0" cy="-3" r="10" fill="#07090f" stroke="#fbbf24" strokeWidth="1.8" />
        <ellipse cx="-4" cy="-3" rx="2.6" ry="1.4" fill="#ff2a2a" />
        <ellipse cx="4" cy="-3" rx="2.6" ry="1.4" fill="#ff2a2a" />
        <path d="M-6 8 L6 8 L4 20 L-4 20 Z" fill="#090a0f" stroke="#ef4444" strokeWidth="1.4" />
      </g>
    );
  }
  if (slice.skinId === 'pedang_api_sayap') {
    return (
      <g>
        <path d="M-3 6 C-13 -4, -20 -10, -23 -8 C-17 -2, -19 4, -21 8 C-14 10, -8 11, -3 10 Z" fill="#7f1d1d" stroke="#fbbf24" strokeWidth="0.9" />
        <path d="M3 6 C13 -4, 20 -10, 23 -8 C17 -2, 19 4, 21 8 C14 10, 8 11, 3 10 Z" fill="#7f1d1d" stroke="#fbbf24" strokeWidth="0.9" />
        <polygon points="0,-20 3.5,-10 3,8 -3,8 -3.5,-10" fill="#fde047" stroke="#f97316" strokeWidth="1.2" />
        <rect x="-8" y="8" width="16" height="3.2" rx="1" fill="#d97706" />
        <rect x="-2" y="11" width="4" height="9" fill="#991b1b" />
      </g>
    );
  }
  if (slice.skinId === 'panah_api') {
    return (
      <g>
        <path d="M-8 -16 C10 -10, 10 10, -8 16" stroke="#ef4444" strokeWidth="3.5" fill="none" strokeLinecap="round" />
        <line x1="-14" y1="0" x2="18" y2="0" stroke="#fde047" strokeWidth="2.5" strokeLinecap="round" />
        <polygon points="22,0 13,-4.5 13,4.5" fill="#fbbf24" />
        <path d="M-2 -7 C6 -11, 14 -6, 18 0 C14 6, 6 11, -2 7 Z" fill="#f97316" opacity="0.55" />
      </g>
    );
  }
  if (slice.skinId === 'tembakan_naga_es') {
    return (
      <g>
        <rect x="-18" y="-5" width="28" height="9" rx="2" fill="#0284c7" stroke="#e0f2fe" strokeWidth="1" />
        <polygon points="-2,-5 6,-16 12,-5" fill="#7dd3fc" opacity="0.85" />
        <polygon points="8,-8 21,-3 18,6 8,5" fill="#0f172a" stroke="#7dd3fc" strokeWidth="1.2" />
        <circle cx="15" cy="-2" r="1.6" fill="#38bdf8" />
        <path d="M-14 4 L-17 15 L-11 15 L-8 4 Z" fill="#0f172a" stroke="#38bdf8" strokeWidth="1" />
      </g>
    );
  }
  if (slice.materialId === 'batu_api') {
    return (
      <polygon
        points="0,-16 13,-5 10,12 0,18 -11,11 -12,-6"
        fill="#f97316"
        stroke="#fef08a"
        strokeWidth="1.8"
      />
    );
  }
  if (slice.materialId === 'kristal_es') {
    return (
      <polygon
        points="0,-18 11,-5 8,13 0,19 -8,13 -11,-5"
        fill="#38bdf8"
        stroke="#f0f9ff"
        strokeWidth="1.8"
      />
    );
  }
  if (slice.materialId === 'emas') {
    return (
      <g>
        <polygon points="-14,3 -5,-10 14,-5 5,8" fill="#facc15" stroke="#fef9c3" strokeWidth="1.5" />
        <polygon points="-14,3 5,8 5,14 -14,9" fill="#d97706" stroke="#fde047" strokeWidth="1.1" />
      </g>
    );
  }
  // besi
  return (
    <g>
      <polygon points="-14,3 -5,-10 14,-5 5,8" fill="#94a3b8" stroke="#f1f5f9" strokeWidth="1.5" />
      <polygon points="-14,3 5,8 5,14 -14,9" fill="#475569" stroke="#cbd5e1" strokeWidth="1.1" />
    </g>
  );
}

export const StickmanGachaPage: React.FC<StickmanGachaPageProps> = ({
  profile,
  diamondBalance,
  isOwner,
  onBack,
  onGoShop,
  onEquipCharacter,
  onSpin
}) => {
  const [spinningCurrency, setSpinningCurrency] = useState<'coins' | 'diamond' | null>(null);
  const [rotationDeg, setRotationDeg] = useState<number>(0);
  const [isSpinning, setIsSpinning] = useState<boolean>(false);
  const [resultModal, setResultModal] = useState<GachaSpinResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [vanEquippedToast, setVanEquippedToast] = useState<string | null>(null);
  const tickTimerRef = useRef<number | null>(null);

  const sliceRanges: SliceAngleRange[] = useMemo(() => {
    const totalW = GACHA_WHEEL_SLICES.reduce((s, item) => s + item.visualWeight, 0);
    let cursor = 0;
    return GACHA_WHEEL_SLICES.map((slice) => {
      const span = (slice.visualWeight / totalW) * 360;
      const startDeg = cursor;
      const endDeg = cursor + span;
      const midDeg = startDeg + span / 2;
      cursor = endDeg;
      return { slice, startDeg, endDeg, midDeg };
    });
  }, []);

  const canSpinCoins = !isSpinning && profile.coins >= GACHA_SPIN_COST.coins;
  const canSpinDiamond = !isSpinning && (isOwner || diamondBalance >= GACHA_SPIN_COST.diamond);

  const pityCount = Number(profile.gachaPity || 0);
  const isPityGuaranteedNext = pityCount >= 15;
  const ownsVan = profile.ownedCharacters?.includes('the_van');

  const handleSpinClick = async (chosenCurrency: 'coins' | 'diamond') => {
    if (isSpinning) return;
    stickmanAudio.unlock();
    setErrorMsg(null);
    setResultModal(null);
    setVanEquippedToast(null);
    setSpinningCurrency(chosenCurrency);

    const res = await onSpin(chosenCurrency);
    if (!res.success || typeof res.sliceIndex !== 'number') {
      setSpinningCurrency(null);
      setErrorMsg(res.message || 'Gagal memutar roda gacha.');
      return;
    }

    const normalizedRes: GachaSpinResult = {
      ...res,
      awardedMaterial:
        res.awardedMaterial ||
        (res.awardedMaterialId
          ? { id: res.awardedMaterialId, amount: res.awardedMaterialAmount || 1 }
          : null)
    };

    const targetRange = sliceRanges[normalizedRes.sliceIndex] || sliceRanges[0];
    const jitter =
      (Math.random() - 0.5) *
      Math.min(12, (targetRange.endDeg - targetRange.startDeg) * 0.4);
    const desiredMod = (360 - (targetRange.midDeg + jitter) + 360) % 360;
    const currentMod = ((rotationDeg % 360) + 360) % 360;
    const delta = (desiredMod - currentMod + 360) % 360;
    const extraSpins = 7 * 360;
    const nextRotation = rotationDeg + extraSpins + delta;

    setIsSpinning(true);
    setRotationDeg(nextRotation);

    let step = 0;
    const runTick = () => {
      if (step > 26) return;
      stickmanAudio.playGachaTick();
      step += 1;
      const delay = 62 + step * 11;
      tickTimerRef.current = window.setTimeout(runTick, delay);
    };
    runTick();

    window.setTimeout(() => {
      if (tickTimerRef.current) clearTimeout(tickTimerRef.current);
      setIsSpinning(false);
      setSpinningCurrency(null);
      setResultModal(normalizedRes);
      if (normalizedRes.slice?.kind === 'character') {
        stickmanAudio.playGachaUtama();
      } else {
        stickmanAudio.playGachaGood();
      }
    }, 5100);
  };

  const describeSlice = (cx: number, cy: number, r: number, startDeg: number, endDeg: number) => {
    const a1 = ((startDeg - 90) * Math.PI) / 180;
    const a2 = ((endDeg - 90) * Math.PI) / 180;
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);
    const x2 = cx + r * Math.cos(a2);
    const y2 = cy + r * Math.sin(a2);
    const largeArc = endDeg - startDeg > 180 ? 1 : 0;
    return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
  };

  return (
    <div className="w-full h-full flex flex-col bg-gradient-to-br from-[#070b14] via-[#101626] to-[#080a0f] text-white overflow-hidden relative">
      {/* Header */}
      <header className="px-3 py-1.5 border-b border-white/10 bg-black/75 flex items-center justify-between gap-2 shrink-0 z-10 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={onBack}
            disabled={isSpinning}
            className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 flex items-center justify-center cursor-pointer active:scale-95 transition shrink-0 disabled:opacity-40"
          >
            <ArrowLeft size={16} />
          </button>
          <StickmanModernLogo size={28} />
          <div className="min-w-0">
            <h1 className="text-xs sm:text-sm font-black tracking-wider uppercase text-amber-300 truncate">
              GACHA MYTHIC &amp; SKIN HD
            </h1>
            <p className="text-[9.5px] text-zinc-400 truncate">
              THE VAN 5% · Skin Legendaris · Komponen Upgrade
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <div className="px-2 py-1 rounded-lg bg-black/60 border border-amber-500/30 flex items-center gap-1">
            <Coins size={13} className="text-amber-400" />
            <span className="text-[11px] font-black tabular-nums text-amber-200">
              {profile.coins.toLocaleString('id-ID')}
            </span>
          </div>
          <div className="px-2 py-1 rounded-lg bg-black/60 border border-sky-400/30 flex items-center gap-1">
            <Gem size={13} className="text-sky-400" />
            <span className="text-[11px] font-black tabular-nums text-sky-200">
              {isOwner ? 'UNLIMITED' : diamondBalance.toLocaleString('id-ID')}
            </span>
          </div>
        </div>
      </header>

      {/* Main Scrollable Flex Layout (Zero Overlap, Pity -> Wheel -> Spin Below) */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-3.5 py-2.5">
        <div className="min-h-full flex flex-col sm:flex-row items-center sm:items-stretch justify-between gap-4 max-w-6xl mx-auto pb-2">
          {/* LEFT / CENTER-STAGE: PITY ABOVE WHEEL -> WHEEL (up to 320x320) -> SPIN 100 KOIN CENTERED BELOW */}
          <div className="flex-1 flex flex-col items-center justify-center gap-2.5 bg-black/45 border border-white/10 rounded-2xl p-3">
            {/* Pity Banner Above Wheel */}
            <div className="px-3 py-1 rounded-xl bg-red-950/75 border border-amber-400/55 text-[11px] font-black text-amber-200 tabular-nums text-center">
              {isPityGuaranteedNext
                ? 'PITY AKTIF: Spin Ke-16 PASTI THE VAN!'
                : `Pity: ${pityCount}/15 (Ke-16 THE VAN)`}
            </div>

            {/* Centered Gacha Wheel (Responsive up to 320x320, scales neatly on short landscape) */}
            <div className="relative w-[172px] h-[172px] sm:w-[210px] sm:h-[210px] lg:w-[320px] lg:h-[320px] flex items-center justify-center shrink-0">
              <div className="absolute inset-0 rounded-full bg-amber-500/20 blur-xl pointer-events-none" />

              <div className="absolute -top-2 left-1/2 -translate-x-1/2 z-20 drop-shadow-[0_4px_8px_rgba(0,0,0,0.9)]">
                <svg width="26" height="24" viewBox="0 0 26 24">
                  <polygon points="13,22 2,2 24,2" fill="#facc15" stroke="#78350f" strokeWidth="2.5" />
                </svg>
              </div>

              <div
                className="w-full h-full rounded-full shadow-[0_0_34px_rgba(0,0,0,0.95)] border-4 border-amber-400/80 overflow-hidden"
                style={{
                  transform: `rotate(${rotationDeg}deg)`,
                  transition: isSpinning
                    ? 'transform 5s cubic-bezier(0.12, 0.85, 0.16, 1)'
                    : 'none'
                }}
              >
                <svg viewBox="0 0 340 340" className="w-full h-full">
                  <defs>
                    <linearGradient id="vanWedgeGold" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#fef08a" />
                      <stop offset="45%" stopColor="#f59e0b" />
                      <stop offset="100%" stopColor="#991b1b" />
                    </linearGradient>
                    <linearGradient id="skinFireWedge" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#ea580c" />
                      <stop offset="100%" stopColor="#7f1d1d" />
                    </linearGradient>
                    <linearGradient id="skinIceWedge" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#0284c7" />
                      <stop offset="100%" stopColor="#0f172a" />
                    </linearGradient>
                  </defs>

                  {sliceRanges.map(({ slice, startDeg, endDeg, midDeg }, i) => {
                    const isVan = slice.kind === 'character';
                    const fill = isVan
                      ? 'url(#vanWedgeGold)'
                      : slice.skinId === 'tembakan_naga_es'
                      ? 'url(#skinIceWedge)'
                      : slice.kind === 'skin'
                      ? 'url(#skinFireWedge)'
                      : i % 2 === 0
                      ? '#1e293b'
                      : '#111827';
                    const stroke = isVan ? '#fef08a' : '#334155';

                    return (
                      <g key={slice.id}>
                        <path
                          d={describeSlice(170, 170, 168, startDeg, endDeg)}
                          fill={fill}
                          stroke={stroke}
                          strokeWidth={isVan ? 3 : 1.5}
                        />
                        <g transform={`rotate(${midDeg} 170 170)`}>
                          <g transform="translate(170, 62) scale(0.95)">
                            {renderSliceVectorIcon(slice)}
                          </g>
                          <text
                            x="170"
                            y="102"
                            textAnchor="middle"
                            fill={isVan ? '#fef9c3' : '#f8fafc'}
                            fontSize={isVan ? '8.5' : '7'}
                            fontWeight="900"
                          >
                            {isVan ? 'THE VAN (5%)' : slice.label.split(' ')[0]}
                          </text>
                        </g>
                      </g>
                    );
                  })}

                  <circle cx="170" cy="170" r="28" fill="#09090b" stroke="#fbbf24" strokeWidth="4" />
                  <text
                    x="170"
                    y="174"
                    textAnchor="middle"
                    fill="#fde047"
                    fontSize="10"
                    fontWeight="900"
                  >
                    SPIN
                  </text>
                </svg>
              </div>
            </div>

            {errorMsg && (
              <div className="px-3 py-1 rounded-xl bg-rose-950/75 border border-rose-500/40 text-[11px] font-bold text-rose-200 text-center">
                {errorMsg}
              </div>
            )}

            {/* SPIN 100 KOIN (w-180 h-56) + SPIN 1000 DIAMOND Centered Below Wheel */}
            <div className="flex flex-wrap items-center justify-center gap-2.5 w-full">
              <button
                type="button"
                onClick={() => handleSpinClick('coins')}
                disabled={!canSpinCoins}
                className={`w-[180px] h-[46px] sm:h-[56px] px-3 rounded-xl font-black text-xs uppercase tracking-wide flex items-center justify-center gap-1.5 transition whitespace-nowrap ${
                  canSpinCoins
                    ? 'bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 hover:brightness-110 text-black cursor-pointer active:scale-[0.98] shadow-[0_4px_16px_rgba(245,158,11,0.4)]'
                    : 'bg-white/10 text-zinc-400 border border-white/10 cursor-not-allowed'
                }`}
              >
                {spinningCurrency === 'coins' && isSpinning ? (
                  <Disc3 size={15} className="animate-spin shrink-0" />
                ) : (
                  <Coins size={15} className="shrink-0" />
                )}
                <span>
                  {spinningCurrency === 'coins' && isSpinning
                    ? 'BERPUTAR...'
                    : `SPIN ${GACHA_SPIN_COST.coins} KOIN`}
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleSpinClick('diamond')}
                disabled={!canSpinDiamond}
                className={`w-[180px] h-[46px] sm:h-[56px] px-3 rounded-xl font-black text-xs uppercase tracking-wide flex items-center justify-center gap-1.5 transition whitespace-nowrap ${
                  canSpinDiamond
                    ? 'bg-gradient-to-r from-sky-400 via-cyan-400 to-blue-500 hover:brightness-110 text-black cursor-pointer active:scale-[0.98] shadow-[0_4px_16px_rgba(56,189,248,0.4)]'
                    : 'bg-white/10 text-zinc-400 border border-white/10 cursor-not-allowed'
                }`}
              >
                {spinningCurrency === 'diamond' && isSpinning ? (
                  <Disc3 size={15} className="animate-spin shrink-0" />
                ) : (
                  <Gem size={15} className="shrink-0" />
                )}
                <span>
                  {spinningCurrency === 'diamond' && isSpinning
                    ? 'BERPUTAR...'
                    : `SPIN ${GACHA_SPIN_COST.diamond} DIAMOND`}
                </span>
              </button>
            </div>
          </div>

          {/* RIGHT SIDE PANEL: HADIAH UTAMA + PELUANG + SKIN LEGENDARIS HD (NON-OVERLAPPING) */}
          <div className="w-full sm:w-[300px] md:w-[340px] shrink-0 flex flex-col justify-between gap-3">
            {/* HADIAH UTAMA: THE VAN */}
            <div className="rounded-xl border border-red-500/55 bg-gradient-to-r from-red-950/75 via-amber-950/35 to-black/80 p-3 flex items-center justify-between gap-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-11 h-11 rounded-lg bg-black/70 border border-amber-400/50 flex items-center justify-center shrink-0 overflow-hidden">
                  <LobbyStickmanCanvas
                    yawDeg={16}
                    weapon="sword"
                    skin="pedang_api_sayap"
                    character="the_van"
                    className="w-12 h-11"
                  />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <Flame size={13} className="text-red-400 shrink-0" />
                    <span className="text-[11px] font-black uppercase text-amber-300 truncate">
                      HADIAH UTAMA (5%): THE VAN
                    </span>
                  </div>
                  <p className="text-[10px] text-zinc-300 leading-snug mt-0.5">
                    HP 150 · Shadow Vanish (180 DMG) &amp; Dragon Van (200 DMG)
                  </p>
                </div>
              </div>
              <span
                className={`px-2 py-0.5 rounded-lg text-[9.5px] font-black uppercase shrink-0 ${
                  ownsVan
                    ? 'bg-emerald-500/20 border border-emerald-400/50 text-emerald-300'
                    : 'bg-red-500 text-black'
                }`}
              >
                {ownsVan ? 'DIMILIKI' : 'MYTHIC'}
              </span>
            </div>

            {/* Pool Skin Legendaris */}
            <div className="rounded-xl border border-amber-400/35 bg-black/60 p-3 space-y-2">
              <div className="flex items-center gap-1.5">
                <Crown size={14} className="text-amber-400" />
                <span className="text-[11px] font-black uppercase tracking-wider text-amber-300">
                  SKIN LEGENDARIS HD (10% - 12%)
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {LEGENDARY_SKIN_ORDER.map((skinId) => {
                  const skin = STICKMAN_SKINS[skinId];
                  const owned = profile.ownedSkins.includes(skinId);
                  return (
                    <div
                      key={skinId}
                      className="rounded-lg border border-white/12 bg-black/60 p-1.5 flex flex-col items-center text-center gap-1"
                    >
                      <WeaponArtwork weapon={skin.baseWeapon} skin={skinId} className="w-16 h-9" />
                      <p className="text-[9.5px] font-black text-white leading-tight truncate w-full">
                        {skin.name}
                      </p>
                      <p className="text-[8.5px] font-bold text-amber-300 truncate w-full">
                        {skin.damageBadge} {owned ? '· Dimiliki' : ''}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Honest Drop Rates Card */}
            <div className="rounded-xl border border-white/12 bg-black/60 p-3 space-y-1">
              <p className="text-[10px] font-black uppercase tracking-wider text-zinc-300">
                PELUANG HADIAH RESMI
              </p>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-bold">
                <span className="text-amber-300">THE VAN 5%</span>
                <span className="text-zinc-600">·</span>
                <span className="text-orange-300">Pedang Api 10%</span>
                <span className="text-zinc-600">·</span>
                <span className="text-red-300">Panah Api 12%</span>
                <span className="text-zinc-600">·</span>
                <span className="text-sky-300">Naga Es 12%</span>
                <span className="text-zinc-600">·</span>
                <span className="text-zinc-300">Batu Api 15% · Kristal Es 15% · Besi 16% · Emas 15%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* FULLSCREEN RESULT MODAL */}
      {resultModal && (
        <div className="fixed inset-0 z-50 bg-black/88 backdrop-blur-md flex items-center justify-center p-4">
          {resultModal.awardedCharacterId === 'the_van' ? (
            <div className="relative max-w-md w-full rounded-3xl border-2 border-red-400 bg-gradient-to-b from-red-950/90 via-[#1a0505] to-black p-5 text-center shadow-[0_0_90px_rgba(239,68,68,0.85)] overflow-hidden">
              <div className="relative z-10 flex flex-col items-center gap-2.5">
                <span className="text-xs font-black tracking-[0.25em] uppercase text-amber-300">
                  HADIAH UTAMA MYTHIC!
                </span>
                <h2 className="text-3xl font-black tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 via-red-400 to-orange-400">
                  {CHARACTER_DEFS.the_van.name}
                </h2>
                <div className="w-56 h-36 rounded-2xl bg-black/70 border border-red-400/60 flex items-center justify-center">
                  <LobbyStickmanCanvas
                    yawDeg={18}
                    weapon={profile.equippedWeapon}
                    skin={profile.equippedSkin}
                    character="the_van"
                    className="w-52 h-34"
                  />
                </div>
                <p className="text-xs text-amber-100 leading-snug">
                  {resultModal.isDuplicateReward
                    ? `Anda sudah memiliki THE VAN (+${resultModal.coinsAdded} Koin bonus!)`
                    : 'Karakter Terkuat dengan Sayap Api Merah Besar, Shadow Vanish (180 DMG) & Dragon Van (200 DMG + Bakar)!'}
                </p>
                {vanEquippedToast && (
                  <p className="text-xs font-black text-emerald-300">{vanEquippedToast}</p>
                )}
                <div className="flex items-center gap-2 w-full">
                  {onEquipCharacter && (
                    <button
                      type="button"
                      onClick={async () => {
                        const eqRes = await onEquipCharacter('the_van');
                        setVanEquippedToast(eqRes.message || 'THE VAN langsung dipakai!');
                      }}
                      className="flex-1 py-2.5 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-black font-black text-xs uppercase cursor-pointer"
                    >
                      Pakai THE VAN
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setResultModal(null)}
                    className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-red-500 to-amber-500 text-black font-black text-xs uppercase cursor-pointer"
                  >
                    Mantap!
                  </button>
                </div>
              </div>
            </div>
          ) : resultModal.awardedSkinId ? (
            <div className="relative max-w-md w-full rounded-3xl border-2 border-amber-300 bg-gradient-to-b from-amber-900/90 via-[#1a1103] to-black p-5 text-center shadow-[0_0_70px_rgba(251,191,36,0.65)] space-y-3">
              <p className="text-xs font-black tracking-[0.2em] uppercase text-amber-200">
                SKIN LEGENDARIS HD!
              </p>
              <div className="w-48 h-28 mx-auto rounded-2xl bg-black/65 border border-amber-400/50 flex items-center justify-center p-2">
                <WeaponArtwork
                  weapon={STICKMAN_SKINS[resultModal.awardedSkinId].baseWeapon}
                  skin={resultModal.awardedSkinId}
                  className="w-40 h-24"
                />
              </div>
              <h3 className="text-xl font-black text-white">
                {STICKMAN_SKINS[resultModal.awardedSkinId].name}
              </h3>
              <p className="text-xs font-bold text-amber-300">
                {STICKMAN_SKINS[resultModal.awardedSkinId].damageBadge}
              </p>
              {resultModal.isDuplicateReward && (
                <p className="text-xs text-emerald-300 font-bold">
                  Skin sudah dimiliki: dikonversi +{resultModal.coinsAdded} Koin!
                </p>
              )}
              {resultModal.skinLockedByWeapon && (
                <div className="px-3 py-2 rounded-xl bg-black/70 border border-amber-500/40 text-[11px] font-bold text-amber-200 flex items-center justify-center gap-1.5">
                  <Lock size={13} />
                  <span>
                    Terkunci di Inventory. Beli {DEFAULT_WEAPONS[STICKMAN_SKINS[resultModal.awardedSkinId].baseWeapon].name} di Shop!
                  </span>
                </div>
              )}
              <div className="flex items-center gap-2">
                {resultModal.skinLockedByWeapon && (
                  <button
                    type="button"
                    onClick={() => {
                      setResultModal(null);
                      onGoShop();
                    }}
                    className="flex-1 py-2.5 rounded-xl bg-amber-400 text-black font-black text-xs uppercase cursor-pointer"
                  >
                    Buka Shop
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setResultModal(null)}
                  className="flex-1 py-2.5 rounded-xl bg-white text-black font-black text-xs uppercase cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </div>
          ) : resultModal.awardedMaterial ? (
            <div className="max-w-sm w-full rounded-3xl border border-sky-400/50 bg-gradient-to-b from-slate-900 to-black p-5 text-center shadow-2xl space-y-3">
              <p className="text-xs font-black uppercase tracking-widest text-sky-300">
                KOMPONEN UPGRADE SENJATA
              </p>
              <div className="w-24 h-24 mx-auto rounded-2xl bg-black/60 border border-sky-400/35 flex items-center justify-center">
                <MaterialArtwork materialId={resultModal.awardedMaterial.id} className="w-16 h-16" />
              </div>
              <h3 className="text-xl font-black text-white">
                {UPGRADE_MATERIALS[resultModal.awardedMaterial.id].name} x{resultModal.awardedMaterial.amount}
              </h3>
              <p className="text-xs text-zinc-300">
                {UPGRADE_MATERIALS[resultModal.awardedMaterial.id].desc}
              </p>
              <button
                type="button"
                onClick={() => setResultModal(null)}
                className="w-full py-2.5 rounded-xl bg-sky-400 text-black font-black text-xs uppercase cursor-pointer hover:bg-sky-300"
              >
                Simpan ke Inventory
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};
