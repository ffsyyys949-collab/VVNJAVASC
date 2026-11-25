import React, { useState } from 'react';
import { ArrowLeft, ArrowUpCircle, Check, Lock, Package, ShoppingBag } from 'lucide-react';
import {
  DEFAULT_WEAPONS,
  STICKMAN_SKINS,
  UPGRADE_MATERIAL_ORDER,
  UPGRADE_MATERIALS,
  WEAPON_UPGRADE_TIERS,
  type StickmanBuyableWeaponId,
  type StickmanProfile,
  type StickmanSkinId,
  type StickmanWeaponId
} from './stickmanTypes';
import { MaterialArtwork, WeaponArtwork } from './StickmanArt';

interface StickmanInventoryPageProps {
  profile: StickmanProfile;
  onBack: () => void;
  onGoShop: () => void;
  onGoUpgrade: () => void;
  onEquip: (weaponId: StickmanWeaponId, skinId: StickmanSkinId | null) => Promise<void>;
}

export const StickmanInventoryPage: React.FC<StickmanInventoryPageProps> = ({
  profile,
  onBack,
  onGoShop,
  onGoUpgrade,
  onEquip
}) => {
  const [tab, setTab] = useState<'weapons' | 'skins' | 'materials'>('weapons');
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const handleEquip = async (weaponId: StickmanWeaponId, skinId: StickmanSkinId | null, key: string) => {
    setBusyKey(key);
    try {
      await onEquip(weaponId, skinId);
    } finally {
      setBusyKey(null);
    }
  };

  const allWeaponChoices: Array<{
    id: StickmanWeaponId;
    title: string;
    owned: boolean;
    lv: number;
    dmg: number;
    desc: string;
  }> = [
    {
      id: 'bare_hands',
      title: 'Tangan Kosong',
      owned: true,
      lv: 1,
      dmg: 14,
      desc: 'Gaya bertarung tangan kosong default.'
    },
    ...(['sword', 'bow', 'pistol'] as StickmanBuyableWeaponId[]).map((wId) => {
      const lv = Math.max(1, Math.min(5, Number(profile.weaponLevels?.[wId] || 1)));
      const dmg = WEAPON_UPGRADE_TIERS[wId][lv - 1]?.damage ?? DEFAULT_WEAPONS[wId].damage;
      return {
        id: wId,
        title: DEFAULT_WEAPONS[wId].name,
        owned: profile.ownedWeapons.includes(wId),
        lv,
        dmg,
        desc: DEFAULT_WEAPONS[wId].description
      };
    })
  ];

  const totalMaterialsCount = UPGRADE_MATERIAL_ORDER.reduce(
    (sum, matId) => sum + Number(profile.upgradeMaterials?.[matId] || 0),
    0
  );

  return (
    <div className="w-full h-full flex flex-col bg-gradient-to-b from-[#0b101b] to-[#080a0f] text-white overflow-hidden">
      <header className="px-4 py-2.5 border-b border-white/10 bg-black/55 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 flex items-center justify-center cursor-pointer active:scale-95 transition shrink-0"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0">
            <h1 className="text-sm font-black tracking-wider uppercase text-white truncate">
              INVENTORY PERLENGKAPAN &amp; KOMPONEN
            </h1>
            <p className="text-[10px] text-zinc-400 truncate">
              Kelola Senjata, Skin HD, dan Komponen Upgrade Senjata
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 bg-black/50 p-1 rounded-xl border border-white/10 shrink-0">
          <button
            type="button"
            onClick={() => setTab('weapons')}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-black uppercase cursor-pointer ${
              tab === 'weapons' ? 'bg-white text-black' : 'text-zinc-300 hover:text-white'
            }`}
          >
            Senjata ({profile.ownedWeapons.length + 1})
          </button>
          <button
            type="button"
            onClick={() => setTab('skins')}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-black uppercase cursor-pointer ${
              tab === 'skins' ? 'bg-amber-400 text-black' : 'text-zinc-300 hover:text-white'
            }`}
          >
            Skin ({profile.ownedSkins.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('materials')}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-black uppercase cursor-pointer ${
              tab === 'materials' ? 'bg-sky-400 text-black' : 'text-zinc-300 hover:text-white'
            }`}
          >
            Komponen ({totalMaterialsCount})
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'weapons' && (
          <div className="max-w-5xl mx-auto grid grid-cols-4 gap-3">
            {allWeaponChoices.map((item) => {
              const isEquipped = profile.equippedWeapon === item.id && !profile.equippedSkin;
              return (
                <div
                  key={item.id}
                  className={`rounded-2xl border p-3 flex flex-col justify-between gap-2.5 ${
                    item.owned ? 'bg-white/[0.04] border-white/15' : 'bg-black/45 border-white/10 opacity-75'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-1 mb-2">
                      <p className="text-xs font-black text-white truncate">{item.title}</p>
                      {item.id !== 'bare_hands' && item.owned && (
                        <span className="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-400/40 text-[9px] font-black text-amber-300 shrink-0">
                          Lv.{item.lv}
                        </span>
                      )}
                    </div>
                    <div className="h-20 rounded-xl bg-black/50 border border-white/10 flex items-center justify-center p-2 mb-2">
                      <WeaponArtwork
                        weapon={item.id}
                        skin={null}
                        weaponLevel={item.lv}
                        className="w-24 h-16"
                      />
                    </div>
                    <p className="text-[10px] font-bold text-amber-300 mb-0.5">DMG {item.dmg}</p>
                    <p className="text-[10px] text-zinc-400 leading-snug">{item.desc}</p>
                  </div>

                  {item.owned ? (
                    <button
                      type="button"
                      onClick={() => handleEquip(item.id, null, `w_${item.id}`)}
                      disabled={isEquipped || busyKey === `w_${item.id}`}
                      className={`w-full py-2 rounded-xl text-[11px] font-black uppercase flex items-center justify-center gap-1 cursor-pointer ${
                        isEquipped
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/35 cursor-default'
                          : 'bg-white text-black hover:bg-zinc-200'
                      }`}
                    >
                      <Check size={13} />
                      <span>{isEquipped ? 'Dipakai' : 'Pakai'}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={onGoShop}
                      className="w-full py-2 rounded-xl text-[11px] font-black uppercase bg-amber-500/20 border border-amber-400/35 text-amber-200 hover:bg-amber-500/30 flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <ShoppingBag size={12} />
                      <span>Beli di Shop</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {tab === 'skins' && (
          <div className="max-w-5xl mx-auto">
            {profile.ownedSkins.length === 0 ? (
              <div className="h-52 flex flex-col items-center justify-center text-center gap-2 text-zinc-400">
                <Package size={32} />
                <p className="text-xs font-bold text-zinc-300">Belum ada Skin di Inventory</p>
                <p className="text-[11px]">Putar Roda Gacha untuk mendapatkan Skin Legendaris HD.</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {profile.ownedSkins.map((skinId) => {
                  const skin = STICKMAN_SKINS[skinId];
                  const hasBaseWeapon = profile.ownedWeapons.includes(skin.baseWeapon);
                  const isEquipped = profile.equippedSkin === skinId;

                  return (
                    <div
                      key={skinId}
                      className={`rounded-2xl border p-3 flex flex-col justify-between gap-2.5 ${
                        skin.rarity === 'LEGENDARY'
                          ? 'bg-amber-950/20 border-amber-400/40'
                          : 'bg-sky-950/20 border-sky-400/35'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="text-xs font-black text-white truncate">{skin.name}</span>
                          <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-500 text-black">
                            {skin.damageBadge}
                          </span>
                        </div>

                        <div className="h-20 rounded-xl bg-black/55 border border-white/10 flex items-center justify-center p-2 mb-2">
                          <WeaponArtwork weapon={skin.baseWeapon} skin={skinId} className="w-28 h-16" />
                        </div>

                        <p className="text-[10px] text-zinc-300 leading-snug">{skin.effectSummary}</p>
                      </div>

                      {hasBaseWeapon ? (
                        <button
                          type="button"
                          onClick={() => handleEquip(skin.baseWeapon, skinId, `s_${skinId}`)}
                          disabled={isEquipped || busyKey === `s_${skinId}`}
                          className={`w-full py-2 rounded-xl text-[11px] font-black uppercase flex items-center justify-center gap-1 cursor-pointer ${
                            isEquipped
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/35 cursor-default'
                              : 'bg-amber-400 text-black hover:bg-amber-300'
                          }`}
                        >
                          <Check size={13} />
                          <span>{isEquipped ? 'Skin Dipakai' : 'Pasang Skin'}</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={onGoShop}
                          className="w-full py-2 rounded-xl text-[10px] font-black uppercase bg-rose-950/60 border border-rose-500/40 text-rose-200 hover:bg-rose-950/80 flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <Lock size={12} />
                          <span>Terkunci · Beli {DEFAULT_WEAPONS[skin.baseWeapon].defaultDisplay}</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === 'materials' && (
          <div className="max-w-4xl mx-auto space-y-4">
            <div className="grid grid-cols-4 gap-3">
              {UPGRADE_MATERIAL_ORDER.map((matId) => {
                const mat = UPGRADE_MATERIALS[matId];
                const qty = Number(profile.upgradeMaterials?.[matId] || 0);
                return (
                  <div
                    key={matId}
                    className="rounded-2xl border border-white/15 bg-black/55 p-3.5 flex flex-col justify-between gap-2 text-center"
                  >
                    <div className="w-16 h-16 mx-auto rounded-xl bg-white/[0.04] border border-white/10 flex items-center justify-center">
                      <MaterialArtwork materialId={matId} className="w-12 h-12" />
                    </div>
                    <div>
                      <p className="text-sm font-black text-white">{mat.name}</p>
                      <p className="text-base font-black text-sky-300 tabular-nums">x{qty}</p>
                    </div>
                    <p className="text-[10px] text-zinc-400 leading-snug">{mat.desc}</p>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-center">
              <button
                type="button"
                onClick={onGoUpgrade}
                className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs uppercase tracking-wider flex items-center gap-2 cursor-pointer"
              >
                <ArrowUpCircle size={15} />
                <span>Buka Menu Upgrade Senjata (Lv 1 - Lv 5)</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
