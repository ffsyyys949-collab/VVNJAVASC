import React, { useEffect, useRef } from 'react';
import type {
  StickmanCharacterId,
  StickmanSkinId,
  StickmanWeaponId,
  UpgradeMaterialId
} from './stickmanTypes';

interface MaterialArtworkProps {
  materialId: UpgradeMaterialId;
  className?: string;
}

export const MaterialArtwork: React.FC<MaterialArtworkProps> = ({
  materialId,
  className = 'w-12 h-12'
}) => {
  if (materialId === 'batu_api') {
    return (
      <svg viewBox="0 0 64 64" className={className} fill="none">
        <defs>
          <radialGradient id="matFireGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fde047" stopOpacity="0.85" />
            <stop offset="55%" stopColor="#f97316" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#dc2626" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="matFireCore" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fef08a" />
            <stop offset="45%" stopColor="#f97316" />
            <stop offset="100%" stopColor="#7f1d1d" />
          </linearGradient>
        </defs>
        <circle cx="32" cy="34" r="26" fill="url(#matFireGlow)" />
        <polygon
          points="32,8 50,22 46,48 32,56 16,46 14,24"
          fill="url(#matFireCore)"
          stroke="#fde047"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path d="M24 26 L32 16 L40 28 L33 44 Z" fill="#fef08a" opacity="0.55" />
      </svg>
    );
  }

  if (materialId === 'kristal_es') {
    return (
      <svg viewBox="0 0 64 64" className={className} fill="none">
        <defs>
          <radialGradient id="matIceGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#e0f2fe" stopOpacity="0.8" />
            <stop offset="60%" stopColor="#38bdf8" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#0284c7" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="matIceCore" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f0f9ff" />
            <stop offset="50%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#075985" />
          </linearGradient>
        </defs>
        <circle cx="32" cy="32" r="25" fill="url(#matIceGlow)" />
        <polygon
          points="32,6 47,20 42,50 32,58 22,50 17,20"
          fill="url(#matIceCore)"
          stroke="#e0f2fe"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <polygon points="32,12 40,24 32,48 24,24" fill="#bae6fd" opacity="0.55" />
      </svg>
    );
  }

  if (materialId === 'besi') {
    return (
      <svg viewBox="0 0 64 64" className={className} fill="none">
        <defs>
          <linearGradient id="matIronGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f1f5f9" />
            <stop offset="48%" stopColor="#94a3b8" />
            <stop offset="100%" stopColor="#334155" />
          </linearGradient>
        </defs>
        <polygon
          points="14,34 26,18 50,24 38,44"
          fill="url(#matIronGrad)"
          stroke="#e2e8f0"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <polygon
          points="14,34 38,44 38,52 14,42"
          fill="#475569"
          stroke="#cbd5e1"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <polygon
          points="38,44 50,24 50,33 38,52"
          fill="#1e293b"
          stroke="#94a3b8"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  // emas
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none">
      <defs>
        <radialGradient id="matGoldGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fef08a" stopOpacity="0.85" />
          <stop offset="65%" stopColor="#f59e0b" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#b45309" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="matGoldBar" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fef9c3" />
          <stop offset="45%" stopColor="#facc15" />
          <stop offset="100%" stopColor="#b45309" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="34" r="26" fill="url(#matGoldGlow)" />
      <polygon
        points="12,35 25,18 52,24 39,43"
        fill="url(#matGoldBar)"
        stroke="#fef9c3"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <polygon
        points="12,35 39,43 39,51 12,43"
        fill="#d97706"
        stroke="#fde047"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <polygon
        points="39,43 52,24 52,33 39,51"
        fill="#92400e"
        stroke="#facc15"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
};

interface CharacterPortraitProps {
  characterId: StickmanCharacterId;
  className?: string;
}

export const CharacterPortraitSvg: React.FC<CharacterPortraitProps> = ({
  characterId,
  className = 'w-14 h-14'
}) => {
  if (characterId === 'the_van') {
    return (
      <svg viewBox="0 0 96 96" className={className} fill="none">
        <defs>
          <radialGradient id="vanPortGlow" cx="50%" cy="48%" r="50%">
            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.7" />
            <stop offset="60%" stopColor="#f97316" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#000" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="vanWingSvg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fef08a" />
            <stop offset="35%" stopColor="#ef4444" />
            <stop offset="100%" stopColor="#7f1d1d" />
          </linearGradient>
        </defs>
        <circle cx="48" cy="48" r="44" fill="url(#vanPortGlow)" />
        {/* Giant Crimson Fire Wings */}
        <path d="M42 52 C24 22, 8 18, 6 34 C16 40, 14 48, 8 54 C20 60, 26 64, 42 58 Z" fill="url(#vanWingSvg)" stroke="#fde047" strokeWidth="1.3" />
        <path d="M54 52 C72 22, 88 18, 90 34 C80 40, 82 48, 88 54 C76 60, 70 64, 54 58 Z" fill="url(#vanWingSvg)" stroke="#fde047" strokeWidth="1.3" />
        {/* Shoulders & Torso */}
        <path d="M36 62 L48 56 L60 62 L56 84 L40 84 Z" fill="#090a0f" stroke="#ef4444" strokeWidth="2" />
        {/* Head */}
        <circle cx="48" cy="39" r="16" fill="#07090f" stroke="#ef4444" strokeWidth="2.6" />
        {/* Blazing Red Eyes */}
        <ellipse cx="42" cy="39" rx="4.2" ry="2.2" fill="#ff2e2e" />
        <ellipse cx="54" cy="39" rx="4.2" ry="2.2" fill="#ff2e2e" />
        <circle cx="42" cy="39" r="1.4" fill="#fef08a" />
        <circle cx="54" cy="39" r="1.4" fill="#fef08a" />
      </svg>
    );
  }

  if (characterId === 'kira') {
    return (
      <svg viewBox="0 0 96 96" className={className} fill="none">
        <circle cx="48" cy="48" r="40" fill="rgba(168,85,247,0.18)" />
        {/* Flowing purple ninja scarf */}
        <path d="M38 56 C22 58, 14 70, 10 82 C22 76, 30 70, 42 64 Z" fill="#9333ea" stroke="#e9d5ff" strokeWidth="1.2" />
        <path d="M38 58 L58 58 L54 84 L42 84 Z" fill="#0f172a" stroke="#a855f7" strokeWidth="2" />
        <circle cx="48" cy="39" r="15" fill="#090d16" stroke="#c084fc" strokeWidth="2.4" />
        <ellipse cx="43" cy="39" rx="3.8" ry="1.8" fill="#e9d5ff" />
        <ellipse cx="53" cy="39" rx="3.8" ry="1.8" fill="#e9d5ff" />
      </svg>
    );
  }

  if (characterId === 'bruno') {
    return (
      <svg viewBox="0 0 96 96" className={className} fill="none">
        <circle cx="48" cy="48" r="40" fill="rgba(16,185,129,0.18)" />
        {/* Heavy Tank Pauldrons */}
        <path d="M22 60 C22 48, 34 48, 38 56 L58 56 C62 48, 74 48, 74 60 L66 84 L30 84 Z" fill="#0f172a" stroke="#34d399" strokeWidth="2.5" />
        <circle cx="48" cy="37" r="16" fill="#090d16" stroke="#10b981" strokeWidth="2.8" />
        <rect x="38" y="34" width="20" height="4.5" rx="2" fill="#6ee7b7" />
      </svg>
    );
  }

  if (characterId === 'frost') {
    return (
      <svg viewBox="0 0 96 96" className={className} fill="none">
        <circle cx="48" cy="48" r="40" fill="rgba(56,189,248,0.22)" />
        {/* Ice Crown */}
        <polygon points="35,27 38,12 45,22 48,8 51,22 58,12 61,27" fill="#7dd3fc" stroke="#e0f2fe" strokeWidth="1.4" />
        <path d="M36 58 L60 58 L56 84 L40 84 Z" fill="#0c1b2e" stroke="#38bdf8" strokeWidth="2" />
        <circle cx="48" cy="40" r="15" fill="#071220" stroke="#7dd3fc" strokeWidth="2.4" />
        <ellipse cx="43" cy="40" rx="3.8" ry="2" fill="#bae6fd" />
        <ellipse cx="53" cy="40" rx="3.8" ry="2" fill="#bae6fd" />
      </svg>
    );
  }

  // REX
  return (
    <svg viewBox="0 0 96 96" className={className} fill="none">
      <circle cx="48" cy="48" r="38" fill="rgba(245,158,11,0.14)" />
      {/* Crimson Warrior Headband */}
      <path d="M32 32 L14 26 L20 38 Z" fill="#ef4444" />
      <path d="M38 58 L58 58 L54 84 L42 84 Z" fill="#0f172a" stroke="#cbd5e1" strokeWidth="2" />
      <circle cx="48" cy="40" r="15" fill="#090d16" stroke="#f8fafc" strokeWidth="2.4" />
      <rect x="33" y="30" width="30" height="5" rx="2" fill="#dc2626" />
      <ellipse cx="43" cy="41" rx="3.6" ry="1.9" fill="#f8fafc" />
      <ellipse cx="53" cy="41" rx="3.6" ry="1.9" fill="#f8fafc" />
    </svg>
  );
};

interface WeaponGraphicProps {
  weapon: StickmanWeaponId;
  skin: StickmanSkinId | null;
  weaponLevel?: number;
  className?: string;
  animateEffects?: boolean;
}

/**
 * High-Definition Watermark-Free Weapon Artwork (with Lv 1..5 visual aura progression)
 */
export const WeaponArtwork: React.FC<WeaponGraphicProps> = ({
  weapon,
  skin,
  weaponLevel = 1,
  className = 'w-24 h-16',
  animateEffects = true
}) => {
  const lv = Math.max(1, Math.min(5, weaponLevel));
  const hasUpgradeGlow = lv >= 2;
  const lvStroke =
    lv >= 5 ? '#f97316' : lv === 4 ? '#facc15' : lv === 3 ? '#38bdf8' : lv === 2 ? '#cbd5e1' : undefined;

  if (skin === 'tembakan_naga_es') {
    return (
      <svg viewBox="0 0 220 116" className={className} fill="none">
        <defs>
          <linearGradient id="hdIceBody" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f0f9ff" />
            <stop offset="35%" stopColor="#38bdf8" />
            <stop offset="75%" stopColor="#0284c7" />
            <stop offset="100%" stopColor="#082f49" />
          </linearGradient>
          <linearGradient id="hdIceWing" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#e0f2fe" stopOpacity="0.95" />
            <stop offset="50%" stopColor="#38bdf8" stopOpacity="0.72" />
            <stop offset="100%" stopColor="#0369a1" stopOpacity="0.3" />
          </linearGradient>
          <radialGradient id="hdIceGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#bae6fd" stopOpacity="0.88" />
            <stop offset="55%" stopColor="#38bdf8" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#0284c7" stopOpacity="0" />
          </radialGradient>
        </defs>

        {animateEffects && (
          <g>
            <ellipse cx="184" cy="52" rx={lv >= 5 ? 34 : 26} ry={lv >= 5 ? 24 : 18} fill="url(#hdIceGlow)">
              <animate attributeName="cx" values="178;200;178" dur="1.9s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.85;0.25;0.85" dur="1.9s" repeatCount="indefinite" />
            </ellipse>
            <ellipse cx="118" cy="36" rx="18" ry="12" fill="url(#hdIceGlow)">
              <animate attributeName="cy" values="42;20;42" dur="2.3s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.7;0.15;0.7" dur="2.3s" repeatCount="indefinite" />
            </ellipse>
          </g>
        )}

        <path d="M12 66 L42 48 L62 56 L30 78 Z" fill="url(#hdIceBody)" stroke={lv >= 4 ? '#facc15' : '#bae6fd'} strokeWidth="1.3" />
        <path d="M24 54 L52 40 L68 50 L40 66 Z" fill="#0369a1" stroke="#e0f2fe" strokeWidth="1.1" />
        <path d="M58 50 C76 26, 98 10, 128 16 C116 26, 122 36, 102 48 Z" fill="url(#hdIceWing)" stroke="#e0f2fe" strokeWidth="1.5" />
        <path d="M62 49 L92 22 M76 48 L108 24 M90 48 L114 34" stroke="#0f172a" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M48 52 L152 42 L162 59 L54 68 Z" fill="url(#hdIceBody)" stroke={lv >= 4 ? '#fef08a' : '#e0f2fe'} strokeWidth="1.5" />
        <path d="M74 49 L83 39 L92 48 L101 38 L110 47 L119 37 L128 46" stroke="#e0f2fe" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M84 65 L74 96 L91 96 L100 64 Z" fill="#090d16" stroke="#38bdf8" strokeWidth="1.6" />
        <path d="M105 63 L111 78 L124 62" stroke="#7dd3fc" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M142 42 L164 22 L160 39 L194 42 L180 53 L196 58 L174 67 L148 62 Z" fill="#09111e" stroke="#7dd3fc" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M150 40 L132 16 L158 32 Z" fill="url(#hdIceBody)" stroke="#f0f9ff" strokeWidth="1.2" />
        <path d="M180 54 L184 60 L187 55" fill="#f0f9ff" />
        <circle cx="171" cy="46" r="3.4" fill="#38bdf8" />
        <circle cx="171" cy="46" r="1.4" fill="#ffffff" />
        <circle cx="194" cy="49" r="5" fill="url(#hdIceGlow)" />
        <circle cx="194" cy="49" r="2.6" fill="#e0f2fe" />
      </svg>
    );
  }

  if (skin === 'panah_api') {
    return (
      <svg viewBox="0 0 200 132" className={className} fill="none">
        <defs>
          <linearGradient id="hdBowCrimsonGold" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#b91c1c" />
            <stop offset="30%" stopColor="#ef4444" />
            <stop offset="50%" stopColor="#fde047" />
            <stop offset="70%" stopColor="#ef4444" />
            <stop offset="100%" stopColor="#991b1b" />
          </linearGradient>
          <linearGradient id="hdFireRibbon" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#b91c1c" stopOpacity="0.15" />
            <stop offset="35%" stopColor="#ef4444" stopOpacity="0.88" />
            <stop offset="72%" stopColor="#f97316" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#fef08a" />
          </linearGradient>
          <radialGradient id="hdBowGlow" cx="62%" cy="50%" r="48%">
            <stop offset="0%" stopColor="#fde047" stopOpacity="0.55" />
            <stop offset="55%" stopColor="#f97316" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="122" cy="66" r={lv >= 5 ? 62 : 54} fill="url(#hdBowGlow)" />
        <path d="M74 14 L54 66 L74 118" stroke="#fecaca" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M74 12 C110 22, 114 48, 98 66 C114 84, 110 110, 74 120" stroke="url(#hdBowCrimsonGold)" strokeWidth="6.5" strokeLinecap="round" />
        <path d="M93 52 L104 66 L93 80" stroke="#fde047" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M62 66 C94 40, 126 32, 166 56 C144 58, 152 66, 174 66 C150 74, 134 94, 90 78 Z" fill="url(#hdFireRibbon)">
          {animateEffects && (
            <animateTransform attributeName="transform" type="scale" values="1 1;1.04 0.94;1 1" dur="0.65s" repeatCount="indefinite" />
          )}
        </path>
        <path d="M84 66 C110 52, 134 48, 166 64 C144 74, 120 78, 84 66 Z" fill="#fef08a" opacity="0.72" />
        <line x1="42" y1="66" x2="174" y2="66" stroke="#fef08a" strokeWidth="3.6" strokeLinecap="round" />
        <polygon points="188,66 166,56 171,66 166,76" fill="#fde047" stroke="#dc2626" strokeWidth="1.2" />
        <path d="M44 66 L30 57 L40 66 L30 75 Z" fill="#f59e0b" />
      </svg>
    );
  }

  if (skin === 'pedang_api_sayap') {
    return (
      <svg viewBox="0 0 220 144" className={className} fill="none">
        <defs>
          <linearGradient id="hdSwordGold" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#fef9c3" />
            <stop offset="50%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#92400e" />
          </linearGradient>
          <linearGradient id="hdWingGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#09090b" />
            <stop offset="52%" stopColor="#991b1b" />
            <stop offset="86%" stopColor="#ef4444" />
            <stop offset="100%" stopColor="#fbbf24" />
          </linearGradient>
          <linearGradient id="hdOceanBlue" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#7dd3fc" />
            <stop offset="55%" stopColor="#0284c7" />
            <stop offset="100%" stopColor="#1e3a8a" />
          </linearGradient>
          <linearGradient id="hdBladeFlame" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#dc2626" stopOpacity="0.88" />
            <stop offset="55%" stopColor="#f97316" stopOpacity="0.82" />
            <stop offset="100%" stopColor="#fef08a" stopOpacity="0.92" />
          </linearGradient>
        </defs>
        <g>
          {animateEffects && (
            <animateTransform attributeName="transform" type="rotate" values="-2 110 92;3 110 92;-2 110 92" dur="1.5s" repeatCount="indefinite" />
          )}
          <path d="M102 90 C76 62, 48 40, 22 34 C38 50, 42 58, 26 60 C46 70, 48 76, 36 82 C62 88, 78 96, 100 96 Z" fill="url(#hdWingGrad)" stroke="#fbbf24" strokeWidth="1.2" />
          <path d="M118 90 C144 62, 172 40, 198 34 C182 50, 178 58, 194 60 C174 70, 172 76, 184 82 C158 88, 142 96, 120 96 Z" fill="url(#hdWingGrad)" stroke="#fbbf24" strokeWidth="1.2" />
        </g>
        <path d="M64 106 C74 86, 92 92, 100 78 C96 102, 82 116, 64 106 Z" fill="url(#hdOceanBlue)" opacity="0.94" />
        <path d="M156 106 C146 86, 128 92, 120 78 C124 102, 138 116, 156 106 Z" fill="url(#hdOceanBlue)" opacity="0.94" />
        <circle cx="72" cy="84" r="2.8" fill="#7dd3fc" />
        <circle cx="148" cy="84" r="2.8" fill="#7dd3fc" />
        <path d="M110 8 C128 32, 132 58, 120 84 L100 84 C88 58, 92 32, 110 8 Z" fill="url(#hdBladeFlame)">
          {animateEffects && (
            <animate attributeName="opacity" values="0.78;0.98;0.78" dur="0.7s" repeatCount="indefinite" />
          )}
        </path>
        <polygon points="110,10 118,28 116,90 104,90 102,28" fill="url(#hdSwordGold)" stroke="#fef9c3" strokeWidth="1.3" />
        <line x1="110" y1="16" x2="110" y2="87" stroke="#ffffff" strokeWidth="1.4" opacity="0.85" />
        <path d="M88 90 Q110 82 132 90 Q120 98 110 95 Q100 98 88 90 Z" fill="#d97706" stroke="#fde68a" strokeWidth="1.3" />
        <circle cx="110" cy="91" r="4.8" fill="#dc2626" stroke="#fef08a" strokeWidth="1.2" />
        <rect x="105" y="96" width="10" height="26" rx="2.5" fill="#7f1d1d" stroke="#f59e0b" strokeWidth="1.3" />
        <circle cx="110" cy="127" r="5.5" fill="#d97706" stroke="#dc2626" strokeWidth="1.5" />
      </svg>
    );
  }

  // DEFAULT WEAPONS WITH LEVEL 1..5 VISUAL PROGRESSION
  if (weapon === 'sword') {
    const bladeFill =
      lv >= 5 ? '#f97316' : lv === 4 ? '#facc15' : lv === 3 ? '#38bdf8' : lv === 2 ? '#94a3b8' : '#a16207';
    const edgeStroke = lvStroke || '#713f12';
    return (
      <svg viewBox="0 0 150 90" className={className} fill="none">
        {lv >= 5 && (
          <ellipse cx="75" cy="36" rx="26" ry="30" fill="rgba(249,115,22,0.28)" />
        )}
        <polygon points="75,8 82,22 80,58 70,58 68,22" fill={bladeFill} stroke={edgeStroke} strokeWidth={hasUpgradeGlow ? '2' : '1.5'} />
        <line x1="75" y1="14" x2="75" y2="56" stroke={lv >= 4 ? '#fef9c3' : '#e2e8f0'} strokeWidth="1.4" opacity="0.8" />
        <rect x="61" y="58" width="28" height="6" rx="2" fill={lv >= 4 ? '#d97706' : '#78350f'} stroke={edgeStroke} strokeWidth="1.2" />
        <rect x="71" y="64" width="8" height="17" rx="2" fill={lv >= 3 ? '#1e293b' : '#451a03'} />
      </svg>
    );
  }

  if (weapon === 'bow') {
    const bowStroke =
      lv >= 5 ? '#ef4444' : lv === 4 ? '#facc15' : lv === 3 ? '#34d399' : lv === 2 ? '#94a3b8' : '#854d0e';
    return (
      <svg viewBox="0 0 150 90" className={className} fill="none">
        {lv >= 5 && (
          <circle cx="88" cy="45" r="34" fill="rgba(249,115,22,0.22)" />
        )}
        <line x1="56" y1="12" x2="48" y2="45" stroke="#d6d3d1" strokeWidth="1.4" />
        <line x1="48" y1="45" x2="56" y2="78" stroke="#d6d3d1" strokeWidth="1.4" />
        <path d="M56 12 C84 24, 84 66, 56 78" stroke={bowStroke} strokeWidth="5.5" strokeLinecap="round" />
        <line x1="40" y1="45" x2="118" y2="45" stroke={lv >= 4 ? '#fde047' : '#a16207'} strokeWidth="2.8" />
        <polygon points="126,45 114,40 114,50" fill={lv >= 5 ? '#f97316' : lv >= 3 ? '#38bdf8' : '#78350f'} />
      </svg>
    );
  }

  if (weapon === 'pistol') {
    const barrelFill =
      lv >= 5 ? '#0284c7' : lv === 4 ? '#f59e0b' : lv === 3 ? '#38bdf8' : lv === 2 ? '#64748b' : '#92400e';
    return (
      <svg viewBox="0 0 150 90" className={className} fill="none">
        {lv >= 5 && (
          <ellipse cx="105" cy="36" rx="22" ry="15" fill="rgba(56,189,248,0.28)" />
        )}
        <rect x="44" y="29" width="70" height="15" rx="3" fill={barrelFill} stroke={lvStroke || '#451a03'} strokeWidth="1.6" />
        <rect x="98" y="32" width="18" height="9" rx="2" fill={lv >= 3 ? '#bae6fd' : '#78350f'} />
        <path d="M52 44 L45 68 L59 68 L66 44 Z" fill={lv >= 2 ? '#1e293b' : '#78350f'} stroke={lvStroke || '#451a03'} strokeWidth="1.4" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 120 80" className={className} fill="none">
      <circle cx="42" cy="40" r="14" fill="#27272a" stroke="#a1a1aa" strokeWidth="2" />
      <circle cx="78" cy="40" r="14" fill="#27272a" stroke="#a1a1aa" strokeWidth="2" />
      <path d="M35 38 H49 M71 38 H85" stroke="#e4e4e7" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
};

interface LobbyStickmanCanvasProps {
  yawDeg: number;
  weapon: StickmanWeaponId;
  skin: StickmanSkinId | null;
  character?: StickmanCharacterId;
  weaponLevel?: number;
  sadMode?: boolean;
  className?: string;
}

/**
 * High-DPI 360-rotatable Hero Stickman Canvas supporting all 5 Characters:
 * REX, KIRA, BRUNO, FROST, and THE VAN (Giant Fire Wings + Red Eyes + Fire Aura).
 */
export const LobbyStickmanCanvas: React.FC<LobbyStickmanCanvasProps> = ({
  yawDeg,
  weapon,
  skin,
  character = 'rex',
  weaponLevel = 1,
  sadMode = false,
  className
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef({ yawDeg, weapon, skin, character, weaponLevel, sadMode });
  stateRef.current = { yawDeg, weapon, skin, character, weaponLevel, sadMode };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    const particles: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      life: number;
      maxLife: number;
      size: number;
      colorCore: string;
      colorEdge: string;
      glow?: boolean;
    }> = [];

    const startTime = performance.now();

    const render = (now: number) => {
      const t = (now - startTime) / 1000;
      const { yawDeg: yaw, weapon: wpn, skin: skn, character: charId, weaponLevel: wLv, sadMode: isSad } =
        stateRef.current;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const cx = w / 2;
      const baseY = h * 0.87;

      const isVan = charId === 'the_van';
      const isKira = charId === 'kira';
      const isBruno = charId === 'bruno';
      const isFrost = charId === 'frost';

      // Ground Aura Glow Ring
      const auraA = isVan
        ? 'rgba(239, 68, 68, 0.65)'
        : isFrost || skn === 'tembakan_naga_es'
        ? 'rgba(56, 189, 248, 0.5)'
        : isKira
        ? 'rgba(168, 85, 247, 0.5)'
        : isBruno
        ? 'rgba(16, 185, 129, 0.48)'
        : skn === 'panah_api' || skn === 'pedang_api_sayap'
        ? 'rgba(249, 115, 22, 0.48)'
        : 'rgba(255, 255, 255, 0.2)';

      const grad = ctx.createRadialGradient(cx, baseY + 6, 12, cx, baseY + 6, isVan ? 165 : 135);
      grad.addColorStop(0, auraA);
      grad.addColorStop(0.55, isVan ? 'rgba(249,115,22,0.28)' : 'rgba(15, 23, 42, 0.25)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(cx, baseY + 6, isVan ? 165 : 135, 34, 0, 0, Math.PI * 2);
      ctx.fill();

      const rad = (yaw * Math.PI) / 180;
      const cosY = Math.cos(rad);
      const sinY = Math.sin(rad);
      const facing = cosY >= 0 ? 1 : -1;
      const depthScale = Math.max(0.32, Math.abs(cosY));
      const breath = isSad ? Math.sin(t * 2.2) * 3 : Math.sin(t * 2.8) * 5;
      const armSway = Math.sin(t * 2.8 + 0.8) * 4;
      const charScale = isBruno ? 1.12 : isVan ? 1.07 : isKira ? 0.96 : 1.0;

      // THE VAN HUGE FLAMING CRIMSON WINGS (Always present on THE VAN!)
      if (isVan && !isSad) {
        const flap = Math.sin(t * 4.8) * 24;
        const spread = 166 * Math.max(0.45, depthScale);
        const shoulderY = baseY - 194 * charScale + breath;

        [-1, 1].forEach((side) => {
          ctx.save();
          ctx.translate(cx + sinY * side * 14, shoulderY);
          ctx.shadowColor = '#ef4444';
          ctx.shadowBlur = 26;
          const wingGrad = ctx.createLinearGradient(0, 0, side * spread, -110);
          wingGrad.addColorStop(0, '#450a0a');
          wingGrad.addColorStop(0.35, '#b91c1c');
          wingGrad.addColorStop(0.75, '#ef4444');
          wingGrad.addColorStop(1, '#fde047');
          ctx.fillStyle = wingGrad;
          ctx.strokeStyle = '#fbbf24';
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.bezierCurveTo(
            side * spread * 0.45,
            -145 - flap,
            side * spread * 0.88,
            -118 - flap,
            side * spread,
            -70 - flap
          );
          ctx.lineTo(side * spread * 0.78, -22 - flap * 0.55);
          ctx.lineTo(side * spread * 0.94, 14 - flap * 0.35);
          ctx.lineTo(side * spread * 0.62, 42);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        });

        // Continuous Rising Crimson Fire Aura around THE VAN
        if (Math.random() < 0.95) {
          particles.push({
            x: cx + (Math.random() - 0.5) * 145,
            y: baseY - Math.random() * 230,
            vx: (Math.random() - 0.5) * 1.4,
            vy: -1.8 - Math.random() * 2.2,
            life: 0,
            maxLife: 34,
            size: 10 + Math.random() * 9,
            colorCore: Math.random() < 0.45 ? '#fde047' : '#ef4444',
            colorEdge: 'rgba(185,28,28,0)',
            glow: true
          });
        }
      } else if (skn === 'pedang_api_sayap' && !isSad) {
        const flap = Math.sin(t * 4.4) * 20;
        const spread = 132 * Math.max(0.45, depthScale);
        const shoulderY = baseY - 190 + breath;

        [-1, 1].forEach((side) => {
          ctx.save();
          ctx.translate(cx + sinY * side * 12, shoulderY);
          const wingGrad = ctx.createLinearGradient(0, 0, side * spread, -85);
          wingGrad.addColorStop(0, '#09090b');
          wingGrad.addColorStop(0.45, '#7f1d1d');
          wingGrad.addColorStop(0.82, '#dc2626');
          wingGrad.addColorStop(1, '#fbbf24');
          ctx.fillStyle = wingGrad;
          ctx.strokeStyle = '#fde047';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.bezierCurveTo(side * spread * 0.45, -118 - flap, side * spread * 0.85, -94 - flap, side * spread, -56 - flap);
          ctx.lineTo(side * spread * 0.78, -14 - flap * 0.5);
          ctx.lineTo(side * spread * 0.9, 14 - flap * 0.35);
          ctx.lineTo(side * spread * 0.56, 32);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        });
      }

      // FROST ambient ice aura
      if (isFrost && !isSad && Math.random() < 0.7) {
        particles.push({
          x: cx + (Math.random() - 0.5) * 115,
          y: baseY - 25 - Math.random() * 210,
          vx: (Math.random() - 0.5) * 0.8,
          vy: -0.9 - Math.random() * 1.1,
          life: 0,
          maxLife: 34,
          size: 7 + Math.random() * 6,
          colorCore: '#e0f2fe',
          colorEdge: 'rgba(56,189,248,0)',
          glow: true
        });
      }

      // Proportions
      const hipY = baseY - 108 * charScale + (isSad ? 22 : breath * 0.45);
      const shoulderY = baseY - 196 * charScale + (isSad ? 38 : breath);
      const headY = baseY - 240 * charScale + (isSad ? 46 : breath);
      const hipOffset = sinY * 20;
      const shoulderOffset = sinY * 26;

      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Legs
      const lKneeX = cx - 22 * charScale * depthScale - hipOffset * 0.35;
      const lFootX = cx - 34 * charScale * depthScale - hipOffset * 0.55;
      const rKneeX = cx + 22 * charScale * depthScale + hipOffset * 0.35;
      const rFootX = cx + 34 * charScale * depthScale + hipOffset * 0.55;

      const limbStroke = isVan ? '#180507' : isBruno ? '#0c1d18' : '#090d16';
      const trimStroke = isVan
        ? '#ef4444'
        : isKira
        ? '#a855f7'
        : isBruno
        ? '#10b981'
        : isFrost
        ? '#38bdf8'
        : '#334155';

      ctx.strokeStyle = limbStroke;
      ctx.lineWidth = isBruno ? 20 : 15;
      ctx.beginPath();
      ctx.moveTo(cx - hipOffset * 0.25, hipY);
      ctx.lineTo(lKneeX - 5 * facing, baseY - 52 * charScale);
      ctx.lineTo(lFootX, baseY);
      ctx.moveTo(cx + hipOffset * 0.25, hipY);
      ctx.lineTo(rKneeX + 6 * facing, baseY - 52 * charScale);
      ctx.lineTo(rFootX, baseY);
      ctx.stroke();

      ctx.strokeStyle = trimStroke;
      ctx.lineWidth = isBruno ? 7 : 5;
      ctx.beginPath();
      ctx.moveTo(cx - hipOffset * 0.25, hipY);
      ctx.lineTo(lKneeX - 5 * facing, baseY - 52 * charScale);
      ctx.lineTo(lFootX, baseY);
      ctx.moveTo(cx + hipOffset * 0.25, hipY);
      ctx.lineTo(rKneeX + 6 * facing, baseY - 52 * charScale);
      ctx.lineTo(rFootX, baseY);
      ctx.stroke();

      // KIRA flowing shadow scarf
      if (isKira && !isSad) {
        const scarfWave = Math.sin(t * 5) * 10;
        ctx.fillStyle = '#9333ea';
        ctx.strokeStyle = '#e9d5ff';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(cx, shoulderY + 4);
        ctx.quadraticCurveTo(cx - facing * 48 * depthScale, shoulderY + 26 + scarfWave, cx - facing * 82 * depthScale, shoulderY + 52 + scarfWave);
        ctx.lineTo(cx - facing * 64 * depthScale, shoulderY + 62 + scarfWave);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      // Torso
      ctx.strokeStyle = limbStroke;
      ctx.lineWidth = isBruno ? 28 : 20;
      ctx.beginPath();
      ctx.moveTo(cx, hipY);
      ctx.lineTo(cx + (isSad ? 9 * facing : 0), shoulderY);
      ctx.stroke();

      ctx.strokeStyle = trimStroke;
      ctx.lineWidth = isBruno ? 10 : 7;
      ctx.beginPath();
      ctx.moveTo(cx, hipY);
      ctx.lineTo(cx + (isSad ? 9 * facing : 0), shoulderY);
      ctx.stroke();

      // BRUNO Tank Pauldrons
      if (isBruno) {
        ctx.fillStyle = '#1e293b';
        ctx.strokeStyle = '#34d399';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.ellipse(cx - 26 * depthScale, shoulderY + 4, 18 * depthScale, 13, 0, 0, Math.PI * 2);
        ctx.ellipse(cx + 26 * depthScale, shoulderY + 4, 18 * depthScale, 13, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // Head + Character Headgear + Glowing Eyes
      const headX = cx + (isSad ? 14 * facing : 0);
      const rimColor = isVan
        ? '#ff2e2e'
        : isFrost || skn === 'tembakan_naga_es'
        ? '#38bdf8'
        : isKira
        ? '#c084fc'
        : isBruno
        ? '#10b981'
        : skn === 'panah_api' || skn === 'pedang_api_sayap'
        ? '#f97316'
        : '#cbd5e1';

      ctx.save();
      ctx.shadowColor = rimColor;
      ctx.shadowBlur = isVan ? 24 : skn || charId !== 'rex' ? 16 : 6;
      ctx.fillStyle = '#070a10';
      ctx.strokeStyle = rimColor;
      ctx.lineWidth = isVan ? 4 : 3.5;
      ctx.beginPath();
      ctx.arc(headX, headY, 31 * (isBruno ? 1.08 : 1), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      // REX crimson headband
      if (charId === 'rex') {
        ctx.fillStyle = '#dc2626';
        ctx.fillRect(headX - 31, headY - 15, 62, 8);
        ctx.beginPath();
        ctx.moveTo(headX - facing * 28, headY - 12);
        ctx.lineTo(headX - facing * 56, headY - 18 + Math.sin(t * 5) * 4);
        ctx.lineTo(headX - facing * 50, headY - 4 + Math.sin(t * 5) * 4);
        ctx.closePath();
        ctx.fill();
      }

      // FROST ice crystal crown
      if (isFrost) {
        ctx.fillStyle = '#7dd3fc';
        ctx.strokeStyle = '#e0f2fe';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(headX - 20, headY - 26);
        ctx.lineTo(headX - 14, headY - 52);
        ctx.lineTo(headX - 4, headY - 34);
        ctx.lineTo(headX + 2, headY - 58);
        ctx.lineTo(headX + 9, headY - 34);
        ctx.lineTo(headX + 18, headY - 50);
        ctx.lineTo(headX + 22, headY - 26);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      if (cosY > -0.65) {
        const eyeOffsetX = sinY * 14 + 8 * facing * depthScale;
        if (isSad) {
          ctx.fillStyle = '#60a5fa';
          ctx.fillRect(headX + eyeOffsetX - 5, headY + 2, 10, 3);
        } else if (isVan) {
          // BLAZING GLOWING RED EYES ON THE VAN
          ctx.save();
          ctx.shadowColor = '#ff0000';
          ctx.shadowBlur = 16;
          ctx.fillStyle = '#ff2a2a';
          ctx.beginPath();
          ctx.ellipse(headX + eyeOffsetX - 5 * depthScale, headY - 2, 6.2 * depthScale, 3.2, -0.22 * facing, 0, Math.PI * 2);
          ctx.ellipse(headX + eyeOffsetX + 7 * depthScale, headY - 2, 6.2 * depthScale, 3.2, -0.22 * facing, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#fef08a';
          ctx.beginPath();
          ctx.arc(headX + eyeOffsetX - 5 * depthScale, headY - 2, 1.5, 0, Math.PI * 2);
          ctx.arc(headX + eyeOffsetX + 7 * depthScale, headY - 2, 1.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        } else {
          ctx.fillStyle = isFrost
            ? '#e0f2fe'
            : isKira
            ? '#e9d5ff'
            : isBruno
            ? '#6ee7b7'
            : '#f8fafc';
          ctx.beginPath();
          ctx.ellipse(headX + eyeOffsetX, headY - 2, 7.2 * depthScale, 3.4, -0.18 * facing, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Arms + Weapon
      const handX = cx + 56 * charScale * facing * depthScale + shoulderOffset * 0.45;
      const handY = isSad ? shoulderY + 52 : shoulderY + 24 + armSway;
      const offHandX = cx - 38 * charScale * facing * depthScale - shoulderOffset * 0.45;
      const offHandY = isSad ? shoulderY + 54 : shoulderY + 30 - armSway * 0.5;

      ctx.strokeStyle = limbStroke;
      ctx.lineWidth = isBruno ? 16 : 13;
      ctx.beginPath();
      ctx.moveTo(cx, shoulderY + 4);
      ctx.lineTo(offHandX, offHandY);
      ctx.moveTo(cx, shoulderY + 4);
      ctx.lineTo(handX, handY);
      ctx.stroke();

      ctx.strokeStyle = trimStroke;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(cx, shoulderY + 4);
      ctx.lineTo(offHandX, offHandY);
      ctx.moveTo(cx, shoulderY + 4);
      ctx.lineTo(handX, handY);
      ctx.stroke();

      if (!isSad && wpn !== 'bare_hands') {
        ctx.save();
        ctx.translate(handX, handY);
        ctx.scale(facing * Math.max(0.55, depthScale), 1);

        if (wpn === 'sword') {
          if (skn === 'pedang_api_sayap') {
            ctx.rotate(-0.45);
            const waveGrad = ctx.createLinearGradient(-22, -10, 22, 12);
            waveGrad.addColorStop(0, '#7dd3fc');
            waveGrad.addColorStop(1, '#1d4ed8');
            ctx.strokeStyle = waveGrad;
            ctx.lineWidth = 5.5;
            ctx.beginPath();
            ctx.arc(0, 0, 22, Math.PI * 0.15, Math.PI * 1.45);
            ctx.stroke();

            const bGrad = ctx.createLinearGradient(0, 0, 0, -112);
            bGrad.addColorStop(0, '#b45309');
            bGrad.addColorStop(0.5, '#fbbf24');
            bGrad.addColorStop(1, '#fef9c3');
            ctx.save();
            ctx.shadowColor = '#f97316';
            ctx.shadowBlur = 18;
            ctx.fillStyle = bGrad;
            ctx.beginPath();
            ctx.moveTo(-7, -6);
            ctx.lineTo(-5.5, -92);
            ctx.lineTo(0, -116);
            ctx.lineTo(5.5, -92);
            ctx.lineTo(7, -6);
            ctx.closePath();
            ctx.fill();
            ctx.restore();

            ctx.fillStyle = '#d97706';
            ctx.fillRect(-16, -9, 32, 7);
            ctx.fillStyle = '#dc2626';
            ctx.beginPath();
            ctx.arc(0, -5.5, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#7f1d1d';
            ctx.fillRect(-4.5, -2, 9, 22);
          } else {
            ctx.rotate(-0.45);
            ctx.save();
            if (wLv >= 4) {
              ctx.shadowColor = wLv >= 5 ? '#f97316' : '#facc15';
              ctx.shadowBlur = wLv >= 5 ? 16 : 10;
            }
            ctx.fillStyle =
              skn === 'pedang_baja'
                ? '#93c5fd'
                : wLv >= 5
                ? '#f97316'
                : wLv === 4
                ? '#facc15'
                : wLv === 3
                ? '#38bdf8'
                : wLv === 2
                ? '#94a3b8'
                : '#a16207';
            ctx.fillRect(-5, -92, 10, 86);
            ctx.fillStyle = '#78350f';
            ctx.fillRect(-14, -8, 28, 7);
            ctx.restore();
          }
        } else if (wpn === 'bow') {
          if (skn === 'panah_api') {
            ctx.strokeStyle = '#fecaca';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(6, -46);
            ctx.lineTo(-6, 0);
            ctx.lineTo(6, 46);
            ctx.stroke();

            const bowGrad = ctx.createLinearGradient(0, -46, 0, 46);
            bowGrad.addColorStop(0, '#b91c1c');
            bowGrad.addColorStop(0.5, '#fbbf24');
            bowGrad.addColorStop(1, '#b91c1c');
            ctx.save();
            ctx.shadowColor = '#f97316';
            ctx.shadowBlur = 16;
            ctx.strokeStyle = bowGrad;
            ctx.lineWidth = 7;
            ctx.beginPath();
            ctx.moveTo(6, -46);
            ctx.quadraticCurveTo(38, 0, 6, 46);
            ctx.stroke();
            ctx.restore();
            ctx.strokeStyle = '#fef08a';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(-6, 0);
            ctx.lineTo(54, 0);
            ctx.stroke();
          } else {
            ctx.strokeStyle = '#d6d3d1';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(6, -42);
            ctx.lineTo(-4, 0);
            ctx.lineTo(6, 42);
            ctx.stroke();
            ctx.strokeStyle =
              skn === 'panah_rimba'
                ? '#10b981'
                : wLv >= 5
                ? '#ef4444'
                : wLv === 4
                ? '#facc15'
                : wLv === 3
                ? '#34d399'
                : wLv === 2
                ? '#94a3b8'
                : '#854d0e';
            ctx.lineWidth = 6.5;
            ctx.beginPath();
            ctx.moveTo(6, -42);
            ctx.quadraticCurveTo(34, 0, 6, 42);
            ctx.stroke();
            ctx.strokeStyle = '#a16207';
            ctx.lineWidth = 3.2;
            ctx.beginPath();
            ctx.moveTo(-4, 0);
            ctx.lineTo(42, 0);
            ctx.stroke();
          }
        } else if (wpn === 'pistol') {
          if (skn === 'tembakan_naga_es') {
            ctx.save();
            ctx.shadowColor = '#38bdf8';
            ctx.shadowBlur = 14;
            ctx.fillStyle = '#0284c7';
            ctx.fillRect(0, -9, 54, 16);
            ctx.fillStyle = '#7dd3fc';
            ctx.fillRect(6, -12, 38, 6);
            ctx.fillStyle = '#09111e';
            ctx.strokeStyle = '#7dd3fc';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(48, -14);
            ctx.lineTo(74, -6);
            ctx.lineTo(68, 8);
            ctx.lineTo(48, 9);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.restore();
          } else {
            ctx.fillStyle =
              skn === 'pistol_bayangan'
                ? '#312e81'
                : wLv >= 5
                ? '#0284c7'
                : wLv === 4
                ? '#f59e0b'
                : wLv === 3
                ? '#38bdf8'
                : wLv === 2
                ? '#64748b'
                : '#92400e';
            ctx.fillRect(0, -7, 40, 12);
            ctx.fillStyle = '#1e293b';
            ctx.fillRect(0, 5, 11, 17);
          }
        }

        ctx.restore();
      }

      // Draw luminous soft particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life += 1;
        if (p.life >= p.maxLife) {
          particles.splice(i, 1);
          continue;
        }
        const progress = p.life / p.maxLife;
        const alpha = 1 - progress;
        const r = Math.max(1, p.size * (1 - progress * 0.5));
        ctx.save();
        if (p.glow) ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = alpha;
        const pg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        pg.addColorStop(0, p.colorCore);
        pg.addColorStop(1, p.colorEdge);
        ctx.fillStyle = pg;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={520}
      height={440}
      className={
        className
          ? `${className} object-contain pointer-events-none select-none`
          : 'w-full h-full max-w-[420px] max-h-[360px] object-contain pointer-events-none select-none'
      }
    />
  );
};
