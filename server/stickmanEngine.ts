import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  deductUserWallet,
  getUserWallet,
  isOwnerUserId
} from './featuresEngine.ts';

const DATA_DIR = path.resolve(process.cwd());
const STICKMAN_DB_FILE = path.join(DATA_DIR, '.stickman_war_db.json');

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
  gachaPity: number; // 0..15; at 15, 16th spin guarantees THE VAN
  wins: number;
  losses: number;
  bossClears: number;
  mail: StickmanMailItem[];
  updatedAt: number;
}

interface StickmanDB {
  profiles: Record<string, StickmanProfile>;
}

export const WEAPON_SHOP_PRICES: Record<StickmanBuyableWeaponId, { priceCoins: number; name: string }> = {
  sword: { priceCoins: 150, name: 'Pedang Kayu (Default)' },
  bow: { priceCoins: 200, name: 'Panah Kayu (Default)' },
  pistol: { priceCoins: 250, name: 'Pistol Kayu (Default)' }
};

export const CHARACTER_SHOP_PRICES: Record<StickmanCharacterId, { priceCoins: number | null; gachaOnly: boolean; name: string }> = {
  rex: { priceCoins: 0, gachaOnly: false, name: 'REX' },
  kira: { priceCoins: 5000, gachaOnly: false, name: 'KIRA' },
  bruno: { priceCoins: 8000, gachaOnly: false, name: 'BRUNO' },
  frost: { priceCoins: 12000, gachaOnly: false, name: 'FROST' },
  the_van: { priceCoins: null, gachaOnly: true, name: 'THE VAN' }
};

interface UpgradeStepCost {
  level: number;
  damage: number;
  coinsCost: number;
  materials: Partial<Record<UpgradeMaterialId, number>>;
}

export const WEAPON_UPGRADE_COSTS: Record<StickmanBuyableWeaponId, UpgradeStepCost[]> = {
  sword: [
    { level: 1, damage: 25, coinsCost: 0, materials: {} },
    { level: 2, damage: 35, coinsCost: 500, materials: { besi: 3 } },
    { level: 3, damage: 48, coinsCost: 900, materials: { besi: 4, batu_api: 2 } },
    { level: 4, damage: 65, coinsCost: 1400, materials: { emas: 1, batu_api: 2 } },
    { level: 5, damage: 85, coinsCost: 2000, materials: { emas: 2, batu_api: 3 } }
  ],
  bow: [
    { level: 1, damage: 20, coinsCost: 0, materials: {} },
    { level: 2, damage: 28, coinsCost: 500, materials: { besi: 3 } },
    { level: 3, damage: 38, coinsCost: 900, materials: { besi: 3, batu_api: 2 } },
    { level: 4, damage: 52, coinsCost: 1400, materials: { emas: 1, batu_api: 3 } },
    { level: 5, damage: 70, coinsCost: 2000, materials: { emas: 2, batu_api: 3 } }
  ],
  pistol: [
    { level: 1, damage: 18, coinsCost: 0, materials: {} },
    { level: 2, damage: 25, coinsCost: 500, materials: { besi: 3 } },
    { level: 3, damage: 34, coinsCost: 900, materials: { besi: 3, kristal_es: 2 } },
    { level: 4, damage: 46, coinsCost: 1400, materials: { emas: 1, kristal_es: 3 } },
    { level: 5, damage: 62, coinsCost: 2000, materials: { emas: 2, kristal_es: 3 } }
  ]
};

export const COIN_EXCHANGE_PACKS: Record<string, { diamondCost: number; coinsReward: number; label: string }> = {
  pack_100: { diamondCost: 1000, coinsReward: 100, label: '100 Koin' },
  pack_300: { diamondCost: 2500, coinsReward: 300, label: '300 Koin' },
  pack_700: { diamondCost: 5000, coinsReward: 700, label: '700 Koin' },
  pack_1600: { diamondCost: 10000, coinsReward: 1600, label: '1.600 Koin' }
};

export const GACHA_SPIN_COST = {
  coins: 100,
  diamond: 1000
};

export const SKIN_BASE_WEAPON: Record<StickmanSkinId, StickmanBuyableWeaponId> = {
  panah_api: 'bow',
  tembakan_naga_es: 'pistol',
  pedang_api_sayap: 'sword',
  pedang_baja: 'sword',
  panah_rimba: 'bow',
  pistol_bayangan: 'pistol'
};

export interface GachaSliceDef {
  id: string;
  kind: 'character' | 'skin' | 'material';
  label: string;
  rate: number; // sums strictly to 100
  characterId?: StickmanCharacterId;
  skinId?: StickmanSkinId;
  materialId?: UpgradeMaterialId;
  materialAmount?: number;
}

// ZERO AMPAS: Rate total = 5 + 16 + 10 + 15 + 12 + 15 + 12 + 15 = 100%
export const GACHA_SLICES: GachaSliceDef[] = [
  { id: 'char_the_van', kind: 'character', label: 'THE VAN', rate: 5, characterId: 'the_van' },
  { id: 'mat_besi', kind: 'material', label: 'Besi x3', rate: 16, materialId: 'besi', materialAmount: 3 },
  { id: 'skin_pedang_api', kind: 'skin', label: 'Pedang Api Sayap', rate: 10, skinId: 'pedang_api_sayap' },
  { id: 'mat_batu_api', kind: 'material', label: 'Batu Api x2', rate: 15, materialId: 'batu_api', materialAmount: 2 },
  { id: 'skin_panah_api', kind: 'skin', label: 'Panah Api', rate: 12, skinId: 'panah_api' },
  { id: 'mat_kristal_es', kind: 'material', label: 'Kristal Es x2', rate: 15, materialId: 'kristal_es', materialAmount: 2 },
  { id: 'skin_naga_es', kind: 'skin', label: 'Tembakan Naga Es', rate: 12, skinId: 'tembakan_naga_es' },
  { id: 'mat_emas', kind: 'material', label: 'Emas x2', rate: 15, materialId: 'emas', materialAmount: 2 }
];

function loadStickmanDB(): StickmanDB {
  try {
    if (fs.existsSync(STICKMAN_DB_FILE)) {
      const raw = fs.readFileSync(STICKMAN_DB_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && parsed.profiles) {
        return parsed as StickmanDB;
      }
    }
  } catch (err) {
    console.warn('Stickman DB load notice:', err);
  }
  return { profiles: {} };
}

const stickmanCache: StickmanDB = loadStickmanDB();

function saveStickmanDB() {
  try {
    fs.writeFileSync(STICKMAN_DB_FILE, JSON.stringify(stickmanCache, null, 2));
  } catch (err) {
    console.error('Failed saving Stickman DB:', err);
  }
}

function canonicalUid(userId: string): string {
  return String(userId || 'GUEST').trim().toUpperCase();
}

export function getOrCreateStickmanProfile(userId: string): StickmanProfile {
  const uid = canonicalUid(userId);
  if (!stickmanCache.profiles[uid]) {
    stickmanCache.profiles[uid] = {
      userId: uid,
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
    saveStickmanDB();
  }

  const p = stickmanCache.profiles[uid];
  let dirty = false;
  if (typeof p.gachaPity !== 'number') {
    p.gachaPity = 0;
    dirty = true;
  }
  if (!Array.isArray(p.ownedCharacters) || !p.ownedCharacters.includes('rex')) {
    p.ownedCharacters = Array.from(new Set<StickmanCharacterId>(['rex', ...(p.ownedCharacters || [])]));
    dirty = true;
  }
  if (!p.equippedCharacter || !p.ownedCharacters.includes(p.equippedCharacter)) {
    p.equippedCharacter = 'rex';
    dirty = true;
  }
  if (!p.upgradeMaterials) {
    p.upgradeMaterials = { batu_api: 0, kristal_es: 0, besi: 0, emas: 0 };
    dirty = true;
  }
  if (!p.weaponLevels) {
    p.weaponLevels = { sword: 1, bow: 1, pistol: 1 };
    dirty = true;
  }
  if (dirty) saveStickmanDB();
  return p;
}

export function buyStickmanCharacter(
  userId: string,
  characterId: StickmanCharacterId
): { success: boolean; message: string; profile?: StickmanProfile } {
  const uid = canonicalUid(userId);
  const profile = getOrCreateStickmanProfile(uid);
  const spec = CHARACTER_SHOP_PRICES[characterId];
  if (!spec) {
    return { success: false, message: 'Karakter tidak ditemukan.', profile };
  }
  if (spec.gachaOnly || spec.priceCoins === null) {
    return {
      success: false,
      message: `${spec.name} TIDAK bisa dibeli! Hanya bisa didapatkan dari GACHA.`,
      profile
    };
  }
  if (profile.ownedCharacters.includes(characterId)) {
    profile.equippedCharacter = characterId;
    profile.updatedAt = Date.now();
    saveStickmanDB();
    return { success: true, message: `${spec.name} sudah dimiliki & langsung dipakai!`, profile };
  }
  if (profile.coins < spec.priceCoins) {
    return {
      success: false,
      message: `Koin tidak cukup untuk membeli ${spec.name} (butuh ${spec.priceCoins.toLocaleString('id-ID')} Koin).`,
      profile
    };
  }
  profile.coins -= spec.priceCoins;
  profile.ownedCharacters.push(characterId);
  profile.equippedCharacter = characterId;
  profile.updatedAt = Date.now();
  saveStickmanDB();
  return {
    success: true,
    message: `Karakter ${spec.name} berhasil dibeli & langsung dipakai!`,
    profile
  };
}

export function equipStickmanCharacter(
  userId: string,
  characterId: StickmanCharacterId
): { success: boolean; message: string; profile?: StickmanProfile } {
  const uid = canonicalUid(userId);
  const profile = getOrCreateStickmanProfile(uid);
  const spec = CHARACTER_SHOP_PRICES[characterId];
  if (!spec) {
    return { success: false, message: 'Karakter tidak ditemukan.', profile };
  }
  if (!profile.ownedCharacters.includes(characterId)) {
    return {
      success: false,
      message:
        characterId === 'the_van'
          ? 'THE VAN hanya bisa didapatkan dari GACHA!'
          : `Beli karakter ${spec.name} terlebih dahulu!`,
      profile
    };
  }
  profile.equippedCharacter = characterId;
  profile.updatedAt = Date.now();
  saveStickmanDB();
  return { success: true, message: `Karakter ${spec.name} aktif!`, profile };
}

export function buyStickmanWeapon(
  userId: string,
  weaponId: StickmanBuyableWeaponId
): { success: boolean; message: string; profile?: StickmanProfile } {
  const uid = canonicalUid(userId);
  const profile = getOrCreateStickmanProfile(uid);
  const spec = WEAPON_SHOP_PRICES[weaponId];
  if (!spec) {
    return { success: false, message: 'Senjata tidak ditemukan.' };
  }
  if (profile.ownedWeapons.includes(weaponId)) {
    return { success: false, message: `${spec.name} sudah dimiliki.`, profile };
  }
  if (profile.coins < spec.priceCoins) {
    return {
      success: false,
      message: `Koin tidak cukup. Butuh ${spec.priceCoins} Koin (saldo: ${profile.coins} Koin).`,
      profile
    };
  }
  profile.coins -= spec.priceCoins;
  profile.ownedWeapons.push(weaponId);
  profile.equippedWeapon = weaponId;
  if (profile.equippedSkin && SKIN_BASE_WEAPON[profile.equippedSkin] !== weaponId) {
    profile.equippedSkin = null;
  }
  profile.updatedAt = Date.now();
  saveStickmanDB();
  return {
    success: true,
    message: `${spec.name} berhasil dibeli & langsung dipakai!`,
    profile
  };
}

export function upgradeStickmanWeapon(
  userId: string,
  weaponId: StickmanBuyableWeaponId
): { success: boolean; message: string; newLevel?: number; profile?: StickmanProfile } {
  const uid = canonicalUid(userId);
  const profile = getOrCreateStickmanProfile(uid);
  const tiers = WEAPON_UPGRADE_COSTS[weaponId];
  if (!tiers) {
    return { success: false, message: 'Senjata tidak valid.', profile };
  }
  if (!profile.ownedWeapons.includes(weaponId)) {
    return {
      success: false,
      message: `Beli ${WEAPON_SHOP_PRICES[weaponId].name} di Shop terlebih dahulu sebelum upgrade.`,
      profile
    };
  }
  const currentLv = Math.max(1, Math.min(5, Number(profile.weaponLevels[weaponId] || 1)));
  if (currentLv >= 5) {
    return { success: false, message: 'Senjata sudah mencapai Level 5 MAX!', profile };
  }
  const nextStep = tiers[currentLv]; // index = currentLv corresponds to level (currentLv + 1)
  if (!nextStep) {
    return { success: false, message: 'Level upgrade tidak ditemukan.', profile };
  }

  for (const [matKey, reqQty] of Object.entries(nextStep.materials) as Array<[UpgradeMaterialId, number]>) {
    const have = Number(profile.upgradeMaterials[matKey] || 0);
    if (have < reqQty) {
      return {
        success: false,
        message: `Komponen ${matKey.replace('_', ' ').toUpperCase()} kurang (${have}/${reqQty})!`,
        profile
      };
    }
  }

  if (profile.coins < nextStep.coinsCost) {
    return {
      success: false,
      message: `Koin kurang! Butuh ${nextStep.coinsCost.toLocaleString('id-ID')} Koin.`,
      profile
    };
  }

  // Deduct costs & apply level up
  profile.coins -= nextStep.coinsCost;
  for (const [matKey, reqQty] of Object.entries(nextStep.materials) as Array<[UpgradeMaterialId, number]>) {
    profile.upgradeMaterials[matKey] = Math.max(0, Number(profile.upgradeMaterials[matKey] || 0) - reqQty);
  }
  profile.weaponLevels[weaponId] = currentLv + 1;
  profile.updatedAt = Date.now();
  saveStickmanDB();

  return {
    success: true,
    message: `${WEAPON_SHOP_PRICES[weaponId].name.replace(' (Default)', '')} naik ke Lv.${currentLv + 1}! (DMG ${nextStep.damage})`,
    newLevel: currentLv + 1,
    profile
  };
}

export function buyCoinsWithDiamond(
  userId: string,
  packId: string
): {
  success: boolean;
  message: string;
  profile?: StickmanProfile;
  newDiamondBalance?: number;
  isUnlimited?: boolean;
} {
  const uid = canonicalUid(userId);
  if (!uid || uid === 'ANONYMOUS' || uid === 'GUEST') {
    return { success: false, message: 'Silakan login ke akun VNJAVA terlebih dahulu.' };
  }
  const pack = COIN_EXCHANGE_PACKS[packId];
  if (!pack) {
    return { success: false, message: 'Paket koin tidak valid.' };
  }
  const isOwner = isOwnerUserId(uid);
  const currentDiamond = isOwner ? 999999999 : getUserWallet(uid);
  if (!isOwner && currentDiamond < pack.diamondCost) {
    return {
      success: false,
      message: `Saldo Diamond+ tidak cukup. Butuh ${pack.diamondCost.toLocaleString('id-ID')} Diamond+.`
    };
  }
  const deducted = isOwner
    ? true
    : deductUserWallet(uid, pack.diamondCost, `Tukar ${pack.label} Stickman War`);
  if (!deducted) {
    return { success: false, message: 'Gagal memotong saldo Diamond+.' };
  }
  const profile = getOrCreateStickmanProfile(uid);
  profile.coins += pack.coinsReward;
  profile.updatedAt = Date.now();
  saveStickmanDB();

  const newDiamondBalance = isOwner ? 999999999 : getUserWallet(uid);
  return {
    success: true,
    message: `Berhasil membeli ${pack.label} menggunakan Diamond+!`,
    profile,
    newDiamondBalance,
    isUnlimited: isOwner
  };
}

export function equipStickmanLoadout(
  userId: string,
  weaponId: StickmanWeaponId,
  skinId: StickmanSkinId | null
): { success: boolean; message: string; profile?: StickmanProfile } {
  const uid = canonicalUid(userId);
  const profile = getOrCreateStickmanProfile(uid);

  if (weaponId !== 'bare_hands' && !profile.ownedWeapons.includes(weaponId)) {
    return {
      success: false,
      message: 'Anda belum membeli senjata default ini di Shop!',
      profile
    };
  }

  let nextSkin: StickmanSkinId | null = null;
  if (skinId) {
    if (!profile.ownedSkins.includes(skinId)) {
      return {
        success: false,
        message: 'Skin ini belum dimiliki. Dapatkan lewat Gacha!',
        profile
      };
    }
    const requiredWeapon = SKIN_BASE_WEAPON[skinId];
    if (!profile.ownedWeapons.includes(requiredWeapon)) {
      return {
        success: false,
        message: `Skin terkunci! Beli ${WEAPON_SHOP_PRICES[requiredWeapon].name} di Shop terlebih dahulu.`,
        profile
      };
    }
    if (weaponId !== requiredWeapon) {
      weaponId = requiredWeapon;
    }
    nextSkin = skinId;
  }

  profile.equippedWeapon = weaponId;
  profile.equippedSkin = nextSkin;
  profile.updatedAt = Date.now();
  saveStickmanDB();
  return { success: true, message: 'Perlengkapan berhasil dipasang!', profile };
}

export function spinStickmanGacha(
  userId: string,
  currency: 'coins' | 'diamond'
): {
  success: boolean;
  message: string;
  sliceIndex?: number;
  slice?: GachaSliceDef;
  awardedCharacterId?: StickmanCharacterId | null;
  awardedSkinId?: StickmanSkinId | null;
  awardedMaterialId?: UpgradeMaterialId | null;
  awardedMaterialAmount?: number;
  skinLockedByWeapon?: boolean;
  isDuplicate?: boolean;
  coinsAdded?: number;
  profile?: StickmanProfile;
  newDiamondBalance?: number;
  isUnlimited?: boolean;
} {
  const uid = canonicalUid(userId);
  const profile = getOrCreateStickmanProfile(uid);
  const isOwner = isOwnerUserId(uid);

  if (currency === 'diamond') {
    if (!uid || uid === 'ANONYMOUS' || uid === 'GUEST') {
      return { success: false, message: 'Silakan login ke akun VNJAVA untuk spin dengan Diamond+.' };
    }
    const cost = GACHA_SPIN_COST.diamond;
    const bal = isOwner ? 999999999 : getUserWallet(uid);
    if (!isOwner && bal < cost) {
      return {
        success: false,
        message: `Saldo Diamond+ tidak cukup (butuh ${cost.toLocaleString('id-ID')} Diamond+).`
      };
    }
    const ok = isOwner ? true : deductUserWallet(uid, cost, 'Gacha Stickman War');
    if (!ok) {
      return { success: false, message: 'Gagal memotong Diamond+.' };
    }
  } else {
    const cost = GACHA_SPIN_COST.coins;
    if (profile.coins < cost) {
      return {
        success: false,
        message: `Koin tidak cukup! Butuh ${cost} Koin untuk 1x Spin.`
      };
    }
    profile.coins -= cost;
  }

  const currentPity = Number(profile.gachaPity || 0);
  // 15x spin tidak dapat THE VAN -> spin ke-16 PASTI dapat THE VAN!
  const triggeredPity = currentPity >= 15;

  let chosenIdx = 0;
  if (triggeredPity) {
    chosenIdx = 0; // THE VAN slot
  } else {
    const totalWeight = GACHA_SLICES.reduce((acc, s) => acc + s.rate, 0);
    const randBytes = crypto.randomBytes(4).readUInt32BE(0) / 0xffffffff;
    let roll = randBytes * totalWeight;
    chosenIdx = GACHA_SLICES.length - 1;
    for (let i = 0; i < GACHA_SLICES.length; i++) {
      roll -= GACHA_SLICES[i].rate;
      if (roll <= 0) {
        chosenIdx = i;
        break;
      }
    }
  }

  const slice = GACHA_SLICES[chosenIdx];
  let awardedCharacterId: StickmanCharacterId | null = null;
  let awardedSkinId: StickmanSkinId | null = null;
  let awardedMaterialId: UpgradeMaterialId | null = null;
  let awardedMaterialAmount = 0;
  let skinLockedByWeapon = false;
  let isDuplicate = false;
  let coinsAdded = 0;

  if (slice.kind === 'character' && slice.characterId === 'the_van') {
    profile.gachaPity = 0;
    awardedCharacterId = 'the_van';
    if (!profile.ownedCharacters.includes('the_van')) {
      profile.ownedCharacters.push('the_van');
    } else {
      isDuplicate = true;
      coinsAdded = 500;
      profile.coins += 500;
      profile.upgradeMaterials.emas = (profile.upgradeMaterials.emas || 0) + 2;
    }
  } else if (slice.kind === 'skin' && slice.skinId) {
    profile.gachaPity = currentPity + 1;
    awardedSkinId = slice.skinId;
    if (!profile.ownedSkins.includes(awardedSkinId)) {
      profile.ownedSkins.push(awardedSkinId);
    } else {
      isDuplicate = true;
      coinsAdded = 250;
      profile.coins += 250;
    }
    const reqWeapon = SKIN_BASE_WEAPON[awardedSkinId];
    skinLockedByWeapon = !profile.ownedWeapons.includes(reqWeapon);
  } else if (slice.kind === 'material' && slice.materialId) {
    profile.gachaPity = currentPity + 1;
    awardedMaterialId = slice.materialId;
    awardedMaterialAmount = slice.materialAmount || 1;
    profile.upgradeMaterials[awardedMaterialId] =
      Number(profile.upgradeMaterials[awardedMaterialId] || 0) + awardedMaterialAmount;
  }

  profile.updatedAt = Date.now();
  saveStickmanDB();

  const newDiamondBalance = isOwner ? 999999999 : getUserWallet(uid);
  return {
    success: true,
    message:
      slice.kind === 'character'
        ? triggeredPity
          ? 'PITY AKTIF · KARAKTER MYTHIC THE VAN!'
          : 'JACKPOT · KARAKTER MYTHIC THE VAN!'
        : slice.kind === 'skin'
        ? `SKIN LEGENDARIS · ${slice.label}!`
        : `KOMPONEN UPGRADE · ${slice.label}!`,
    sliceIndex: chosenIdx,
    slice,
    awardedCharacterId,
    awardedSkinId,
    awardedMaterialId,
    awardedMaterialAmount,
    skinLockedByWeapon,
    isDuplicate,
    coinsAdded,
    profile,
    newDiamondBalance,
    isUnlimited: isOwner
  };
}

export function recordStickmanMatchResult(
  userId: string,
  won: boolean,
  mode: '1v1_online' | 'duel_ai' | 'boss'
): {
  success: boolean;
  coinsEarned: number;
  xpEarned: number;
  leveledUp: boolean;
  profile: StickmanProfile;
} {
  const uid = canonicalUid(userId);
  const profile = getOrCreateStickmanProfile(uid);

  const coinsEarned = won ? 100 : 50;
  const xpEarned = won ? (mode === 'boss' ? 80 : 60) : 25;

  profile.coins += coinsEarned;
  profile.xp += xpEarned;
  if (won) {
    profile.wins += 1;
    if (mode === 'boss') profile.bossClears += 1;
  } else {
    profile.losses += 1;
  }

  let leveledUp = false;
  while (profile.xp >= profile.level * 100) {
    profile.xp -= profile.level * 100;
    profile.level += 1;
    leveledUp = true;
  }

  profile.updatedAt = Date.now();
  saveStickmanDB();
  return {
    success: true,
    coinsEarned,
    xpEarned,
    leveledUp,
    profile
  };
}

export function markStickmanMailRead(userId: string, mailId: string): StickmanProfile {
  const uid = canonicalUid(userId);
  const profile = getOrCreateStickmanProfile(uid);
  profile.mail = profile.mail.map((m) =>
    mailId === 'ALL' || m.id === mailId ? { ...m, read: true } : m
  );
  profile.updatedAt = Date.now();
  saveStickmanDB();
  return profile;
}
