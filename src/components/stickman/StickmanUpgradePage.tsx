import React, { useState } from 'react';
import { ArrowLeft, ArrowUpCircle, Check, Coins, Lock, ShoppingBag } from 'lucide-react';
import {
  DEFAULT_WEAPONS,
  UPGRADE_MATERIALS,
  WEAPON_UPGRADE_TIERS,
  stickmanAudio,
  type StickmanBuyableWeaponId,
  type StickmanProfile,
  type UpgradeMaterialId
} from './stickmanTypes';
import { MaterialArtwork, WeaponArtwork } from './StickmanArt';

interface StickmanUpgradePageProps {
  profile: StickmanProfile;
  onBack: () => void;
  onGoShop: () => void;
  onUpgradeWeapon: (weaponId: StickmanBuyableWeaponId) => Promise<{ success: boolean; message: string }>;
}

export const StickmanUpgradePage: React.FC<StickmanUpgradePageProps> = ({
  profile,
  onBack,
  onGoShop,
  onUpgradeWeapon
}) => {
  const [selectedWeapon, setSelectedWeapon] = useState<StickmanBuyableWeaponId>('sword');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);

  const weaponOrder: StickmanBuyableWeaponId[] = ['sword', 'bow', 'pistol'];
  const currentLv = Math.max(1, Math.min(5, Number(profile.weaponLevels?.[selectedWeapon] || 1)));
  const isOwned = profile.ownedWeapons.includes(selectedWeapon);
  const tiers = WEAPON_UPGRADE_TIERS[selectedWeapon];
  const currentTier = tiers[currentLv - 1];
  const nextTier = currentLv < 5 ? tiers[currentLv] : null;

  const missingMaterials: string[] = [];
  if (nextTier) {
    (Object.entries(nextTier.materials) as Array<[UpgradeMaterialId, number]>).forEach(
      ([matId, needed]) => {
        const have = Number(profile.upgradeMaterials?.[matId] || 0);
        if (have < needed) {
          missingMaterials.push(`${UPGRADE_MATERIALS[matId].name} (${have}/${needed})`);
        }
      }
    );
    if (profile.coins < nextTier.coinsCost) {
      missingMaterials.push(`Kurang ${(nextTier.coinsCost - profile.coins).toLocaleString('id-ID')} Koin`);
    }
  }

  const canUpgrade = Boolean(isOwned && nextTier && missingMaterials.length === 0 && !busy);

  const handleUpgrade = async () => {
    if (!canUpgrade) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await onUpgradeWeapon(selectedWeapon);
      setNotice({ text: res.message, ok: res.success });
      if (res.success) {
        stickmanAudio.playUpgradeSuccess();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-gradient-to-b from-[#080d17] via-[#0f1625] to-[#06080d] text-white overflow-hidden">
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
              UPGRADE SENJATA (LV 1 - LV 5 MAX)
            </h1>
            <p className="text-[10px] text-zinc-400 truncate">
              Pakai Komponen dari Gacha + Koin untuk meningkatkan Damage &amp; Efek Visual Senjata
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

      {/* Main Split */}
      <div className="flex-1 flex items-stretch gap-4 px-4 py-3 min-h-0 overflow-hidden">
        {/* LEFT: 3 Weapon Cards */}
        <div className="w-[270px] shrink-0 flex flex-col gap-2.5">
          {weaponOrder.map((wId) => {
            const w = DEFAULT_WEAPONS[wId];
            const owned = profile.ownedWeapons.includes(wId);
            const lv = Math.max(1, Math.min(5, Number(profile.weaponLevels?.[wId] || 1)));
            const dmgNow = WEAPON_UPGRADE_TIERS[wId][lv - 1].damage;
            const active = selectedWeapon === wId;

            return (
              <button
                key={wId}
                type="button"
                onClick={() => setSelectedWeapon(wId)}
                className={`flex-1 rounded-2xl border p-3 flex items-center gap-3 text-left transition cursor-pointer ${
                  active
                    ? 'bg-amber-950/45 border-amber-400 shadow-[0_0_16px_rgba(251,191,36,0.3)]'
                    : 'bg-black/50 border-white/12 hover:border-white/30'
                }`}
              >
                <div className="w-16 h-12 rounded-xl bg-black/60 border border-white/10 flex items-center justify-center p-1 shrink-0">
                  <WeaponArtwork weapon={wId} skin={null} weaponLevel={lv} className="w-14 h-10" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-black text-white truncate">
                      {w.defaultDisplay.replace(' Kayu', '')}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${
                        lv >= 5
                          ? 'bg-orange-500 text-black'
                          : 'bg-white/10 text-amber-300'
                      }`}
                    >
                      Lv.{lv}{lv >= 5 ? ' MAX' : ''}
                    </span>
                  </div>
                  <p className="text-[10px] text-zinc-400 mt-0.5">
                    {owned ? `DMG Dasar: ${dmgNow}` : 'Belum dibeli di Shop'}
                  </p>
                  <div className="mt-1.5 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-amber-500 to-orange-500"
                      style={{ width: `${(lv / 5) * 100}%` }}
                    />
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* RIGHT: Upgrade Forge Panel */}
        <div className="flex-1 rounded-2xl border border-white/15 bg-black/55 p-4 flex flex-col justify-between gap-3 min-w-0">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-2.5">
            <div>
              <h2 className="text-lg font-black uppercase text-white">
                {DEFAULT_WEAPONS[selectedWeapon].defaultDisplay.replace(' Kayu', '')} · Level {currentLv} / 5
              </h2>
              <p className="text-xs text-amber-300 font-bold">
                Tier Saat Ini: {currentTier.auraLabel} (DMG {currentTier.damage})
              </p>
            </div>
            <div className="w-32 text-right">
              <div className="text-[10px] font-bold text-zinc-400 mb-1">
                Progres Level {currentLv}/5
              </div>
              <div className="h-2.5 rounded-full bg-zinc-800 overflow-hidden border border-white/10">
                <div
                  className="h-full bg-gradient-to-r from-amber-400 via-orange-500 to-red-500 transition-all"
                  style={{ width: `${(currentLv / 5) * 100}%` }}
                />
              </div>
            </div>
          </div>

          {/* Preview & Stat Comparison */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-white/[0.04] border border-white/10 p-3 flex flex-col items-center justify-center gap-1.5">
              <span className="text-[10px] font-bold uppercase text-zinc-400">
                Level Sekarang (Lv.{currentLv})
              </span>
              <WeaponArtwork
                weapon={selectedWeapon}
                skin={null}
                weaponLevel={currentLv}
                className="w-32 h-18"
              />
              <span className="text-sm font-black text-white">DMG {currentTier.damage}</span>
              <span className="text-[10px] text-zinc-400">{currentTier.auraLabel}</span>
            </div>

            {nextTier ? (
              <div className="rounded-xl bg-amber-950/35 border border-amber-400/40 p-3 flex flex-col items-center justify-center gap-1.5">
                <span className="text-[10px] font-black uppercase text-amber-300">
                  Setelah Upgrade (Lv.{nextTier.level})
                </span>
                <WeaponArtwork
                  weapon={selectedWeapon}
                  skin={null}
                  weaponLevel={nextTier.level}
                  className="w-32 h-18"
                />
                <span className="text-sm font-black text-emerald-300">
                  DMG {nextTier.damage} (+{nextTier.damage - currentTier.damage})
                </span>
                <span className="text-[10px] text-amber-200">{nextTier.auraLabel}</span>
              </div>
            ) : (
              <div className="rounded-xl bg-emerald-950/35 border border-emerald-400/40 p-3 flex flex-col items-center justify-center gap-2 text-center">
                <Check size={30} className="text-emerald-300" />
                <span className="text-sm font-black text-emerald-300">LEVEL MAX TERCAPAI!</span>
                <span className="text-[11px] text-zinc-300">
                  Senjata ini sudah berada pada kekuatan penuh Lv 5.
                </span>
              </div>
            )}
          </div>

          {/* Required Materials + Coins */}
          {nextTier && (
            <div className="rounded-xl bg-black/60 border border-white/10 p-2.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-bold uppercase text-zinc-400 mr-1">Syarat:</span>
                {(Object.entries(nextTier.materials) as Array<[UpgradeMaterialId, number]>).map(
                  ([matId, needed]) => {
                    const mat = UPGRADE_MATERIALS[matId];
                    const have = Number(profile.upgradeMaterials?.[matId] || 0);
                    const ok = have >= needed;
                    return (
                      <div
                        key={matId}
                        className={`px-2 py-1 rounded-lg border flex items-center gap-1.5 text-[11px] font-bold ${
                          ok
                            ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-200'
                            : 'bg-rose-950/60 border-rose-500/50 text-rose-200'
                        }`}
                      >
                        <MaterialArtwork materialId={matId} className="w-5 h-5" />
                        <span>{mat.name}</span>
                        <span className="tabular-nums font-black">
                          {have}/{needed}
                        </span>
                      </div>
                    );
                  }
                )}
              </div>

              <div
                className={`px-2.5 py-1 rounded-lg border flex items-center gap-1.5 text-xs font-black shrink-0 ${
                  profile.coins >= nextTier.coinsCost
                    ? 'bg-amber-950/50 border-amber-400/40 text-amber-200'
                    : 'bg-rose-950/60 border-rose-500/50 text-rose-200'
                }`}
              >
                <Coins size={13} />
                <span className="tabular-nums">{nextTier.coinsCost.toLocaleString('id-ID')} Koin</span>
              </div>
            </div>
          )}

          {/* Action Button */}
          {!isOwned ? (
            <button
              type="button"
              onClick={onGoShop}
              className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
            >
              <ShoppingBag size={16} />
              <span>Beli {DEFAULT_WEAPONS[selectedWeapon].defaultDisplay} di Shop Dulu</span>
            </button>
          ) : !nextTier ? (
            <button
              type="button"
              disabled
              className="w-full py-2.5 rounded-xl bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 cursor-default"
            >
              <Check size={16} />
              <span>LEVEL MAX (LV 5)</span>
            </button>
          ) : canUpgrade ? (
            <button
              type="button"
              onClick={handleUpgrade}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 hover:brightness-110 text-black font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99] shadow-[0_6px_22px_rgba(245,158,11,0.45)]"
            >
              <ArrowUpCircle size={17} />
              <span>{busy ? 'MEMPROSES...' : `UPGRADE KE LV.${nextTier.level}`}</span>
            </button>
          ) : (
            <button
              type="button"
              disabled
              className="w-full py-2.5 rounded-xl bg-rose-600/80 border border-rose-400 text-white font-black text-xs uppercase tracking-wide flex items-center justify-center gap-2 cursor-not-allowed shadow-[0_0_18px_rgba(225,29,72,0.4)]"
            >
              <Lock size={14} />
              <span>BAHAN KURANG: {missingMaterials.join(' · ')}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
