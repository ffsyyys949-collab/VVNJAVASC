import { stickmanAudio, type StickmanAudioSettings } from './stickmanAudio';

export type StickmanWeaponId = 'bare_hands' | 'sword' | 'bow' | 'pistol';
export type StickmanBuyableWeaponId = 'sword' | 'bow' | 'pistol';
export type StickmanCharacterId = 'rex' | 'kira' | 'bruno' | 'frost' | 'the_van';
export type UpgradeMaterialId = 'batu_api' | 'kristal_es' | 'besi' | 'emas';

export type StickmanSkinId =
  | 'panah_api'
  | 'tembakan_naga_es'
  | 'pedang_api_sayap'
  | 'pedang_baja'
  | 'panah_rimba'
  | 'pistol_bayangan';

export type StickmanMatchMode = '1v1_online' | 'duel_ai' | 'boss';
export type AiDifficulty = 'easy' | 'normal' | 'hard';

export interface StickmanMailItem {
  id: string;
  title: string;
  body: string;
  createdAt: number;
  read: boolean;
}

export interface StickmanProfile {
  userId: string;
  coins: number;
  level: number;
  xp: number;
  ownedWeapons: StickmanBuyableWeaponId[];
  ownedSkins: StickmanSkinId[];
  ownedCharacters: StickmanCharacterId[];
  equippedCharacter: StickmanCharacterId;
  upgradeMaterials: Record<UpgradeMaterialId, number>;
  weaponLevels: Record<StickmanBuyableWeaponId, number>;
  ampasItems: Record<string, number>;
  equippedWeapon: StickmanWeaponId;
  equippedSkin: StickmanSkinId | null;
  gachaPity: number; // 0..15; at 15, spin ke-16 PASTI dapat THE VAN
  wins: number;
  losses: number;
  bossClears: number;
  mail: StickmanMailItem[];
  updatedAt: number;
}

export interface StickmanRoomData {
  roomId: string;
  mode: '1v1_online' | 'boss';
  status: 'waiting' | 'playing' | 'finished';
  hostId: string;
  hostName: string;
  hostLevel: number;
  hostCharacter?: StickmanCharacterId;
  hostWeapon: StickmanWeaponId;
  hostSkin: StickmanSkinId | null;
  guestId?: string;
  guestName?: string;
  guestLevel?: number;
  guestCharacter?: StickmanCharacterId;
  guestWeapon?: StickmanWeaponId;
  guestSkin?: StickmanSkinId | null;
  isRandomMatch?: boolean;
  createdAt: number;
  updatedAt: number;
}

// =========================================================================
// 5 KARAKTER STICKMAN WAR (Exact specs, names & stats)
// =========================================================================
export interface CharacterDef {
  id: StickmanCharacterId;
  name: string;
  role: string;
  hp: number;
  moveSpeed: number;
  scale: number;
  priceCoins: number | null; // null = HANYA DARI GACHA
  gachaOnly: boolean;
  accentColor: string;
  auraColor: string;
  skill1: {
    name: string;
    desc: string;
    cooldownSec: number;
  };
  skill2: {
    name: string;
    desc: string;
    cooldownSec: number;
  };
  summary: string;
}

export const CHARACTER_ORDER: StickmanCharacterId[] = ['rex', 'kira', 'bruno', 'frost', 'the_van'];

export const CHARACTER_DEFS: Record<StickmanCharacterId, CharacterDef> = {
  rex: {
    id: 'rex',
    name: 'REX',
    role: 'PETARUNG SEIMBANG',
    hp: 100,
    moveSpeed: 6.4,
    scale: 1.0,
    priceCoins: 0,
    gachaOnly: false,
    accentColor: '#e2e8f0',
    auraColor: '#f59e0b',
    skill1: {
      name: 'Pukulan Cepat',
      desc: 'Terjang cepat 4 pukulan beruntun ke musuh di depan (Total 60 DMG).',
      cooldownSec: 6
    },
    skill2: {
      name: 'Perisai Kayu',
      desc: 'Munculkan perisai kayu berputar 3.5 detik, tahan 65% damage.',
      cooldownSec: 8
    },
    summary: 'GRATIS untuk semua pemain. Lincah, seimbang, siap bertarung.'
  },
  kira: {
    id: 'kira',
    name: 'KIRA',
    role: 'ASSASSIN CEPAT',
    hp: 90,
    moveSpeed: 8.6,
    scale: 0.96,
    priceCoins: 5000,
    gachaOnly: false,
    accentColor: '#a855f7',
    auraColor: '#c084fc',
    skill1: {
      name: 'Dash Bayangan',
      desc: 'Menghilang sekejap dan tebas musuh dengan bayangan ungu (75 DMG).',
      cooldownSec: 7
    },
    skill2: {
      name: 'Panah Hujan',
      desc: 'Hujankan 7 panah bayangan dari langit tepat ke area musuh.',
      cooldownSec: 10
    },
    summary: 'Lari paling cepat dengan serangan bayangan mematikan.'
  },
  bruno: {
    id: 'bruno',
    name: 'BRUNO',
    role: 'TANK BAJA',
    hp: 160,
    moveSpeed: 5.4,
    scale: 1.15,
    priceCoins: 8000,
    gachaOnly: false,
    accentColor: '#10b981',
    auraColor: '#34d399',
    skill1: {
      name: 'Hentakan Tanah',
      desc: 'Hantam tanah memicu gelombang kejut seismik (95 AoE DMG + terlempar).',
      cooldownSec: 9
    },
    skill2: {
      name: 'Tameng Besi',
      desc: 'Benteng baja 4 detik, reduksi 80% damage + pantul serangan jarak dekat.',
      cooldownSec: 11
    },
    summary: 'HP tebal 160 dan pertahanan tank yang sangat sulit ditembus.'
  },
  frost: {
    id: 'frost',
    name: 'FROST',
    role: 'PENYIHIR ES',
    hp: 110,
    moveSpeed: 6.5,
    scale: 1.0,
    priceCoins: 12000,
    gachaOnly: false,
    accentColor: '#38bdf8',
    auraColor: '#7dd3fc',
    skill1: {
      name: 'Tembak Es',
      desc: 'Luncurkan 3 tombak es menembus musuh (3x28 DMG + efek lambat).',
      cooldownSec: 6
    },
    skill2: {
      name: 'Badai Es',
      desc: 'Panggil badai kristal es selama 3 detik membekukan area musuh.',
      cooldownSec: 12
    },
    summary: 'Pengendali es dingin dengan kontrol area dan efek beku mematikan.'
  },
  the_van: {
    id: 'the_van',
    name: 'THE VAN',
    role: 'MYTHIC · PALING OP',
    hp: 150,
    moveSpeed: 7.4,
    scale: 1.08,
    priceCoins: null,
    gachaOnly: true,
    accentColor: '#ef4444',
    auraColor: '#f97316',
    skill1: {
      name: 'SHADOW VANISH',
      desc: 'Menghilang & teleport bolak-balik 6x tebasan api merah (6x30 = 180 DMG). Kebal saat aktif!',
      cooldownSec: 15
    },
    skill2: {
      name: 'DRAGON VAN',
      desc: 'Berubah jadi NAGA API besar 4 detik, terbang & semburkan api (200 DMG + bakar 10/detik selama 5 dtk).',
      cooldownSec: 10
    },
    summary: 'HANYA DARI GACHA. Sayap Api Merah Besar, Mata Merah Menyala, Aura Api Terkuat!'
  }
};

// =========================================================================
// WEAPONS (Default vs Skin Damages + Upgrade Lv 1..5)
// =========================================================================
export interface WeaponDef {
  id: StickmanBuyableWeaponId;
  name: string;
  defaultDisplay: string;
  priceCoins: number;
  damage: number;
  skinDamageText: string;
  range: string;
  speed: string;
  description: string;
}

export const DEFAULT_WEAPONS: Record<StickmanBuyableWeaponId, WeaponDef> = {
  sword: {
    id: 'sword',
    name: 'Pedang Kayu (Default)',
    defaultDisplay: 'Pedang Kayu',
    priceCoins: 150,
    damage: 25,
    skinDamageText: 'Skin: 45 + Bakar',
    range: 'Dekat',
    speed: 'Cepat',
    description: 'Damage Default 25 (Skin 45 + bakar). Bisa di-upgrade hingga Lv 5 MAX.'
  },
  bow: {
    id: 'bow',
    name: 'Panah Kayu (Default)',
    defaultDisplay: 'Panah Kayu',
    priceCoins: 200,
    damage: 20,
    skinDamageText: 'Skin: 38 + Ledak',
    range: 'Jauh',
    speed: 'Sedang',
    description: 'Damage Default 20 (Skin 38 + ledak). Bisa di-upgrade hingga Lv 5 MAX.'
  },
  pistol: {
    id: 'pistol',
    name: 'Pistol Kayu (Default)',
    defaultDisplay: 'Pistol Kayu',
    priceCoins: 250,
    damage: 18,
    skinDamageText: 'Skin: 32 + Lambat',
    range: 'Menengah-Jauh',
    speed: 'Sangat Cepat',
    description: 'Damage Default 18 (Skin 32 + lambat). Bisa di-upgrade hingga Lv 5 MAX.'
  }
};

export interface SkinDef {
  id: StickmanSkinId;
  name: string;
  rarity: 'LEGENDARY' | 'RARE';
  baseWeapon: StickmanBuyableWeaponId;
  damageValue: number;
  damageBadge: string;
  effectSummary: string;
  accentColor: string;
  badgeColor: string;
}

export const STICKMAN_SKINS: Record<StickmanSkinId, SkinDef> = {
  pedang_api_sayap: {
    id: 'pedang_api_sayap',
    name: 'Pedang Api Sayap',
    rarity: 'LEGENDARY',
    baseWeapon: 'sword',
    damageValue: 45,
    damageBadge: 'DMG 45 + Bakar',
    effectSummary: 'Pedang emas gagang merah, sayap merah-hitam mengepak halus, bilah api jernih + ombak air biru (45 + Bakar).',
    accentColor: '#f59e0b',
    badgeColor: '#d97706'
  },
  panah_api: {
    id: 'panah_api',
    name: 'Panah Api',
    rarity: 'LEGENDARY',
    baseWeapon: 'bow',
    damageValue: 38,
    damageBadge: 'DMG 38 + Ledak',
    effectSummary: 'Busur merah-emas membara, trail api mulus merah-kuning + ledakan api saat kena (38 + Ledak).',
    accentColor: '#fb923c',
    badgeColor: '#ea580c'
  },
  tembakan_naga_es: {
    id: 'tembakan_naga_es',
    name: 'Tembakan Naga Es',
    rarity: 'LEGENDARY',
    baseWeapon: 'pistol',
    damageValue: 32,
    damageBadge: 'DMG 32 + Lambat',
    effectSummary: 'Asap es biru jernih terus keluar, tembakan semburan naga es + efek lambat ke musuh (32 + Lambat).',
    accentColor: '#38bdf8',
    badgeColor: '#0284c7'
  },
  pedang_baja: {
    id: 'pedang_baja',
    name: 'Pedang Baja',
    rarity: 'RARE',
    baseWeapon: 'sword',
    damageValue: 35,
    damageBadge: 'DMG 35',
    effectSummary: 'Kilau bilah baja biru dengan tebasan kilat metalik.',
    accentColor: '#60a5fa',
    badgeColor: '#2563eb'
  },
  panah_rimba: {
    id: 'panah_rimba',
    name: 'Panah Rimba',
    rarity: 'RARE',
    baseWeapon: 'bow',
    damageValue: 28,
    damageBadge: 'DMG 28',
    effectSummary: 'Busur zamrud dengan jejak angin hijau mulus saat melesat.',
    accentColor: '#34d399',
    badgeColor: '#059669'
  },
  pistol_bayangan: {
    id: 'pistol_bayangan',
    name: 'Pistol Bayangan',
    rarity: 'RARE',
    baseWeapon: 'pistol',
    damageValue: 25,
    damageBadge: 'DMG 25',
    effectSummary: 'Pistol gelap bermuzzle ungu dengan peluru bayangan cepat.',
    accentColor: '#a78bfa',
    badgeColor: '#7c3aed'
  }
};

export const LEGENDARY_SKIN_ORDER: StickmanSkinId[] = [
  'tembakan_naga_es',
  'panah_api',
  'pedang_api_sayap'
];

// =========================================================================
// KOMPONEN UPGRADE & SENJATA LEVEL 1..5
// =========================================================================
export interface UpgradeMaterialDef {
  id: UpgradeMaterialId;
  name: string;
  color: string;
  desc: string;
}

export const UPGRADE_MATERIALS: Record<UpgradeMaterialId, UpgradeMaterialDef> = {
  batu_api: {
    id: 'batu_api',
    name: 'Batu Api',
    color: '#f97316',
    desc: 'Batu magma inti panas untuk menempa senjata tingkat tinggi.'
  },
  kristal_es: {
    id: 'kristal_es',
    name: 'Kristal Es',
    color: '#38bdf8',
    desc: 'Kristal beku murni untuk memperkuat laras dan efek dingin.'
  },
  besi: {
    id: 'besi',
    name: 'Besi',
    color: '#94a3b8',
    desc: 'Logam besi tempa kokoh untuk upgrade dasar semua senjata.'
  },
  emas: {
    id: 'emas',
    name: 'Emas',
    color: '#facc15',
    desc: 'Batangan emas langka untuk upgrade Level 4 ke 5 MAX.'
  }
};

export const UPGRADE_MATERIAL_ORDER: UpgradeMaterialId[] = [
  'batu_api',
  'kristal_es',
  'besi',
  'emas'
];

export interface WeaponUpgradeStep {
  level: number;
  damage: number;
  auraLabel: string;
  coinsCost: number;
  materials: Partial<Record<UpgradeMaterialId, number>>;
}

export const WEAPON_UPGRADE_TIERS: Record<StickmanBuyableWeaponId, WeaponUpgradeStep[]> = {
  sword: [
    { level: 1, damage: 25, auraLabel: 'Kayu Dasar', coinsCost: 0, materials: {} },
    { level: 2, damage: 35, auraLabel: 'Bilah Besi Terasah', coinsCost: 500, materials: { besi: 3 } },
    { level: 3, damage: 48, auraLabel: 'Bilah Baja Biru', coinsCost: 900, materials: { besi: 4, batu_api: 2 } },
    { level: 4, damage: 65, auraLabel: 'Pedang Emas Berbara', coinsCost: 1400, materials: { emas: 1, batu_api: 2 } },
    { level: 5, damage: 85, auraLabel: 'MAX · Aura Api Abadi', coinsCost: 2000, materials: { emas: 2, batu_api: 3 } }
  ],
  bow: [
    { level: 1, damage: 20, auraLabel: 'Busur Kayu Dasar', coinsCost: 0, materials: {} },
    { level: 2, damage: 28, auraLabel: 'Busur Rangka Besi', coinsCost: 500, materials: { besi: 3 } },
    { level: 3, damage: 38, auraLabel: 'Busur Badai Hijau', coinsCost: 900, materials: { besi: 3, batu_api: 2 } },
    { level: 4, damage: 52, auraLabel: 'Busur Emas Crimson', coinsCost: 1400, materials: { emas: 1, batu_api: 3 } },
    { level: 5, damage: 70, auraLabel: 'MAX · Aura Api Ledak', coinsCost: 2000, materials: { emas: 2, batu_api: 3 } }
  ],
  pistol: [
    { level: 1, damage: 18, auraLabel: 'Pistol Kayu Dasar', coinsCost: 0, materials: {} },
    { level: 2, damage: 25, auraLabel: 'Laras Besi Presisi', coinsCost: 500, materials: { besi: 3 } },
    { level: 3, damage: 34, auraLabel: 'Pistol Kristal Dingin', coinsCost: 900, materials: { besi: 3, kristal_es: 2 } },
    { level: 4, damage: 46, auraLabel: 'Pistol Emas Beku', coinsCost: 1400, materials: { emas: 1, kristal_es: 3 } },
    { level: 5, damage: 62, auraLabel: 'MAX · Aura Es Naga', coinsCost: 2000, materials: { emas: 2, kristal_es: 3 } }
  ]
};

export function getWeaponCombatDamage(
  weapon: StickmanWeaponId,
  skin: StickmanSkinId | null,
  weaponLevels?: Partial<Record<StickmanBuyableWeaponId, number>>
): number {
  if (weapon === 'bare_hands') return 14;
  const lv = Math.max(1, Math.min(5, Number(weaponLevels?.[weapon] || 1)));
  const baseLvDmg = WEAPON_UPGRADE_TIERS[weapon][lv - 1]?.damage ?? DEFAULT_WEAPONS[weapon].damage;
  if (!skin) return baseLvDmg;
  const skinBaseBonus =
    skin === 'pedang_api_sayap'
      ? 20 // Lv1: 25+20 = 45
      : skin === 'panah_api'
      ? 18 // Lv1: 20+18 = 38
      : skin === 'tembakan_naga_es'
      ? 14 // Lv1: 18+14 = 32
      : skin === 'pedang_baja'
      ? 10
      : skin === 'panah_rimba'
      ? 8
      : 7;
  return baseLvDmg + skinBaseBonus;
}

export const COIN_EXCHANGE_PACKS = [
  { id: 'pack_100', diamondCost: 1000, coinsReward: 100, label: '100 Koin' },
  { id: 'pack_300', diamondCost: 2500, coinsReward: 300, label: '300 Koin' },
  { id: 'pack_700', diamondCost: 5000, coinsReward: 700, label: '700 Koin' },
  { id: 'pack_1600', diamondCost: 10000, coinsReward: 1600, label: '1.600 Koin' }
];

export const GACHA_SPIN_COST = {
  coins: 100,
  diamond: 1000
};

// =========================================================================
// GACHA WHEEL (ZERO AMPAS — ALL REWARDS USEFUL, TOTAL RATE = 100%, PITY 15->16)
// Rate: THE VAN 5%, Pedang Api Sayap 10%, Panah Api 12%, Naga Es 12%,
//       Batu Api 15%, Kristal Es 15%, Besi 16%, Emas 15%
// =========================================================================
export interface GachaSliceUI {
  id: string;
  kind: 'character' | 'skin' | 'material';
  label: string;
  rate: number;
  visualWeight: number;
  characterId?: StickmanCharacterId;
  skinId?: StickmanSkinId;
  materialId?: UpgradeMaterialId;
  materialAmount?: number;
}

export const GACHA_WHEEL_SLICES: GachaSliceUI[] = [
  { id: 'char_the_van', kind: 'character', label: 'THE VAN', rate: 5, visualWeight: 62, characterId: 'the_van' },
  { id: 'mat_besi', kind: 'material', label: 'Besi x3', rate: 16, visualWeight: 42, materialId: 'besi', materialAmount: 3 },
  { id: 'skin_pedang_api', kind: 'skin', label: 'Pedang Api Sayap', rate: 10, visualWeight: 44, skinId: 'pedang_api_sayap' },
  { id: 'mat_batu_api', kind: 'material', label: 'Batu Api x2', rate: 15, visualWeight: 42, materialId: 'batu_api', materialAmount: 2 },
  { id: 'skin_panah_api', kind: 'skin', label: 'Panah Api', rate: 12, visualWeight: 44, skinId: 'panah_api' },
  { id: 'mat_kristal_es', kind: 'material', label: 'Kristal Es x2', rate: 15, visualWeight: 42, materialId: 'kristal_es', materialAmount: 2 },
  { id: 'skin_naga_es', kind: 'skin', label: 'Tembakan Naga Es', rate: 12, visualWeight: 44, skinId: 'tembakan_naga_es' },
  { id: 'mat_emas', kind: 'material', label: 'Emas x2', rate: 15, visualWeight: 40, materialId: 'emas', materialAmount: 2 }
];

// =========================================================================
// KONTROL TOMBOL (MUNDUR + MAJU KIRI BAWAH, LONCAT KANAN BAWAH, SKILL 1 & 2)
// =========================================================================
export type ControlButtonId =
  | 'moveLeft'
  | 'moveRight'
  | 'jump'
  | 'attack'
  | 'dash'
  | 'skill'
  | 'skill1'
  | 'skill2'
  | 'switchWeapon'
  | 'block';

export interface ControlPositionConfig {
  id: ControlButtonId;
  label: string;
  xPct: number;
  yPct: number;
  scale: number;
}

export type ControlLayoutMap = Record<ControlButtonId, ControlPositionConfig>;

export const DEFAULT_CONTROL_LAYOUT: ControlLayoutMap = {
  moveLeft: {
    id: 'moveLeft',
    label: 'MUNDUR',
    xPct: 9,
    yPct: 79,
    scale: 1.15
  },
  moveRight: {
    id: 'moveRight',
    label: 'MAJU',
    xPct: 22,
    yPct: 79,
    scale: 1.15
  },
  jump: {
    id: 'jump',
    label: 'LONCAT',
    xPct: 90,
    yPct: 79,
    scale: 1.38 // Default kanan bawah paling besar
  },
  skill1: {
    id: 'skill1',
    label: 'SKILL 1',
    xPct: 81,
    yPct: 50,
    scale: 0.98 // Kanan atas tombol LONCAT
  },
  skill2: {
    id: 'skill2',
    label: 'SKILL 2',
    xPct: 91,
    yPct: 48,
    scale: 0.98 // Kanan atas tombol LONCAT
  },
  attack: {
    id: 'attack',
    label: 'SERANG',
    xPct: 75,
    yPct: 79,
    scale: 1.05
  },
  skill: {
    id: 'skill',
    label: 'SKILL SENJATA',
    xPct: 70,
    yPct: 54,
    scale: 0.9
  },
  dash: {
    id: 'dash',
    label: 'DASH',
    xPct: 59,
    yPct: 58,
    scale: 0.88
  },
  switchWeapon: {
    id: 'switchWeapon',
    label: 'GANTI SENJATA',
    xPct: 61,
    yPct: 81,
    scale: 0.9
  },
  block: {
    id: 'block',
    label: 'TAHAN',
    xPct: 49,
    yPct: 81,
    scale: 0.86
  }
};

export function loadControlLayout(userId: string): ControlLayoutMap {
  if (typeof window === 'undefined') return DEFAULT_CONTROL_LAYOUT;
  try {
    const raw = window.localStorage.getItem(`ze_stickman_controls_v3_${userId.toUpperCase()}`);
    if (!raw) return DEFAULT_CONTROL_LAYOUT;
    const parsed = JSON.parse(raw);
    const merged: any = {};
    (Object.keys(DEFAULT_CONTROL_LAYOUT) as ControlButtonId[]).forEach((key) => {
      const def = DEFAULT_CONTROL_LAYOUT[key];
      const saved = parsed?.[key];
      merged[key] = saved
        ? {
            id: key,
            label: def.label,
            xPct: typeof saved.xPct === 'number' ? Math.max(5, Math.min(95, saved.xPct)) : def.xPct,
            yPct: typeof saved.yPct === 'number' ? Math.max(12, Math.min(90, saved.yPct)) : def.yPct,
            scale: typeof saved.scale === 'number' ? Math.max(0.6, Math.min(1.75, saved.scale)) : def.scale
          }
        : def;
    });
    return merged as ControlLayoutMap;
  } catch {
    return DEFAULT_CONTROL_LAYOUT;
  }
}

export function saveControlLayout(userId: string, layout: ControlLayoutMap) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      `ze_stickman_controls_v3_${userId.toUpperCase()}`,
      JSON.stringify(layout)
    );
  } catch {}
}

export function createDefaultProfile(userId: string): StickmanProfile {
  return {
    userId: userId.toUpperCase(),
    coins: 0,
    level: 1,
    xp: 0,
    ownedWeapons: [],
    ownedSkins: [],
    ownedCharacters: ['rex'],
    equippedCharacter: 'rex',
    upgradeMaterials: {
      batu_api: 0,
      kristal_es: 0,
      besi: 0,
      emas: 0
    },
    weaponLevels: {
      sword: 1,
      bow: 1,
      pistol: 1
    },
    ampasItems: {},
    equippedWeapon: 'bare_hands',
    equippedSkin: null,
    gachaPity: 0,
    wins: 0,
    losses: 0,
    bossClears: 0,
    mail: [
      {
        id: 'welcome_notice',
        title: 'Selamat Datang di STICKMAN WAR',
        body: 'Pilih karakter REX gratis atau kumpulkan koin untuk KIRA, BRUNO, FROST. Putar Roda Gacha bebas ampas untuk meraih karakter Mythic THE VAN (Pity 15x -> ke-16 Pasti Dapat), Skin Legendaris, dan Komponen Upgrade senjata hingga Lv 5 MAX!',
        createdAt: Date.now(),
        read: false
      }
    ],
    updatedAt: Date.now()
  };
}

export { stickmanAudio, type StickmanAudioSettings };
