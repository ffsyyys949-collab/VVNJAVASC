import React from 'react';

interface DotGameLogoProps {
  size?: number | 'sm' | 'md' | 'lg';
  className?: string;
  glow?: boolean;
}

/**
 * Logo VN GAME: Panda Hitam Putih memegang Stik Game Hitam Putih.
 */
export function DotGameLogo({ size = 'md', className = '', glow = true }: DotGameLogoProps) {
  let width = 36;
  let height = 36;
  if (typeof size === 'number') {
    width = size;
    height = size;
  } else if (size === 'sm') {
    width = 24;
    height = 24;
  } else if (size === 'md') {
    width = 36;
    height = 36;
  } else if (size === 'lg') {
    width = 48;
    height = 48;
  }

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 ${className}`}
      aria-label="VN GAME Panda Logo"
    >
      <defs>
        {glow && (
          <filter id="pandaLogoShadow" x="-15%" y="-15%" width="130%" height="130%">
            <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="#ffffff" floodOpacity="0.22" />
          </filter>
        )}
      </defs>

      {/* Monokrom Dark Rounded Emblem */}
      <rect
        x="4"
        y="4"
        width="92"
        height="92"
        rx="24"
        fill="#0a0a0a"
        stroke="#3f3f46"
        strokeWidth="3"
      />
      <rect
        x="8"
        y="8"
        width="84"
        height="84"
        rx="20"
        fill="none"
        stroke="#ffffff"
        strokeWidth="1.2"
        strokeOpacity="0.22"
      />

      <g filter={glow ? 'url(#pandaLogoShadow)' : undefined}>
        {/* Telinga Panda (Hitam) */}
        <circle cx="29" cy="24" r="10.5" fill="#111111" stroke="#ffffff" strokeWidth="2.2" />
        <circle cx="71" cy="24" r="10.5" fill="#111111" stroke="#ffffff" strokeWidth="2.2" />

        {/* Badan Panda (Putih & Bahu Hitam) */}
        <path
          d="M 24 84 C 24 63 35 55 50 55 C 65 55 76 63 76 84 Z"
          fill="#ffffff"
          stroke="#111111"
          strokeWidth="2.5"
        />
        <path
          d="M 25 72 C 28 60 36 55 50 55 C 64 55 72 60 75 72 C 68 67 60 66 50 66 C 40 66 32 67 25 72 Z"
          fill="#111111"
        />

        {/* Kepala Panda (Putih Bulat) */}
        <ellipse cx="50" cy="40" rx="24" ry="20.5" fill="#ffffff" stroke="#111111" strokeWidth="2.5" />

        {/* Bercak Mata Panda (Hitam) */}
        <ellipse
          cx="39.5"
          cy="39.5"
          rx="7.5"
          ry="9.2"
          transform="rotate(-14 39.5 39.5)"
          fill="#111111"
        />
        <ellipse
          cx="60.5"
          cy="39.5"
          rx="7.5"
          ry="9.2"
          transform="rotate(14 60.5 39.5)"
          fill="#111111"
        />

        {/* Mata Fokus & Kilau Putih */}
        <circle cx="40.5" cy="39" r="2.6" fill="#ffffff" />
        <circle cx="59.5" cy="39" r="2.6" fill="#ffffff" />
        <circle cx="41.4" cy="38.1" r="1.0" fill="#111111" />
        <circle cx="58.6" cy="38.1" r="1.0" fill="#111111" />

        {/* Hidung & Senyum Panda */}
        <ellipse cx="50" cy="47.5" rx="4.2" ry="2.8" fill="#111111" />
        <path
          d="M 45.5 52 Q 50 55.5 54.5 52"
          stroke="#111111"
          strokeWidth="2.2"
          strokeLinecap="round"
          fill="none"
        />

        {/* Stik Game Hitam Putih di Depan Dada */}
        <g>
          {/* Body Controller (Putih dengan Outline Hitam Tebal) */}
          <path
            d="M 27 68 C 29 62 35 60 42 61 L 58 61 C 65 60 71 62 73 68 L 77 81 C 78 86 73 90 68 88 C 64 86 62 81 58 79 L 42 79 C 38 81 36 86 32 88 C 27 90 22 86 23 81 Z"
            fill="#141414"
            stroke="#ffffff"
            strokeWidth="2.6"
            strokeLinejoin="round"
          />
          {/* D-Pad Kiri (Putih) */}
          <rect x="33.5" y="66.5" width="3.5" height="9" rx="1" fill="#ffffff" />
          <rect x="30.75" y="69.25" width="9" height="3.5" rx="1" fill="#ffffff" />
          {/* Tombol Kanan Hitam Putih */}
          <circle cx="64.5" cy="67.5" r="2.1" fill="#ffffff" />
          <circle cx="68.5" cy="71" r="2.1" fill="#ffffff" />
          <circle cx="64.5" cy="74.5" r="2.1" fill="#ffffff" />
          <circle cx="60.5" cy="71" r="2.1" fill="#ffffff" />
          {/* Tombol Start/Select Tengah */}
          <rect x="45.5" y="69" width="3.6" height="2" rx="1" fill="#d4d4d8" />
          <rect x="50.9" y="69" width="3.6" height="2" rx="1" fill="#d4d4d8" />
        </g>

        {/* Tangan Panda Memegang Stik Game (Hitam + Cakar Putih) */}
        <ellipse cx="26" cy="75" rx="6.2" ry="5.5" fill="#111111" stroke="#ffffff" strokeWidth="2" />
        <ellipse cx="74" cy="75" rx="6.2" ry="5.5" fill="#111111" stroke="#ffffff" strokeWidth="2" />
      </g>
    </svg>
  );
}

export function DotGameLogoFull({ className = '' }: { className?: string }) {
  return (
    <div className={`inline-flex items-center gap-1.5 select-none font-sans font-black tracking-wider ${className}`}>
      <DotGameLogo size={24} glow={false} />
      <span className="text-white text-base tracking-tight font-extrabold uppercase">
        VN GAME
      </span>
    </div>
  );
}
export default DotGameLogo;
