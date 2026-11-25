import React, { useState } from 'react';
import { ArrowLeft, Coins, Gem, Check, Lock, ShoppingBag } from 'lucide-react';
import {
  COIN_EXCHANGE_PACKS,
  DEFAULT_WEAPONS,
  type StickmanBuyableWeaponId,
  type StickmanProfile
} from './stickmanTypes';
import { WeaponArtwork } from './StickmanArt';

interface StickmanShopPageProps {
  profile: StickmanProfile;
  diamondBalance: number;
  isOwner: boolean;
  initialTab?: 'weapons' | 'coins';
  onBack: () => void;
  onBuyWeapon: (weaponId: StickmanBuyableWeaponId) => Promise<{ success: boolean; message: string }>;
  onBuyCoins: (packId: string) => Promise<{ success: boolean; message: string }>;
  onEquipWeapon: (weaponId: StickmanBuyableWeaponId) => Promise<void>;
}

export const StickmanShopPage: React.FC<StickmanShopPageProps> = ({
  profile,
  diamondBalance,
  isOwner,
  initialTab = 'weapons',
  onBack,
  onBuyWeapon,
  onBuyCoins,
  onEquipWeapon
}) => {
  const [tab, setTab] = useState<'weapons' | 'coins'>(initialTab);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);

  const weaponOrder: StickmanBuyableWeaponId[] = ['sword', 'bow', 'pistol'];

  const handleBuyWeapon = async (weaponId: StickmanBuyableWeaponId) => {
    setBusyId(weaponId);
    setNotice(null);
    try {
      const res = await onBuyWeapon(weaponId);
      setNotice({ text: res.message, ok: res.success });
    } finally {
      setBusyId(null);
    }
  };

  const handleBuyCoins = async (packId: string) => {
    setBusyId(packId);
    setNotice(null);
    try {
      const res = await onBuyCoins(packId);
      setNotice({ text: res.message, ok: res.success });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-gradient-to-b from-[#080d17] via-[#0d121e] to-[#07090e] text-white overflow-hidden">
      {/* Top Bar */}
      <header className="px-3.5 py-2 border-b border-white/10 bg-black/60 flex flex-wrap items-center justify-between gap-2 shrink-0">
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
              TOKO SENJATA &amp; KOIN
            </h1>
            <p className="text-[10px] text-zinc-400 truncate">
              Senjata Default hanya dapat dibeli di Shop memakai Koin
            </p>
          </div>
        </div>

        {/* Mode Tabs */}
        <div className="flex items-center gap-1.5 bg-black/50 p-1 rounded-xl border border-white/10 shrink-0">
          <button
            type="button"
            onClick={() => setTab('weapons')}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wide transition cursor-pointer whitespace-nowrap ${
              tab === 'weapons'
                ? 'bg-amber-500 text-black shadow-md'
                : 'text-zinc-300 hover:text-white'
            }`}
          >
            Senjata Default
          </button>
          <button
            type="button"
            onClick={() => setTab('coins')}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wide transition cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              tab === 'coins'
                ? 'bg-sky-400 text-black shadow-md'
                : 'text-zinc-300 hover:text-white'
            }`}
          >
            <Gem size={12} />
            <span>Beli Koin pakai Diamond</span>
          </button>
        </div>

        {/* Currencies */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="px-2.5 py-1 rounded-lg bg-black/60 border border-amber-500/30 flex items-center gap-1.5">
            <Coins size={14} className="text-amber-400" />
            <span className="text-xs font-black tabular-nums text-amber-200">
              {profile.coins.toLocaleString('id-ID')}
            </span>
          </div>
          <div className="px-2.5 py-1 rounded-lg bg-black/60 border border-sky-400/30 flex items-center gap-1.5">
            <Gem size={14} className="text-sky-400" />
            <span className="text-xs font-black tabular-nums text-sky-200">
              {isOwner ? 'UNLIMITED' : diamondBalance.toLocaleString('id-ID')}
            </span>
          </div>
        </div>
      </header>

      {/* Notice Banner */}
      {notice && (
        <div
          className={`mx-4 mt-2.5 px-3.5 py-2 rounded-xl text-xs font-bold border flex items-center justify-between gap-2 shrink-0 ${
            notice.ok
              ? 'bg-emerald-950/70 border-emerald-500/40 text-emerald-200'
              : 'bg-rose-950/70 border-rose-500/40 text-rose-200'
          }`}
        >
          <span>{notice.text}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-[10px] opacity-70 hover:opacity-100 cursor-pointer"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'weapons' ? (
          <div className="max-w-5xl mx-auto space-y-3">
            <div className="flex items-center justify-between gap-2 text-xs text-zinc-300 bg-white/[0.03] border border-white/10 rounded-xl px-3.5 py-2">
              <div className="flex items-center gap-2">
                <ShoppingBag size={14} className="text-amber-400 shrink-0" />
                <span>
                  Semua senjata default berwujud <b>kayu</b> sebelum dipasangi Skin dari Gacha. Tidak dapat diperoleh dari Gacha atau hadiah.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setTab('coins')}
                className="px-2.5 py-1 rounded-lg bg-sky-500/20 border border-sky-400/40 text-sky-200 font-bold text-[11px] hover:bg-sky-500/30 cursor-pointer shrink-0 whitespace-nowrap"
              >
                + Beli Koin pakai Diamond
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              {weaponOrder.map((wId) => {
                const w = DEFAULT_WEAPONS[wId];
                const owned = profile.ownedWeapons.includes(wId);
                const equipped = profile.equippedWeapon === wId && !profile.equippedSkin;
                const canAfford = profile.coins >= w.priceCoins;
                const isBusy = busyId === wId;

                return (
                  <div
                    key={wId}
                    className={`rounded-2xl border p-3.5 flex flex-col justify-between gap-3 transition ${
                      owned
                        ? 'bg-emerald-950/20 border-emerald-500/35'
                        : 'bg-white/[0.04] border-white/12'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-xs font-black uppercase tracking-wide text-white truncate">
                          {w.name}
                        </span>
                        <span className="text-[10px] font-bold text-amber-300 shrink-0">
                          {owned ? `Lv.${profile.weaponLevels?.[wId] || 1}` : `${w.priceCoins} Koin`}
                        </span>
                      </div>

                      <div className="h-24 rounded-xl bg-black/50 border border-white/10 flex items-center justify-center p-2 mb-2.5">
                        <WeaponArtwork
                          weapon={wId}
                          skin={null}
                          weaponLevel={profile.weaponLevels?.[wId] || 1}
                          className="w-28 h-20"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-1.5 mb-2">
                        <div className="px-2 py-1 rounded-lg bg-black/55 border border-white/10 text-[10px] font-black text-zinc-200">
                          Default: DMG {w.damage}
                        </div>
                        <div className="px-2 py-1 rounded-lg bg-amber-950/50 border border-amber-400/35 text-[10px] font-black text-amber-300 truncate">
                          {w.skinDamageText}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 text-[10px] text-zinc-400">
                        <span>Jarak {w.range}</span>
                        <span>·</span>
                        <span>{w.speed}</span>
                      </div>
                    </div>

                    {owned ? (
                      <button
                        type="button"
                        onClick={() => onEquipWeapon(wId)}
                        disabled={equipped}
                        className={`w-full py-2 rounded-xl text-xs font-black uppercase tracking-wide flex items-center justify-center gap-1.5 transition cursor-pointer ${
                          equipped
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/35 cursor-default'
                            : 'bg-white text-black hover:bg-zinc-200 active:scale-95'
                        }`}
                      >
                        <Check size={14} />
                        <span>{equipped ? 'Sedang Dipakai' : 'Pakai Senjata'}</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleBuyWeapon(wId)}
                        disabled={!canAfford || isBusy}
                        className={`w-full py-2 rounded-xl text-xs font-black uppercase tracking-wide flex items-center justify-center gap-1.5 transition ${
                          canAfford
                            ? 'bg-amber-500 hover:bg-amber-400 text-black cursor-pointer active:scale-95 shadow-lg'
                            : 'bg-white/10 text-zinc-400 border border-white/10 cursor-not-allowed'
                        }`}
                      >
                        {!canAfford && <Lock size={13} />}
                        <Coins size={13} />
                        <span>
                          {isBusy
                            ? 'Membeli...'
                            : canAfford
                            ? `Beli · ${w.priceCoins} Koin`
                            : `Kurang ${w.priceCoins - profile.coins} Koin`}
                        </span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="max-w-5xl mx-auto space-y-3">
            <div className="flex items-center justify-between gap-2 text-xs text-sky-100 bg-sky-950/35 border border-sky-400/30 rounded-xl px-3.5 py-2.5">
              <div className="flex items-center gap-2">
                <Gem size={14} className="text-sky-300 shrink-0" />
                <span>
                  Tukarkan <b>Diamond+</b> akun VNJAVA Anda menjadi <b>Koin STICKMAN WAR</b> untuk membeli senjata default atau memutar Gacha.
                </span>
              </div>
              <span className="text-[11px] font-black text-sky-300 shrink-0">
                Saldo: {isOwner ? 'UNLIMITED' : `${diamondBalance.toLocaleString('id-ID')}+`}
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {COIN_EXCHANGE_PACKS.map((pack) => {
                const canAfford = isOwner || diamondBalance >= pack.diamondCost;
                const isBusy = busyId === pack.id;
                return (
                  <div
                    key={pack.id}
                    className="rounded-2xl border border-sky-400/25 bg-black/50 p-3.5 flex flex-col justify-between gap-3"
                  >
                    <div className="text-center space-y-1.5">
                      <div className="w-12 h-12 rounded-xl bg-amber-500/15 border border-amber-400/30 mx-auto flex items-center justify-center">
                        <Coins size={24} className="text-amber-400" />
                      </div>
                      <h3 className="text-sm font-black text-amber-200">{pack.label}</h3>
                      <p className="text-[11px] text-zinc-400">
                        Harga:{' '}
                        <span className="text-sky-300 font-bold">
                          {pack.diamondCost.toLocaleString('id-ID')} Diamond+
                        </span>
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleBuyCoins(pack.id)}
                      disabled={!canAfford || isBusy}
                      className={`w-full py-2 rounded-xl text-xs font-black uppercase tracking-wide flex items-center justify-center gap-1.5 transition ${
                        canAfford
                          ? 'bg-sky-400 hover:bg-sky-300 text-black cursor-pointer active:scale-95'
                          : 'bg-white/10 text-zinc-400 border border-white/10 cursor-not-allowed'
                      }`}
                    >
                      <Gem size={13} />
                      <span>{isBusy ? 'Memproses...' : 'Beli Koin'}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
