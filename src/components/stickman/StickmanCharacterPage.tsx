import React, { useRef, useState } from 'react';
import { ArrowLeft, Check, Coins, Disc3, Flame, Heart, Lock, Shield, Zap } from 'lucide-react';
import {
  CHARACTER_DEFS,
  CHARACTER_ORDER,
  type StickmanCharacterId,
  type StickmanProfile
} from './stickmanTypes';
import { CharacterPortraitSvg, LobbyStickmanCanvas } from './StickmanArt';

interface StickmanCharacterPageProps {
  profile: StickmanProfile;
  onBack: () => void;
  onGoGacha: () => void;
  onBuyCharacter: (characterId: StickmanCharacterId) => Promise<{ success: boolean; message: string }>;
  onEquipCharacter: (characterId: StickmanCharacterId) => Promise<{ success: boolean; message: string }>;
}

export const StickmanCharacterPage: React.FC<StickmanCharacterPageProps> = ({
  profile,
  onBack,
  onGoGacha,
  onBuyCharacter,
  onEquipCharacter
}) => {
  const [selectedId, setSelectedId] = useState<StickmanCharacterId>(profile.equippedCharacter || 'rex');
  const [yawDeg, setYawDeg] = useState<number>(18);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const dragRef = useRef<{ active: boolean; lastX: number }>({ active: false, lastX: 0 });

  const selectedChar = CHARACTER_DEFS[selectedId];
  const isOwned = profile.ownedCharacters.includes(selectedId);
  const isEquipped = profile.equippedCharacter === selectedId;
  const priceCoins = selectedChar.priceCoins ?? 0;
  const canAfford = !selectedChar.gachaOnly && profile.coins >= priceCoins;

  const handleBuy = async () => {
    if (selectedChar.gachaOnly) {
      onGoGacha();
      return;
    }
    setBusyId(selectedId);
    setNotice(null);
    try {
      const res = await onBuyCharacter(selectedId);
      setNotice({ text: res.message, ok: res.success });
    } finally {
      setBusyId(null);
    }
  };

  const handleEquip = async () => {
    setBusyId(selectedId);
    setNotice(null);
    try {
      const res = await onEquipCharacter(selectedId);
      setNotice({ text: res.message, ok: res.success });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-gradient-to-br from-[#070b14] via-[#0e1424] to-[#06080e] text-white overflow-hidden">
      {/* Header */}
      <header className="px-4 py-2 border-b border-white/10 bg-black/65 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 flex items-center justify-center cursor-pointer active:scale-95 transition shrink-0"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0">
            <h1 className="text-sm font-black tracking-wider uppercase text-amber-300 truncate">
              PILIH KARAKTER STICKMAN
            </h1>
            <p className="text-[10px] text-zinc-400 truncate">
              Setiap karakter memiliki HP unik &amp; 2 Skill Aktif (tetap aktif walau ganti senjata)
            </p>
          </div>
        </div>

        <div className="px-2.5 py-1 rounded-lg bg-black/60 border border-amber-500/30 flex items-center gap-1.5 shrink-0">
          <Coins size={14} className="text-amber-400" />
          <span className="text-xs font-black tabular-nums text-amber-200">
            {profile.coins.toLocaleString('id-ID')} Koin
          </span>
        </div>
      </header>

      {notice && (
        <div
          className={`mx-4 mt-2 px-3.5 py-1.5 rounded-xl text-xs font-bold border flex items-center justify-between gap-2 shrink-0 ${
            notice.ok
              ? 'bg-emerald-950/75 border-emerald-500/40 text-emerald-200'
              : 'bg-rose-950/75 border-rose-500/40 text-rose-200'
          }`}
        >
          <span>{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} className="text-[10px] opacity-75 hover:opacity-100 cursor-pointer">
            Tutup
          </button>
        </div>
      )}

      {/* Split Layout: Left 5 Character Cards | Right Live Preview + Skills + Buy/Equip */}
      <div className="flex-1 flex items-stretch gap-3.5 px-4 py-2.5 min-h-0 overflow-hidden">
        {/* LEFT: 5 Character List */}
        <div className="w-[340px] shrink-0 grid grid-cols-1 gap-2 overflow-y-auto pr-1">
          {CHARACTER_ORDER.map((cId) => {
            const c = CHARACTER_DEFS[cId];
            const owned = profile.ownedCharacters.includes(cId);
            const active = profile.equippedCharacter === cId;
            const selected = selectedId === cId;
            const isVan = cId === 'the_van';

            return (
              <button
                key={cId}
                type="button"
                onClick={() => setSelectedId(cId)}
                className={`w-full rounded-xl border p-2.5 flex items-center gap-3 text-left transition cursor-pointer ${
                  selected
                    ? isVan
                      ? 'bg-gradient-to-r from-red-950/80 via-amber-950/50 to-black border-red-400 shadow-[0_0_20px_rgba(239,68,68,0.4)]'
                      : 'bg-white/[0.11] border-amber-400 shadow-[0_0_16px_rgba(251,191,36,0.28)]'
                    : isVan
                    ? 'bg-red-950/25 border-red-500/35 hover:border-red-400'
                    : 'bg-black/50 border-white/12 hover:border-white/30'
                }`}
              >
                <div
                  className={`w-13 h-13 rounded-xl border flex items-center justify-center shrink-0 ${
                    isVan
                      ? 'bg-black/75 border-red-500/60'
                      : 'bg-black/60 border-white/15'
                  }`}
                >
                  <CharacterPortraitSvg characterId={cId} className="w-11 h-11" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-sm font-black tracking-wide truncate ${isVan ? 'text-red-300' : 'text-white'}`}>
                      {c.name}
                    </span>
                    {active ? (
                      <span className="px-1.5 py-0.5 rounded bg-emerald-500/25 border border-emerald-400/50 text-[9px] font-black text-emerald-300 uppercase shrink-0">
                        DIPAKAI
                      </span>
                    ) : owned ? (
                      <span className="px-1.5 py-0.5 rounded bg-white/10 text-[9px] font-bold text-zinc-200 uppercase shrink-0">
                        DIMILIKI
                      </span>
                    ) : c.gachaOnly ? (
                      <span className="px-1.5 py-0.5 rounded bg-red-600/30 border border-red-400/60 text-[9px] font-black text-amber-300 uppercase shrink-0 flex items-center gap-0.5">
                        <Lock size={9} /> GACHA
                      </span>
                    ) : (
                      <span className="text-[10px] font-black text-amber-300 shrink-0">
                        {c.priceCoins === 0 ? 'GRATIS' : `${c.priceCoins?.toLocaleString('id-ID')} Koin`}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] font-bold text-zinc-400 truncate">
                    {c.role} · HP {c.hp}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* RIGHT: Live Preview + Full Details */}
        <div
          className={`flex-1 rounded-2xl border p-3.5 flex items-center gap-4 min-w-0 ${
            selectedId === 'the_van'
              ? 'bg-gradient-to-br from-red-950/55 via-[#130808] to-black border-red-500/50'
              : 'bg-black/55 border-white/15'
          }`}
        >
          {/* Live Rotatable Character Stage */}
          <div
            onPointerDown={(e) => {
              dragRef.current = { active: true, lastX: e.clientX };
            }}
            onPointerMove={(e) => {
              if (!dragRef.current.active) return;
              const dx = e.clientX - dragRef.current.lastX;
              dragRef.current.lastX = e.clientX;
              setYawDeg((y) => y + dx * 0.9);
            }}
            onPointerUp={() => {
              dragRef.current.active = false;
            }}
            onPointerLeave={() => {
              dragRef.current.active = false;
            }}
            className="w-[235px] h-full rounded-xl bg-black/50 border border-white/10 flex flex-col items-center justify-center relative cursor-grab active:cursor-grabbing shrink-0 overflow-hidden"
          >
            <LobbyStickmanCanvas
              yawDeg={yawDeg}
              weapon={profile.equippedWeapon}
              skin={profile.equippedSkin}
              character={selectedId}
              className="w-full h-full max-w-[230px]"
            />
            <span className="absolute bottom-1.5 text-[9px] text-zinc-400 font-semibold pointer-events-none">
              Geser untuk putar 360°
            </span>
          </div>

          {/* Info & Skills */}
          <div className="flex-1 h-full flex flex-col justify-between gap-2 min-w-0">
            <div className="space-y-2 overflow-y-auto pr-1">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span
                    className={`text-[10px] font-black tracking-widest uppercase ${
                      selectedId === 'the_van' ? 'text-red-400' : 'text-amber-300'
                    }`}
                  >
                    {selectedChar.role}
                  </span>
                  <h2 className="text-2xl font-black tracking-wide text-white leading-none">
                    {selectedChar.name}
                  </h2>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="px-2.5 py-1 rounded-lg bg-emerald-950/60 border border-emerald-500/40 flex items-center gap-1 text-xs font-black text-emerald-300">
                    <Heart size={13} />
                    <span>HP {selectedChar.hp}</span>
                  </div>
                  <div className="px-2.5 py-1 rounded-lg bg-sky-950/60 border border-sky-500/40 flex items-center gap-1 text-xs font-black text-sky-300">
                    <Zap size={13} />
                    <span>SPD {selectedChar.moveSpeed.toFixed(1)}</span>
                  </div>
                </div>
              </div>

              <p className="text-xs text-zinc-300 leading-snug">{selectedChar.summary}</p>

              {/* Skill 1 & Skill 2 */}
              <div className="grid grid-cols-1 gap-2 pt-1">
                <div className="rounded-xl bg-white/[0.04] border border-orange-400/30 p-2.5">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="text-xs font-black text-orange-300 flex items-center gap-1.5 uppercase">
                      <Flame size={13} /> Skill 1 · {selectedChar.skill1.name}
                    </span>
                    <span className="text-[10px] font-mono text-zinc-400">
                      CD {selectedChar.skill1.cooldownSec} dtk
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-300 leading-snug">{selectedChar.skill1.desc}</p>
                </div>

                <div className="rounded-xl bg-white/[0.04] border border-sky-400/30 p-2.5">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="text-xs font-black text-sky-300 flex items-center gap-1.5 uppercase">
                      <Shield size={13} /> Skill 2 · {selectedChar.skill2.name}
                    </span>
                    <span className="text-[10px] font-mono text-zinc-400">
                      CD {selectedChar.skill2.cooldownSec} dtk
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-300 leading-snug">{selectedChar.skill2.desc}</p>
                </div>
              </div>
            </div>

            {/* Bottom Action Button */}
            <div className="pt-1 shrink-0">
              {isOwned ? (
                <button
                  type="button"
                  onClick={handleEquip}
                  disabled={isEquipped || busyId === selectedId}
                  className={`w-full py-2.5 rounded-xl font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition ${
                    isEquipped
                      ? 'bg-emerald-500/20 border border-emerald-400/50 text-emerald-300 cursor-default'
                      : 'bg-emerald-500 hover:bg-emerald-400 text-black cursor-pointer active:scale-95 shadow-lg'
                  }`}
                >
                  <Check size={16} />
                  <span>{isEquipped ? 'KARAKTER SEDANG DIPAKAI' : 'PAKAI'}</span>
                </button>
              ) : selectedChar.gachaOnly ? (
                <button
                  type="button"
                  onClick={onGoGacha}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-red-600 via-amber-500 to-red-600 hover:brightness-110 text-black font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer active:scale-95 shadow-[0_0_24px_rgba(239,68,68,0.5)]"
                >
                  <Disc3 size={17} />
                  <span>GACHA SEKARANG (KHUSUS GACHA · PITY 15X)</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleBuy}
                  disabled={!canAfford || busyId === selectedId}
                  className={`w-full py-2.5 rounded-xl font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition ${
                    canAfford
                      ? 'bg-amber-500 hover:bg-amber-400 text-black cursor-pointer active:scale-95 shadow-lg'
                      : 'bg-rose-950/75 border border-rose-500/50 text-rose-200 cursor-not-allowed'
                  }`}
                >
                  {!canAfford && <Lock size={15} />}
                  <Coins size={15} />
                  <span>
                    {busyId === selectedId
                      ? 'MEMBELI...'
                      : canAfford
                      ? `BELI · ${priceCoins.toLocaleString('id-ID')} KOIN`
                      : `KURANG ${(priceCoins - profile.coins).toLocaleString('id-ID')} KOIN`}
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
