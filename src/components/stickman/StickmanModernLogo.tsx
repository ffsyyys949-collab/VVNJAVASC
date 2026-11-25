import React from 'react';

interface StickmanModernLogoProps {
  size?: number;
  showTitle?: boolean;
  subtitle?: string;
  pulsing?: boolean;
  className?: string;
}

/**
 * Modern AAA STICKMAN WAR Emblem
 * Transparent PNG asset featuring fire red-orange + electric blue aura gradients,
 * glowing red eyes, katana warrior silhouette & premium glow without changing name STICKMAN WAR.
 */
export const StickmanModernLogo: React.FC<StickmanModernLogoProps> = ({
  size = 44,
  showTitle = false,
  subtitle,
  pulsing = false,
  className = ''
}) => {
  return (
    <div className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      <div
        className={`relative shrink-0 flex items-center justify-center ${
          pulsing ? 'animate-pulse' : ''
        }`}
        style={{ width: size, height: size }}
      >
        <div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            background:
              'radial-gradient(circle, rgba(249,115,22,0.42) 0%, rgba(56,189,248,0.28) 52%, transparent 74%)',
            filter: 'blur(6px)'
          }}
        />
        <img
          src="/assets/stickman_logo_modern.png"
          alt="STICKMAN WAR Logo"
          draggable={false}
          className="relative z-10 w-full h-full object-contain drop-shadow-[0_0_12px_rgba(249,115,22,0.65)]"
        />
      </div>

      {showTitle && (
        <div className="flex flex-col leading-none">
          <span
            className="font-black tracking-[0.18em] uppercase text-transparent bg-clip-text bg-gradient-to-r from-orange-400 via-amber-200 to-sky-400 drop-shadow-[0_2px_10px_rgba(249,115,22,0.45)]"
            style={{
              fontFamily: "'Orbitron', 'Chakra Petch', sans-serif",
              fontSize: Math.max(13, Math.round(size * 0.34))
            }}
          >
            STICKMAN WAR
          </span>
          {subtitle && (
            <span className="text-[10px] font-bold tracking-widest uppercase text-sky-300/85 mt-1">
              {subtitle}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default StickmanModernLogo;
