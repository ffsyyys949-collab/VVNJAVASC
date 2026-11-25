import React, { useState } from 'react';
import { ArrowLeft, Gamepad2, Play, Search, X } from 'lucide-react';
import { DotGameLogo } from './DotGameLogo';
import { StickmanWarApp } from './stickman/StickmanWarApp';
import { StickmanModernLogo } from './stickman/StickmanModernLogo';

interface GameHubPageProps {
  onBack: () => void;
  initialGame?: string;
  currentUser?: any;
  diamondBalance?: number;
}

export function GameHubPage({
  onBack,
  initialGame,
  currentUser,
  diamondBalance = 0
}: GameHubPageProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeGame, setActiveGame] = useState<string | null>(
    initialGame === 'stickman-war' ? 'stickman-war' : null
  );

  if (activeGame === 'stickman-war') {
    return (
      <StickmanWarApp
        currentUser={currentUser}
        initialDiamondBalance={diamondBalance}
        onExit={() => setActiveGame(null)}
      />
    );
  }

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const matchesStickman =
    !normalizedQuery ||
    'stickman war'.includes(normalizedQuery) ||
    'stickman'.includes(normalizedQuery) ||
    'war'.includes(normalizedQuery) ||
    'duel'.includes(normalizedQuery) ||
    'boss'.includes(normalizedQuery) ||
    'pvp'.includes(normalizedQuery);

  return (
    <div className="fixed inset-0 z-[10010] bg-[#070b14] flex flex-col text-white select-none">
      {/* Header Game */}
      <header className="px-4 py-3.5 bg-[#0a0f1c] border-b border-white/10 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 flex items-center justify-center text-white transition active:scale-95 cursor-pointer shrink-0"
            title="Kembali"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <DotGameLogo size={28} glow={true} />
            <h1 className="text-base font-black tracking-wide text-white truncate">
              VN GAME
            </h1>
          </div>
        </div>
      </header>

      {/* Halaman Pencarian Game */}
      <div className="px-4 pt-4 pb-3 border-b border-white/5 bg-[#070b14] shrink-0">
        <div className="max-w-md mx-auto relative flex items-center">
          <Search
            size={16}
            className="absolute left-3.5 text-zinc-400 pointer-events-none"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari game..."
            className="w-full pl-10 pr-9 py-2.5 rounded-2xl bg-white/[0.06] border border-white/12 text-xs sm:text-sm text-white placeholder-zinc-400 outline-none focus:border-white/30 transition"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-zinc-300 cursor-pointer"
              title="Hapus pencarian"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Daftar Game */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-6">
        {matchesStickman ? (
          <div className="max-w-md mx-auto">
            <button
              type="button"
              onClick={() => setActiveGame('stickman-war')}
              className="w-full text-left rounded-3xl overflow-hidden border border-amber-400/35 bg-gradient-to-br from-[#160f0c] via-[#0c111d] to-[#080b12] shadow-[0_14px_40px_rgba(0,0,0,0.65)] hover:border-amber-300 transition active:scale-[0.99] cursor-pointer group"
            >
              {/* Banner Modern AAA STICKMAN WAR */}
              <div className="relative h-44 w-full overflow-hidden bg-[#060912] flex items-center justify-center border-b border-white/10">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_35%_55%,rgba(249,115,22,0.34),transparent_52%),radial-gradient(circle_at_72%_45%,rgba(56,189,248,0.32),transparent_55%),linear-gradient(180deg,#070b14_0%,#05070d_100%)]" />
                <div className="relative z-10 flex items-center justify-center gap-4 px-4">
                  <StickmanModernLogo size={132} />
                </div>

                <div className="absolute top-3 left-3 z-20 px-2.5 py-1 rounded-lg bg-amber-500/20 border border-amber-400/50 text-[10px] font-black uppercase tracking-wider text-amber-200">
                  Action 2D · Landscape
                </div>
              </div>

              {/* Info & Tombol Mainkan */}
              <div className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <StickmanModernLogo size={24} />
                    <h2 className="text-base font-black tracking-wide text-white uppercase truncate">
                      STICKMAN WAR
                    </h2>
                  </div>
                  <p className="text-xs text-zinc-300 mt-1 leading-snug">
                    1vs1 Online, Duel vs AI &amp; Petualangan Boss. Koleksi senjata, putar Gacha &amp; raih Skin Legendaris!
                  </p>
                </div>

                <div className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-400 text-black font-black text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-[0_6px_20px_rgba(249,115,22,0.45)] group-hover:brightness-110 shrink-0">
                  <Play size={14} fill="currentColor" />
                  <span>Main</span>
                </div>
              </div>
            </button>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-white/[0.05] border border-white/10 flex items-center justify-center text-zinc-400 mb-3">
              <Gamepad2 size={30} />
            </div>
            <p className="text-sm font-bold text-zinc-300">Game tidak ditemukan</p>
          </div>
        )}
      </main>
    </div>
  );
}

export default GameHubPage;
