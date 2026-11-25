import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Coins,
  Copy,
  Crown,
  Disc3,
  Flame,
  Gem,
  Lock,
  Mail,
  Move,
  Package,
  Plus,
  RefreshCw,
  Settings,
  Shield,
  ShoppingCart,
  Swords,
  User,
  Users,
  Volume2,
  VolumeX,
  X,
  Zap
} from 'lucide-react';
import {
  CHARACTER_DEFS,
  createDefaultProfile,
  DEFAULT_CONTROL_LAYOUT,
  DEFAULT_WEAPONS,
  LEGENDARY_SKIN_ORDER,
  loadControlLayout,
  saveControlLayout,
  STICKMAN_SKINS,
  stickmanAudio,
  type AiDifficulty,
  type ControlButtonId,
  type ControlLayoutMap,
  type StickmanAudioSettings,
  type StickmanBuyableWeaponId,
  type StickmanCharacterId,
  type StickmanMatchMode,
  type StickmanProfile,
  type StickmanRoomData,
  type StickmanSkinId,
  type StickmanWeaponId
} from './stickmanTypes';
import { LobbyStickmanCanvas, WeaponArtwork } from './StickmanArt';
import { StickmanModernLogo } from './StickmanModernLogo';
import { StickmanShopPage } from './StickmanShopPage';
import { StickmanGachaPage, type GachaSpinResult } from './StickmanGachaPage';
import { StickmanInventoryPage } from './StickmanInventoryPage';
import { StickmanCharacterPage } from './StickmanCharacterPage';
import { StickmanUpgradePage } from './StickmanUpgradePage';
import { StickmanBattleArena } from './StickmanBattleArena';
import { safeApiFetch } from '../../lib/zeDataSync';
import { db, doc, getDoc, onSnapshot, setDoc } from '../../firebase';
import { isUserOwner } from '../UserRoleBadge';

const STICKMAN_PROFILE_CACHE_PREFIX = 'ze_stickman_profile_v2_';

function readCachedStickmanProfile(userId: string): StickmanProfile | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(`${STICKMAN_PROFILE_CACHE_PREFIX}${userId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && typeof parsed.coins === 'number') {
      return parsed as StickmanProfile;
    }
  } catch {}
  return null;
}

function writeCachedStickmanProfile(userId: string, profile: StickmanProfile) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`${STICKMAN_PROFILE_CACHE_PREFIX}${userId}`, JSON.stringify(profile));
  } catch {}
}

interface StickmanWarAppProps {
  currentUser: any;
  initialDiamondBalance: number;
  onExit: () => void;
}

type StickmanScreen = 'lobby' | 'shop' | 'gacha' | 'inventory' | 'character' | 'upgrade' | 'battle';

export const StickmanWarApp: React.FC<StickmanWarAppProps> = ({
  currentUser,
  initialDiamondBalance,
  onExit
}) => {
  const userId = String(currentUser?.id || 'GUEST').trim().toUpperCase();
  const userName = String(currentUser?.name || currentUser?.username || 'Pemain').trim();
  const isOwner = isUserOwner(currentUser);

  const [screen, setScreen] = useState<StickmanScreen>('lobby');
  const [showSplash, setShowSplash] = useState<boolean>(true);
  const [isProfileLoading, setIsProfileLoading] = useState<boolean>(true);
  const [shopInitialTab, setShopInitialTab] = useState<'weapons' | 'coins'>('weapons');
  const [profile, setProfile] = useState<StickmanProfile>(
    () => readCachedStickmanProfile(userId) || createDefaultProfile(userId)
  );
  const [diamondBalance, setDiamondBalance] = useState<number>(
    isOwner ? 999999999 : initialDiamondBalance || 0
  );

  // Lobby Controls
  const [selectedMode, setSelectedMode] = useState<StickmanMatchMode>('duel_ai');
  const [aiDifficulty, setAiDifficulty] = useState<AiDifficulty>('normal');
  const [yawDeg, setYawDeg] = useState<number>(18);
  const draggingRef = useRef<{ active: boolean; lastX: number; lastY: number }>({
    active: false,
    lastX: 0,
    lastY: 0
  });

  // Modals & Settings
  const [showSettings, setShowSettings] = useState(false);
  const [showMail, setShowMail] = useState(false);
  const [audioSettings, setAudioSettings] = useState<StickmanAudioSettings>(() => ({
    ...stickmanAudio.settings
  }));
  const [showControlEditor, setShowControlEditor] = useState(false);
  const [controlLayout, setControlLayout] = useState<ControlLayoutMap>(() =>
    loadControlLayout(userId)
  );
  const [selectedControlId, setSelectedControlId] = useState<ControlButtonId>('jump');
  const controlDragRef = useRef<{
    id: ControlButtonId | null;
    pinchStartDist: number;
    pinchStartScale: number;
  }>({ id: null, pinchStartDist: 0, pinchStartScale: 1 });
  const editorContainerRef = useRef<HTMLDivElement | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Online / Mabar Matchmaking
  const [showOnlineModal, setShowOnlineModal] = useState(false);
  const [isSearchingQueue, setIsSearchingQueue] = useState(false);
  const [queueCount, setQueueCount] = useState(1);
  const [activeRoom, setActiveRoom] = useState<StickmanRoomData | null>(null);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [openRooms, setOpenRooms] = useState<StickmanRoomData[]>([]);
  const [onlineError, setOnlineError] = useState<string | null>(null);
  const [battleSeed, setBattleSeed] = useState(0);

  // Viewport Orientation Detection (CSS Landscape fallback when mobile browser is portrait)
  const [isPortraitViewport, setIsPortraitViewport] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerHeight > window.innerWidth : false
  );

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => {
      setToast((prev) => (prev === msg ? null : prev));
    }, 3200);
  }, []);

  // AUTO LANDSCAPE ON ENTER + RESTORE PORTRAIT ON EXIT
  useEffect(() => {
    const updateDims = () => {
      setIsPortraitViewport(window.innerHeight > window.innerWidth);
    };
    updateDims();
    window.addEventListener('resize', updateDims);

    // 1. Native Android APK Bridge
    try {
      window.ZeNative?.setScreenOrientation?.('landscape');
    } catch {}

    // 2. Web Screen Orientation API
    try {
      const ori = (window.screen as any)?.orientation;
      if (ori && typeof ori.lock === 'function') {
        ori.lock('landscape').catch(() => {});
      }
    } catch {}

    // Start lobby/game background music & keep synced
    stickmanAudio.startMusic();
    const unlockOnce = () => stickmanAudio.unlock();
    window.addEventListener('pointerdown', unlockOnce, { once: true });

    const splashTimer = window.setTimeout(() => {
      setShowSplash(false);
    }, 950);

    return () => {
      window.clearTimeout(splashTimer);
      stickmanAudio.stopMusic();
      window.removeEventListener('pointerdown', unlockOnce);
      window.removeEventListener('resize', updateDims);
      try {
        window.ZeNative?.setScreenOrientation?.('portrait');
      } catch {}
      try {
        const ori = (window.screen as any)?.orientation;
        if (ori && typeof ori.unlock === 'function') {
          ori.unlock();
        }
      } catch {}
    };
  }, []);

  // Sync Diamond+ Wallet Balance (API + Firestore ze_wallets)
  const syncDiamondBalance = useCallback(async () => {
    if (isOwner) {
      setDiamondBalance(999999999);
      return;
    }
    try {
      const res = await safeApiFetch<any>(
        `/api/wallet/balance?userId=${encodeURIComponent(userId)}`,
        { timeoutMs: 10000 }
      );
      if (res.ok && res.data?.success) {
        setDiamondBalance(res.data.isUnlimited ? 999999999 : Number(res.data.balance) || 0);
        return;
      }
      if (db && userId && !userId.includes('/')) {
        const snap = await getDoc(doc(db, 'ze_wallets', userId));
        if (snap.exists()) {
          const d = snap.data() as any;
          setDiamondBalance(d.isUnlimited ? 999999999 : Number(d.balance) || 0);
        }
      }
    } catch {}
  }, [userId, isOwner]);

  const normalizeProfile = useCallback(
    (raw: Partial<StickmanProfile> | undefined): StickmanProfile => {
      const def = createDefaultProfile(userId);
      const merged = { ...def, ...(raw || {}) };
      merged.coins = Math.max(0, Number(merged.coins ?? 0));
      if (!Array.isArray(merged.ownedCharacters) || merged.ownedCharacters.length === 0) {
        merged.ownedCharacters = ['rex'];
      }
      if (!merged.ownedCharacters.includes('rex')) {
        merged.ownedCharacters.unshift('rex');
      }
      if (!merged.equippedCharacter || !merged.ownedCharacters.includes(merged.equippedCharacter)) {
        merged.equippedCharacter = 'rex';
      }
      merged.upgradeMaterials = {
        batu_api: Number(merged.upgradeMaterials?.batu_api || 0),
        kristal_es: Number(merged.upgradeMaterials?.kristal_es || 0),
        besi: Number(merged.upgradeMaterials?.besi || 0),
        emas: Number(merged.upgradeMaterials?.emas || 0)
      };
      merged.weaponLevels = {
        sword: Math.max(1, Math.min(5, Number(merged.weaponLevels?.sword || 1))),
        bow: Math.max(1, Math.min(5, Number(merged.weaponLevels?.bow || 1))),
        pistol: Math.max(1, Math.min(5, Number(merged.weaponLevels?.pistol || 1)))
      };
      return merged;
    },
    [userId]
  );

  // Sync Stickman Profile (Authoritative Server -> localStorage & Firestore mirror)
  const loadProfile = useCallback(async () => {
    try {
      const res = await safeApiFetch<{ success?: boolean; profile?: StickmanProfile }>(
        `/api/stickman/profile?userId=${encodeURIComponent(userId)}`,
        { timeoutMs: 10000 }
      );
      if (res.ok && res.data?.success && res.data.profile) {
        const clean = normalizeProfile(res.data.profile);
        setProfile(clean);
        writeCachedStickmanProfile(userId, clean);
        window.dispatchEvent(
          new CustomEvent('ze-stickman-updated', { detail: { userId, profile: clean } })
        );
        if (db && userId && !userId.includes('/')) {
          setDoc(doc(db, 'ze_stickman_profiles', userId), clean, { merge: true }).catch(() => {});
        }
        return;
      }
      if (db && userId && !userId.includes('/')) {
        const snap = await getDoc(doc(db, 'ze_stickman_profiles', userId));
        if (snap.exists()) {
          const clean = normalizeProfile(snap.data() as StickmanProfile);
          setProfile(clean);
          writeCachedStickmanProfile(userId, clean);
        }
      }
    } catch {
    } finally {
      setIsProfileLoading(false);
    }
  }, [userId, normalizeProfile]);

  useEffect(() => {
    syncDiamondBalance();
    loadProfile();

    let unsubWallet: (() => void) | null = null;
    if (db && userId && !userId.includes('/')) {
      try {
        unsubWallet = onSnapshot(doc(db, 'ze_wallets', userId), (snap) => {
          if (snap.exists()) {
            const d = snap.data() as any;
            setDiamondBalance(isOwner || d.isUnlimited ? 999999999 : Number(d.balance) || 0);
          }
        });
      } catch {}
    }

    const onWalletEvent = (e: any) => {
      try {
        const data = e.detail;
        if (data && String(data.userId).toUpperCase() === userId) {
          setDiamondBalance(isOwner || data.isUnlimited ? 999999999 : Number(data.balance) || 0);
        }
      } catch {}
    };
    const onStickmanEvent = (e: any) => {
      try {
        const data = e.detail;
        if (data && String(data.userId).toUpperCase() === userId && data.profile) {
          const clean = normalizeProfile(data.profile);
          setProfile(clean);
          writeCachedStickmanProfile(userId, clean);
        }
      } catch {}
    };
    window.addEventListener('ze-wallet-updated' as any, onWalletEvent);
    window.addEventListener('ze-stickman-updated' as any, onStickmanEvent);
    return () => {
      unsubWallet?.();
      window.removeEventListener('ze-wallet-updated' as any, onWalletEvent);
      window.removeEventListener('ze-stickman-updated' as any, onStickmanEvent);
    };
  }, [userId, isOwner, syncDiamondBalance, loadProfile, normalizeProfile]);

  // Keep server coins/wallet synced whenever switching between Lobby/Shop/Gacha/Inventory/Character/Upgrade
  useEffect(() => {
    if (screen !== 'battle') {
      loadProfile();
      syncDiamondBalance();
    }
  }, [screen, loadProfile, syncDiamondBalance]);

  const emitWalletSync = useCallback(
    (newBal: number, unlimited?: boolean) => {
      const resolved = isOwner || unlimited ? 999999999 : newBal;
      setDiamondBalance(resolved);
      window.dispatchEvent(
        new CustomEvent('ze-wallet-updated', {
          detail: { userId, balance: resolved, isUnlimited: isOwner || unlimited }
        })
      );
      if (db && userId && !userId.includes('/') && !isOwner) {
        setDoc(
          doc(db, 'ze_wallets', userId),
          { userId, balance: resolved, updatedAt: Date.now() },
          { merge: true }
        ).catch(() => {});
      }
    },
    [userId, isOwner]
  );

  const persistProfileMirror = useCallback(
    (next: StickmanProfile) => {
      const clean = normalizeProfile(next);
      setProfile(clean);
      writeCachedStickmanProfile(userId, clean);
      window.dispatchEvent(
        new CustomEvent('ze-stickman-updated', { detail: { userId, profile: clean } })
      );
      if (db && userId && !userId.includes('/')) {
        setDoc(doc(db, 'ze_stickman_profiles', userId), clean, { merge: true }).catch(() => {});
      }
    },
    [userId, normalizeProfile]
  );

  // Shop Actions
  const handleBuyWeapon = async (weaponId: StickmanBuyableWeaponId) => {
    const res = await safeApiFetch<{ success?: boolean; message?: string; profile?: StickmanProfile }>(
      '/api/stickman/buy-weapon',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, weaponId }),
        timeoutMs: 10000
      }
    );
    if (res.ok && res.data?.profile) {
      persistProfileMirror(res.data.profile);
    }
    return {
      success: Boolean(res.ok && res.data?.success),
      message: res.data?.message || 'Gagal membeli senjata.'
    };
  };

  const handleBuyCoins = async (packId: string) => {
    const res = await safeApiFetch<{
      success?: boolean;
      message?: string;
      profile?: StickmanProfile;
      newDiamondBalance?: number;
      isUnlimited?: boolean;
    }>('/api/stickman/buy-coins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, packId }),
      timeoutMs: 10000
    });
    if (res.ok && res.data?.success && res.data.profile) {
      persistProfileMirror(res.data.profile);
      if (typeof res.data.newDiamondBalance === 'number') {
        emitWalletSync(res.data.newDiamondBalance, res.data.isUnlimited);
      }
    }
    return {
      success: Boolean(res.ok && res.data?.success),
      message: res.data?.message || 'Gagal menukar Diamond+ menjadi Koin.'
    };
  };

  const handleEquip = async (weaponId: StickmanWeaponId, skinId: StickmanSkinId | null) => {
    const res = await safeApiFetch<{ success?: boolean; message?: string; profile?: StickmanProfile }>(
      '/api/stickman/equip',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, weaponId, skinId }),
        timeoutMs: 10000
      }
    );
    if (res.ok && res.data?.success && res.data.profile) {
      persistProfileMirror(res.data.profile);
      showToast(res.data.message || 'Perlengkapan dipasang!');
    } else {
      showToast(res.data?.message || 'Tidak dapat memasang perlengkapan.');
    }
  };

  const handleGachaSpin = async (currency: 'coins' | 'diamond'): Promise<GachaSpinResult> => {
    const res = await safeApiFetch<any>('/api/stickman/gacha-spin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, currency }),
      timeoutMs: 10000
    });
    if (res.ok && res.data?.success) {
      if (res.data.profile) {
        persistProfileMirror(normalizeProfile(res.data.profile));
      }
      if (currency === 'diamond' && typeof res.data.newDiamondBalance === 'number') {
        emitWalletSync(res.data.newDiamondBalance, res.data.isUnlimited);
      }
      return res.data as GachaSpinResult;
    }
    return {
      success: false,
      message: res.data?.message || 'Gagal memutar gacha.'
    };
  };

  const handleBuyCharacter = async (characterId: StickmanCharacterId) => {
    const res = await safeApiFetch<{ success?: boolean; message?: string; profile?: StickmanProfile }>(
      '/api/stickman/buy-character',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, characterId }),
        timeoutMs: 10000
      }
    );
    if (res.ok && res.data?.profile) {
      persistProfileMirror(normalizeProfile(res.data.profile));
    }
    return {
      success: Boolean(res.ok && res.data?.success),
      message: res.data?.message || 'Gagal membeli karakter.'
    };
  };

  const handleEquipCharacter = async (characterId: StickmanCharacterId) => {
    const res = await safeApiFetch<{ success?: boolean; message?: string; profile?: StickmanProfile }>(
      '/api/stickman/equip-character',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, characterId }),
        timeoutMs: 10000
      }
    );
    if (res.ok && res.data?.profile) {
      persistProfileMirror(normalizeProfile(res.data.profile));
    }
    return {
      success: Boolean(res.ok && res.data?.success),
      message: res.data?.message || 'Gagal memasang karakter.'
    };
  };

  const handleUpgradeWeapon = async (weaponId: StickmanBuyableWeaponId) => {
    const res = await safeApiFetch<{ success?: boolean; message?: string; profile?: StickmanProfile }>(
      '/api/stickman/upgrade-weapon',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, weaponId }),
        timeoutMs: 10000
      }
    );
    if (res.ok && res.data?.profile) {
      persistProfileMirror(normalizeProfile(res.data.profile));
    }
    return {
      success: Boolean(res.ok && res.data?.success),
      message: res.data?.message || 'Gagal meng-upgrade senjata.'
    };
  };

  const handleMatchComplete = async (won: boolean) => {
    const res = await safeApiFetch<{
      success?: boolean;
      coinsEarned: number;
      xpEarned: number;
      leveledUp: boolean;
      profile?: StickmanProfile;
    }>('/api/stickman/match-result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, won, mode: selectedMode }),
      timeoutMs: 10000
    });
    if (res.ok && res.data?.profile) {
      persistProfileMirror(res.data.profile);
      return {
        coinsEarned: res.data.coinsEarned,
        xpEarned: res.data.xpEarned,
        leveledUp: res.data.leveledUp
      };
    }
    return { coinsEarned: won ? 100 : 50, xpEarned: won ? 60 : 25, leveledUp: false };
  };

  // Lobby Stickman 360 Drag Rotation (supports rotated portrait fallback too!)
  const handleStagePointerDown = (e: React.PointerEvent) => {
    draggingRef.current = { active: true, lastX: e.clientX, lastY: e.clientY };
  };
  const handleStagePointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current.active) return;
    const dx = isPortraitViewport
      ? e.clientY - draggingRef.current.lastY
      : e.clientX - draggingRef.current.lastX;
    draggingRef.current.lastX = e.clientX;
    draggingRef.current.lastY = e.clientY;
    setYawDeg((prev) => {
      let next = prev + dx * 0.9;
      if (next > 180) next -= 360;
      if (next < -180) next += 360;
      return next;
    });
  };
  const handleStagePointerUp = () => {
    draggingRef.current.active = false;
  };

  // Online Matchmaking / Mabar Polling
  useEffect(() => {
    if (!showOnlineModal) return;
    let cancelled = false;

    const loadRooms = async () => {
      const res = await safeApiFetch<{ success?: boolean; rooms?: StickmanRoomData[] }>(
        `/api/stickman/rooms?mode=${encodeURIComponent(selectedMode === 'boss' ? 'boss' : '1v1_online')}`
      );
      if (!cancelled && res.ok && res.data?.success) {
        setOpenRooms(res.data.rooms || []);
      }
    };
    loadRooms();
    const roomTimer = setInterval(loadRooms, 2500);

    return () => {
      cancelled = true;
      clearInterval(roomTimer);
    };
  }, [showOnlineModal, selectedMode]);

  useEffect(() => {
    if (!isSearchingQueue) return;
    let cancelled = false;
    const poll = async () => {
      const res = await safeApiFetch<any>('/api/stickman/matchmaking/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          userName,
          level: profile.level,
          character: profile.equippedCharacter,
          weapon: profile.equippedWeapon,
          skin: profile.equippedSkin,
          mode: selectedMode === 'boss' ? 'boss' : '1v1_online'
        })
      });
      if (cancelled) return;
      if (res.ok && res.data?.matched && res.data.room) {
        setIsSearchingQueue(false);
        setActiveRoom(res.data.room);
        setShowOnlineModal(false);
        setBattleSeed((s) => s + 1);
        setScreen('battle');
      } else if (res.ok && res.data?.queueCount) {
        setQueueCount(res.data.queueCount);
      }
    };
    poll();
    const interval = setInterval(poll, 1600);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isSearchingQueue, userId, userName, profile.level, profile.equippedCharacter, profile.equippedWeapon, profile.equippedSkin, selectedMode]);

  // Poll created waiting room until guest joins
  useEffect(() => {
    if (!showOnlineModal || !activeRoom || activeRoom.status !== 'waiting') return;
    let cancelled = false;
    const interval = setInterval(async () => {
      const res = await safeApiFetch<{ success?: boolean; room?: StickmanRoomData }>(
        `/api/stickman/rooms/${encodeURIComponent(activeRoom.roomId)}`
      );
      if (!cancelled && res.ok && res.data?.room && res.data.room.status === 'playing') {
        setActiveRoom(res.data.room);
        setShowOnlineModal(false);
        setBattleSeed((s) => s + 1);
        setScreen('battle');
      }
    }, 1500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [showOnlineModal, activeRoom]);

  const handleStartButton = () => {
    if (selectedMode === 'duel_ai') {
      setActiveRoom(null);
      setBattleSeed((s) => s + 1);
      setScreen('battle');
    } else {
      setOnlineError(null);
      setActiveRoom(null);
      setIsSearchingQueue(false);
      setShowOnlineModal(true);
    }
  };

  const handleCreateMabarRoom = async () => {
    setOnlineError(null);
    const res = await safeApiFetch<{ success?: boolean; room?: StickmanRoomData; message?: string }>(
      '/api/stickman/rooms/create',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          userName,
          level: profile.level,
          character: profile.equippedCharacter,
          weapon: profile.equippedWeapon,
          skin: profile.equippedSkin,
          mode: selectedMode === 'boss' ? 'boss' : '1v1_online'
        })
      }
    );
    if (res.ok && res.data?.room) {
      setActiveRoom(res.data.room);
    } else {
      setOnlineError(res.data?.message || 'Gagal membuat room.');
    }
  };

  const handleJoinMabarRoom = async (code: string) => {
    if (!code.trim()) return;
    setOnlineError(null);
    const res = await safeApiFetch<{ success?: boolean; room?: StickmanRoomData; message?: string }>(
      '/api/stickman/rooms/join',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: code.trim().toUpperCase(),
          userId,
          userName,
          level: profile.level,
          character: profile.equippedCharacter,
          weapon: profile.equippedWeapon,
          skin: profile.equippedSkin
        })
      }
    );
    if (res.ok && res.data?.room) {
      setActiveRoom(res.data.room);
      setShowOnlineModal(false);
      setBattleSeed((s) => s + 1);
      setScreen('battle');
    } else {
      setOnlineError(res.data?.message || 'Room tidak ditemukan.');
    }
  };

  const unreadMailCount = profile.mail.filter((m) => !m.read).length;

  const equippedLabel = profile.equippedSkin
    ? STICKMAN_SKINS[profile.equippedSkin].name
    : profile.equippedWeapon === 'bare_hands'
    ? 'Tangan Kosong'
    : DEFAULT_WEAPONS[profile.equippedWeapon].name;

  // Enforce landscape layout container even if browser/device is held in portrait
  const containerStyle: React.CSSProperties = isPortraitViewport
    ? {
        position: 'fixed',
        top: 0,
        left: '100vw',
        width: '100dvh',
        height: '100vw',
        transform: 'rotate(90deg)',
        transformOrigin: 'top left',
        zIndex: 10050
      }
    : {
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100dvh',
        zIndex: 10050
      };

  const updateAudioSettings = (patch: Partial<StickmanAudioSettings>) => {
    stickmanAudio.updateSettings(patch);
    setAudioSettings({ ...stickmanAudio.settings });
  };

  const updateLobbyControlItem = (
    id: ControlButtonId,
    patch: Partial<{ xPct: number; yPct: number; scale: number }>
  ) => {
    setControlLayout((prev) => {
      const next: ControlLayoutMap = {
        ...prev,
        [id]: { ...prev[id], ...patch }
      };
      saveControlLayout(userId, next);
      return next;
    });
  };

  const handleEditorPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!controlDragRef.current.id) return;
    let xPct = 50;
    let yPct = 50;
    if (isPortraitViewport) {
      const logicalW = window.innerHeight || 1;
      const logicalH = window.innerWidth || 1;
      xPct = Math.max(5, Math.min(95, (e.clientY / logicalW) * 100));
      yPct = Math.max(12, Math.min(90, ((logicalH - e.clientX) / logicalH) * 100));
    } else if (editorContainerRef.current) {
      const rect = editorContainerRef.current.getBoundingClientRect();
      xPct = Math.max(5, Math.min(95, ((e.clientX - rect.left) / Math.max(1, rect.width)) * 100));
      yPct = Math.max(12, Math.min(90, ((e.clientY - rect.top) / Math.max(1, rect.height)) * 100));
    }
    updateLobbyControlItem(controlDragRef.current.id, { xPct, yPct });
  };

  const handleEditorTouchStart = (id: ControlButtonId, e: React.TouchEvent) => {
    setSelectedControlId(id);
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      controlDragRef.current.pinchStartDist = Math.max(1, dist);
      controlDragRef.current.pinchStartScale = controlLayout[id].scale;
    }
  };

  const handleEditorTouchMove = (id: ControlButtonId, e: React.TouchEvent) => {
    if (e.touches.length !== 2) return;
    const dist = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    );
    const ratio = dist / Math.max(1, controlDragRef.current.pinchStartDist);
    const nextScale = Math.max(0.6, Math.min(1.75, controlDragRef.current.pinchStartScale * ratio));
    updateLobbyControlItem(id, { scale: Number(nextScale.toFixed(2)) });
  };

  return (
    <div
      style={containerStyle}
      onPointerDown={() => stickmanAudio.unlock()}
      className="bg-[#060911] text-white select-none overflow-hidden"
    >
      {/* SPLASH SCREEN (Modern Logo + STICKMAN WAR) */}
      {showSplash && (
        <div
          onClick={() => setShowSplash(false)}
          className="fixed inset-0 z-[130] bg-[#050811] flex flex-col items-center justify-center gap-3 p-4 cursor-pointer"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_35%_50%,rgba(249,115,22,0.28),transparent_55%),radial-gradient(circle_at_68%_50%,rgba(56,189,248,0.28),transparent_55%)] pointer-events-none" />
          <StickmanModernLogo size={108} showTitle subtitle="MEMUAT ARENA..." pulsing />
        </div>
      )}

      {/* NON-BLOCKING SYNC LOADING OVERLAY */}
      {!showSplash && isProfileLoading && (
        <div className="fixed inset-0 z-[125] bg-[#050811]/88 backdrop-blur-sm flex flex-col items-center justify-center gap-2 pointer-events-none">
          <StickmanModernLogo size={76} showTitle subtitle="SINKRONISASI DATA SERVER..." pulsing />
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-[120] px-4 py-1.5 rounded-xl bg-black/90 border border-amber-400/50 text-xs font-bold text-amber-200 shadow-2xl pointer-events-none">
          {toast}
        </div>
      )}

      {screen === 'shop' && (
        <StickmanShopPage
          profile={profile}
          diamondBalance={diamondBalance}
          isOwner={isOwner}
          initialTab={shopInitialTab}
          onBack={() => setScreen('lobby')}
          onBuyWeapon={handleBuyWeapon}
          onBuyCoins={handleBuyCoins}
          onEquipWeapon={(wId) => handleEquip(wId, null)}
        />
      )}

      {screen === 'gacha' && (
        <StickmanGachaPage
          profile={profile}
          diamondBalance={diamondBalance}
          isOwner={isOwner}
          onBack={() => setScreen('lobby')}
          onGoShop={() => {
            setShopInitialTab('weapons');
            setScreen('shop');
          }}
          onEquipCharacter={handleEquipCharacter}
          onSpin={handleGachaSpin}
        />
      )}

      {screen === 'inventory' && (
        <StickmanInventoryPage
          profile={profile}
          onBack={() => setScreen('lobby')}
          onGoShop={() => {
            setShopInitialTab('weapons');
            setScreen('shop');
          }}
          onGoUpgrade={() => setScreen('upgrade')}
          onEquip={handleEquip}
        />
      )}

      {screen === 'character' && (
        <StickmanCharacterPage
          profile={profile}
          onBack={() => setScreen('lobby')}
          onGoGacha={() => setScreen('gacha')}
          onBuyCharacter={handleBuyCharacter}
          onEquipCharacter={handleEquipCharacter}
        />
      )}

      {screen === 'upgrade' && (
        <StickmanUpgradePage
          profile={profile}
          onBack={() => setScreen('lobby')}
          onGoShop={() => {
            setShopInitialTab('weapons');
            setScreen('shop');
          }}
          onUpgradeWeapon={handleUpgradeWeapon}
        />
      )}

      {screen === 'battle' && (
        <StickmanBattleArena
          key={battleSeed}
          mode={selectedMode}
          aiDifficulty={aiDifficulty}
          profile={profile}
          userName={userName}
          onlineRoom={activeRoom}
          isRotated90={isPortraitViewport}
          onMatchComplete={handleMatchComplete}
          onExitToLobby={() => {
            setActiveRoom(null);
            setControlLayout(loadControlLayout(userId));
            setScreen('lobby');
          }}
          onPlayAgain={() => setBattleSeed((s) => s + 1)}
        />
      )}

      {screen === 'lobby' && (
        /* MODERN DARK FIRE CASTLE + FROSTED ICE MOUNTAIN LOBBY */
        <div className="w-full h-full relative flex flex-col justify-between overflow-hidden bg-[#050811]">
          {/* Dual Fire Fortress & Ice Mountain Atmospheric Backdrop */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {/* Deep rich contrasting ambient glow: fiery orange left, glacial cyan right */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_24%_65%,rgba(234,88,12,0.34)_0%,transparent_52%),radial-gradient(ellipse_at_78%_48%,rgba(14,165,233,0.30)_0%,transparent_54%),linear-gradient(180deg,#060913_0%,#0b1120_65%,#04060c_100%)]" />

            {/* Left War Castle + Right Jagged Ice Mountains SVG */}
            <svg viewBox="0 0 1200 500" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
              <defs>
                <linearGradient id="fireCastleGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1e1210" />
                  <stop offset="100%" stopColor="#07050a" />
                </linearGradient>
                <linearGradient id="icePeakGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.48" />
                  <stop offset="45%" stopColor="#0f2942" stopOpacity="0.88" />
                  <stop offset="100%" stopColor="#050811" />
                </linearGradient>
              </defs>

              {/* Ice Mountain Peaks (Right & Center-Right Backdrop) */}
              <polygon points="560,420 710,165 820,305 930,115 1065,280 1160,155 1200,220 1200,500 520,500" fill="url(#icePeakGrad)" />
              <polygon points="930,115 965,255 900,320" fill="#7dd3fc" opacity="0.16" />
              <polygon points="710,165 745,270 660,335" fill="#bae6fd" opacity="0.14" />

              {/* Fiery Ruined War Fortress (Left & Center-Left) */}
              <path
                d="M0 500 L0 215 L45 215 L45 160 L82 160 L82 210 L132 210 L132 135 L178 135 L178 215 L235 215 L235 290 L315 245 L370 310 L540 390 L540 500 Z"
                fill="url(#fireCastleGrad)"
              />
              {/* Glowing Fortress Windows & Embers */}
              <rect x="56" y="182" width="12" height="22" rx="2" fill="#f97316" opacity="0.72" />
              <rect x="148" y="160" width="14" height="28" rx="2" fill="#fb923c" opacity="0.78" />
              <circle cx="240" cy="340" r="3" fill="#fb923c" opacity="0.8" />
              <circle cx="310" cy="295" r="2.2" fill="#fde047" opacity="0.75" />
              <circle cx="880" cy="235" r="2.5" fill="#7dd3fc" opacity="0.7" />
              <circle cx="1010" cy="200" r="2" fill="#bae6fd" opacity="0.75" />
            </svg>

            {/* Arena Stone Platform Floor */}
            <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black via-black/80 to-transparent" />
            <div className="absolute left-1/2 bottom-16 -translate-x-1/2 w-[380px] h-14 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(251,191,36,0.22),rgba(56,189,248,0.12)_55%,transparent_75%)] blur-md" />
          </div>

          {/* TOP BAR (Modern Logo + Koin + Diamond + Setting + Mail + LV Player) */}
          <header className="relative z-20 px-3 py-1.5 bg-gradient-to-b from-black/95 to-black/55 border-b border-white/10 flex items-center justify-between gap-3 shrink-0 min-h-[46px]">
            {/* Left: Back + Coins + Diamond */}
            <div className="flex items-center gap-2 min-w-0 shrink-0">
              <button
                type="button"
                onClick={onExit}
                className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 flex items-center gap-1 text-[11px] font-bold text-white cursor-pointer active:scale-95 transition shrink-0"
                title="Keluar ke Menu Game"
              >
                <ArrowLeft size={14} />
                <span className="hidden sm:inline">Keluar</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShopInitialTab('coins');
                  setScreen('shop');
                }}
                className="px-2 py-1 rounded-lg bg-black/70 border border-amber-400/40 hover:border-amber-300 flex items-center gap-1 cursor-pointer transition shrink-0"
                title="Beli Koin pakai Diamond"
              >
                <Coins size={14} className="text-amber-400" />
                <span className="text-xs font-black tabular-nums text-amber-300">
                  {profile.coins.toLocaleString('id-ID')}
                </span>
                <Plus size={11} className="text-amber-200" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setShopInitialTab('coins');
                  setScreen('shop');
                }}
                className="px-2 py-1 rounded-lg bg-black/70 border border-sky-400/40 hover:border-sky-300 flex items-center gap-1 cursor-pointer transition shrink-0"
                title="Saldo Diamond+ VNJAVA (Klik untuk beli Koin)"
              >
                <Gem size={14} className="text-sky-400" />
                <span className="text-xs font-black tabular-nums text-sky-200">
                  {isOwner ? 'UNLIMITED' : diamondBalance.toLocaleString('id-ID')}
                </span>
              </button>
            </div>

            {/* Center: Modern Logo + STICKMAN WAR */}
            <div className="flex items-center justify-center gap-2 pointer-events-none shrink-0">
              <StickmanModernLogo size={24} />
              <span className="text-xs sm:text-sm font-black tracking-[0.16em] uppercase text-white whitespace-nowrap">
                STICKMAN WAR
              </span>
            </div>

            {/* Right: Setting + Mail + LV Player */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setShowSettings(true)}
                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 flex items-center justify-center text-white cursor-pointer transition"
                title="Pengaturan"
              >
                <Settings size={15} />
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowMail(true);
                  if (unreadMailCount > 0) {
                    safeApiFetch('/api/stickman/mail/read', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ userId, mailId: 'ALL' })
                    }).then((res: any) => {
                      if (res.ok && res.data?.profile) persistProfileMirror(res.data.profile);
                    });
                  }
                }}
                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 flex items-center justify-center text-white cursor-pointer transition relative"
                title="Mail"
              >
                <Mail size={15} />
                {unreadMailCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-amber-400" />
                )}
              </button>

              <div className="px-2.5 py-1 rounded-lg bg-black/75 border border-amber-400/50 flex items-center gap-1.5 shrink-0">
                <div className="w-5 h-5 rounded-full bg-zinc-800 border border-white/25 flex items-center justify-center text-[10px] font-black text-white">
                  {userName.charAt(0).toUpperCase()}
                </div>
                <span className="text-[11px] font-black tracking-wide text-white whitespace-nowrap">
                  LV.{profile.level}
                </span>
              </div>
            </div>
          </header>

          {/* PURE FLEX 3-COLUMN LOBBY (NO ABSOLUTE OVERLAPS) */}
          <div className="relative z-10 flex-1 min-h-0 flex flex-row items-stretch justify-between px-2 sm:px-3 py-2 sm:py-2.5 gap-2 sm:gap-3 overflow-hidden">
            {/* LEFT COLUMN: 5 VERTICAL MENU BUTTONS + NORMAL 120x56 START BUTTON BELOW */}
            <aside className="w-[126px] sm:w-[156px] md:w-[172px] shrink-0 flex flex-col justify-between gap-2 min-h-0">
              <div className="flex-1 min-h-0 flex flex-col gap-1.5 overflow-y-auto pr-0.5">
                <button
                  type="button"
                  onClick={() => setScreen('character')}
                  className="w-full min-h-[34px] sm:min-h-[40px] px-2.5 py-1.5 rounded-xl bg-red-950/75 hover:bg-red-900/80 border border-red-400/45 flex items-center gap-2 text-[11px] font-black uppercase tracking-wide cursor-pointer active:scale-95 transition whitespace-nowrap shrink-0"
                >
                  <User size={14} className="text-red-300 shrink-0" />
                  <span>CHARACTER</span>
                </button>

                <button
                  type="button"
                  onClick={() => setScreen('upgrade')}
                  className="w-full min-h-[34px] sm:min-h-[40px] px-2.5 py-1.5 rounded-xl bg-amber-950/65 hover:bg-amber-900/75 border border-amber-400/40 flex items-center gap-2 text-[11px] font-black uppercase tracking-wide cursor-pointer active:scale-95 transition whitespace-nowrap shrink-0"
                >
                  <ArrowUpCircle size={14} className="text-amber-300 shrink-0" />
                  <span>UPGRADE</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShopInitialTab('weapons');
                    setScreen('shop');
                  }}
                  className="w-full min-h-[34px] sm:min-h-[40px] px-2.5 py-1.5 rounded-xl bg-black/70 hover:bg-white/15 border border-white/20 flex items-center gap-2 text-[11px] font-black uppercase tracking-wide cursor-pointer active:scale-95 transition whitespace-nowrap shrink-0"
                >
                  <ShoppingCart size={14} className="text-amber-300 shrink-0" />
                  <span>SHOP</span>
                </button>

                <button
                  type="button"
                  onClick={() => setScreen('gacha')}
                  className="w-full min-h-[34px] sm:min-h-[40px] px-2.5 py-1.5 rounded-xl bg-black/70 hover:bg-white/15 border border-white/20 flex items-center gap-2 text-[11px] font-black uppercase tracking-wide cursor-pointer active:scale-95 transition whitespace-nowrap shrink-0"
                >
                  <Disc3 size={14} className="text-sky-300 shrink-0" />
                  <span>GACHA</span>
                </button>

                <button
                  type="button"
                  onClick={() => setScreen('inventory')}
                  className="w-full min-h-[34px] sm:min-h-[40px] px-2.5 py-1.5 rounded-xl bg-black/70 hover:bg-white/15 border border-white/20 flex items-center gap-2 text-[11px] font-black uppercase tracking-wide cursor-pointer active:scale-95 transition whitespace-nowrap shrink-0"
                >
                  <Package size={14} className="text-emerald-300 shrink-0" />
                  <span>INVENTORY</span>
                </button>
              </div>

              {/* Normal 120x56 START Button neatly below left navigation */}
              <div className="shrink-0 pt-1 flex justify-center">
                <button
                  type="button"
                  onClick={handleStartButton}
                  className="w-[116px] sm:w-[120px] h-[44px] sm:h-[56px] rounded-xl bg-gradient-to-r from-orange-600 via-amber-500 to-orange-600 hover:brightness-110 border-2 border-amber-200 text-black font-black text-base sm:text-lg italic tracking-wider uppercase shadow-[0_0_20px_rgba(249,115,22,0.55)] cursor-pointer active:scale-95 transition shrink-0"
                >
                  START
                </button>
              </div>
            </aside>

            {/* CENTER STAGE: ROTATABLE STICKMAN + HORIZONTAL WEAPON BAR BELOW FEET */}
            <main className="flex-1 min-w-0 min-h-0 flex flex-col items-center justify-between gap-1.5 py-1">
              <div
                onPointerDown={handleStagePointerDown}
                onPointerMove={handleStagePointerMove}
                onPointerUp={handleStagePointerUp}
                onPointerLeave={handleStagePointerUp}
                className="flex-1 min-h-0 w-full flex items-center justify-center relative cursor-grab active:cursor-grabbing overflow-hidden"
              >
                <LobbyStickmanCanvas
                  yawDeg={yawDeg}
                  weapon={profile.equippedWeapon}
                  skin={profile.equippedSkin}
                  character={profile.equippedCharacter}
                  weaponLevel={
                    profile.equippedWeapon !== 'bare_hands'
                      ? profile.weaponLevels?.[profile.equippedWeapon] || 1
                      : 1
                  }
                  className="w-full h-full max-w-[360px] max-h-full"
                />
              </div>

              {/* Horizontal Responsive Weapon Switcher + Spaced Subtitle */}
              <div className="shrink-0 flex flex-col items-center gap-1 max-w-full">
                <div className="flex flex-wrap items-center justify-center gap-1 bg-black/75 border border-white/15 rounded-xl px-1.5 py-1 max-w-full">
                  <button
                    type="button"
                    onClick={() => handleEquip('bare_hands', null)}
                    className={`px-2 py-1 rounded-lg text-[11px] sm:text-[12px] font-bold whitespace-nowrap shrink-0 cursor-pointer transition ${
                      profile.equippedWeapon === 'bare_hands'
                        ? 'bg-white text-black'
                        : 'text-zinc-300 hover:text-white'
                    }`}
                  >
                    Tangan Kosong
                  </button>
                  {(['sword', 'bow', 'pistol'] as StickmanBuyableWeaponId[]).map((wId) => {
                    const owned = profile.ownedWeapons.includes(wId);
                    const active = profile.equippedWeapon === wId && !profile.equippedSkin;
                    return (
                      <button
                        key={wId}
                        type="button"
                        onClick={() => {
                          if (owned) {
                            handleEquip(wId, null);
                          } else {
                            setShopInitialTab('weapons');
                            setScreen('shop');
                          }
                        }}
                        className={`px-2 py-1 rounded-lg text-[11px] sm:text-[12px] font-bold whitespace-nowrap shrink-0 flex items-center gap-1 cursor-pointer transition ${
                          active
                            ? 'bg-amber-400 text-black'
                            : owned
                            ? 'text-zinc-200 hover:bg-white/10'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                        title={owned ? 'Pakai Senjata Default' : 'Beli di Shop'}
                      >
                        {!owned && <Lock size={10} />}
                        <span>{DEFAULT_WEAPONS[wId].defaultDisplay.replace(' Kayu', '')}</span>
                      </button>
                    );
                  })}
                </div>
                <span className="text-[11px] text-zinc-300 font-bold text-center truncate max-w-full px-2">
                  {CHARACTER_DEFS[profile.equippedCharacter || 'rex'].name} · {equippedLabel} · Geser putar 360°
                </span>
              </div>
            </main>

            {/* RIGHT COLUMN: MODE PERTANDINGAN + SKIN SENJATA (NON-OVERLAPPING SCROLLABLE STACK) */}
            <aside className="w-[208px] sm:w-[252px] md:w-[292px] shrink-0 flex flex-col gap-3 min-h-0 overflow-y-auto pr-0.5">
              {/* CARD 1: MODE PERTANDINGAN */}
              <div className="rounded-xl border border-amber-400/25 bg-black/75 backdrop-blur-md p-3 flex flex-col gap-2 shrink-0">
                <div className="border-b border-white/10 pb-1.5 flex items-center justify-between">
                  <h2 className="text-[11px] font-black tracking-wider uppercase text-amber-200">
                    MODE PERTANDINGAN
                  </h2>
                  <span className="text-[9.5px] font-semibold text-zinc-400">+100 / +50 Koin</span>
                </div>

                {/* Duel vs AI */}
                <div
                  className={`rounded-lg border transition ${
                    selectedMode === 'duel_ai'
                      ? 'bg-amber-950/50 border-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.25)]'
                      : 'bg-white/[0.04] border-white/12 hover:border-white/25'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedMode('duel_ai')}
                    className="w-full p-2.5 text-left flex items-center gap-2.5 cursor-pointer"
                  >
                    <div className="w-8 h-8 rounded-lg bg-black/60 border border-white/15 flex items-center justify-center shrink-0">
                      <Swords size={16} className="text-amber-300" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-black text-white leading-snug">Duel vs AI</p>
                      <p className="text-[10px] text-zinc-300 leading-snug">
                        Easy / Normal / Hard
                      </p>
                    </div>
                  </button>
                  {selectedMode === 'duel_ai' && (
                    <div className="px-2.5 pb-2 grid grid-cols-3 gap-1">
                      {(['easy', 'normal', 'hard'] as AiDifficulty[]).map((diff) => (
                        <button
                          key={diff}
                          type="button"
                          onClick={() => setAiDifficulty(diff)}
                          className={`py-1 rounded text-[9.5px] font-black uppercase cursor-pointer transition ${
                            aiDifficulty === diff
                              ? 'bg-amber-400 text-black'
                              : 'bg-black/60 text-zinc-300 hover:text-white'
                          }`}
                        >
                          {diff}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Petualangan Boss */}
                <button
                  type="button"
                  onClick={() => setSelectedMode('boss')}
                  className={`w-full p-2.5 rounded-lg border text-left flex items-center gap-2.5 transition cursor-pointer ${
                    selectedMode === 'boss'
                      ? 'bg-orange-950/60 border-orange-400 shadow-[0_0_12px_rgba(249,115,22,0.28)]'
                      : 'bg-white/[0.04] border-white/12 hover:border-white/25'
                  }`}
                >
                  <div className="w-8 h-8 rounded-lg bg-black/60 border border-white/15 flex items-center justify-center shrink-0">
                    <Crown size={16} className="text-orange-300" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-black text-white leading-snug">Petualangan Boss</p>
                    <p className="text-[10px] text-zinc-300 leading-snug">Stage &amp; Boss · Mabar</p>
                  </div>
                </button>

                {/* 1vs1 Online */}
                <button
                  type="button"
                  onClick={() => setSelectedMode('1v1_online')}
                  className={`w-full p-2.5 rounded-lg border text-left flex items-center gap-2.5 transition cursor-pointer ${
                    selectedMode === '1v1_online'
                      ? 'bg-sky-950/65 border-sky-400 shadow-[0_0_12px_rgba(56,189,248,0.28)]'
                      : 'bg-white/[0.04] border-white/12 hover:border-white/25'
                  }`}
                >
                  <div className="w-8 h-8 rounded-lg bg-black/60 border border-white/15 flex items-center justify-center shrink-0">
                    <Users size={16} className="text-sky-300" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-black text-white leading-snug">1vs1 Online</p>
                    <p className="text-[10px] text-zinc-300 leading-snug">Real-time PVP · Mabar</p>
                  </div>
                </button>
              </div>

              {/* CARD 2: SKIN SENJATA */}
              <div className="rounded-xl border border-amber-400/25 bg-black/75 backdrop-blur-md p-3 flex flex-col gap-2 shrink-0">
                <div className="border-b border-white/10 pb-1.5">
                  <h2 className="text-[11px] font-black tracking-wider uppercase text-amber-200">
                    SKIN SENJATA
                  </h2>
                </div>

                <div className="flex flex-col gap-2">
                  {LEGENDARY_SKIN_ORDER.map((skinId) => {
                    const skin = STICKMAN_SKINS[skinId];
                    const ownsSkin = profile.ownedSkins.includes(skinId);
                    const ownsWeapon = profile.ownedWeapons.includes(skin.baseWeapon);
                    const isEquipped = profile.equippedSkin === skinId;

                    return (
                      <button
                        key={skinId}
                        type="button"
                        onClick={() => {
                          if (!ownsSkin) {
                            setScreen('gacha');
                          } else if (!ownsWeapon) {
                            showToast(
                              `Beli ${DEFAULT_WEAPONS[skin.baseWeapon].name} di Shop terlebih dahulu!`
                            );
                          } else {
                            handleEquip(skin.baseWeapon, isEquipped ? null : skinId);
                          }
                        }}
                        className={`w-full rounded-lg border p-2 flex items-center gap-2.5 text-left transition cursor-pointer ${
                          isEquipped
                            ? 'bg-amber-950/60 border-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.3)]'
                            : 'bg-white/[0.04] border-white/12 hover:border-white/30'
                        }`}
                      >
                        <div className="w-14 h-9 rounded-md bg-black/50 flex items-center justify-center shrink-0">
                          <WeaponArtwork
                            weapon={skin.baseWeapon}
                            skin={skinId}
                            className="w-12 h-8"
                            animateEffects={true}
                          />
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-black text-white leading-snug truncate">
                            {skin.name}
                          </p>
                          <div className="flex items-center justify-between gap-1 mt-0.5">
                            <span className="text-[8.5px] font-black uppercase text-amber-300">
                              {skin.rarity}
                            </span>
                            <span className="text-[9.5px] font-bold shrink-0">
                              {isEquipped ? (
                                <span className="text-emerald-300 flex items-center gap-0.5">
                                  <Check size={10} /> Dipakai
                                </span>
                              ) : ownsSkin && ownsWeapon ? (
                                <span className="text-amber-200">Pasang</span>
                              ) : ownsSkin && !ownsWeapon ? (
                                <span className="text-rose-300 flex items-center gap-0.5">
                                  <Lock size={9} /> Perlu Senjata
                                </span>
                              ) : (
                                <span className="text-zinc-400 flex items-center gap-0.5">
                                  <Lock size={9} /> Gacha
                                </span>
                              )}
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </aside>
          </div>
        </div>
      )}

      {/* SETTINGS MODAL (Audio Sliders + Atur Tombol + Statistik) */}
      {showSettings && !showControlEditor && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full rounded-2xl border border-white/15 bg-[#0e131f] p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <h3 className="text-sm font-black uppercase text-white">Pengaturan STICKMAN WAR</h3>
              <button
                type="button"
                onClick={() => setShowSettings(false)}
                className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center cursor-pointer"
              >
                <X size={15} />
              </button>
            </div>

            {/* Volume Musik + Efek + Mute */}
            <div className="p-3 rounded-xl bg-black/45 border border-white/10 space-y-2.5 text-xs">
              <div className="space-y-1">
                <div className="flex items-center justify-between font-bold text-zinc-200">
                  <span>Volume Musik</span>
                  <span className="tabular-nums text-amber-300">{audioSettings.musicVolume}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={audioSettings.musicVolume}
                  onChange={(e) => updateAudioSettings({ musicVolume: Number(e.target.value) })}
                  className="w-full accent-amber-400"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between font-bold text-zinc-200">
                  <span>Volume Efek Suara</span>
                  <span className="tabular-nums text-sky-300">{audioSettings.sfxVolume}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={audioSettings.sfxVolume}
                  onChange={(e) => updateAudioSettings({ sfxVolume: Number(e.target.value) })}
                  className="w-full accent-sky-400"
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="font-bold text-zinc-200">Mute Semua Suara</span>
                <button
                  type="button"
                  onClick={() => updateAudioSettings({ muted: !audioSettings.muted })}
                  className={`px-3 py-1 rounded-lg text-xs font-black flex items-center gap-1.5 cursor-pointer ${
                    audioSettings.muted ? 'bg-rose-500 text-white' : 'bg-emerald-500 text-black'
                  }`}
                >
                  {audioSettings.muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                  <span>{audioSettings.muted ? 'MUTE ON' : 'AKTIF'}</span>
                </button>
              </div>
            </div>

            {/* Atur Tombol Pertarungan */}
            <button
              type="button"
              onClick={() => {
                setControlLayout(loadControlLayout(userId));
                setShowControlEditor(true);
              }}
              className="w-full py-2.5 px-3 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/50 text-sky-200 font-black text-xs uppercase flex items-center justify-between cursor-pointer transition"
            >
              <span className="flex items-center gap-2">
                <Move size={15} />
                <span>Atur Tombol (Mode Atur Tombol ON)</span>
              </span>
              <span className="text-[10px] text-amber-300">Geser &amp; Ukuran</span>
            </button>

            <div className="p-3 rounded-xl bg-black/45 border border-white/10 text-xs space-y-1">
              <p className="font-black text-amber-300">Statistik {userName}</p>
              <p className="text-zinc-300">
                Menang: <b>{profile.wins}</b> · Kalah: <b>{profile.losses}</b> · Boss Clear: <b>{profile.bossClears}</b>
              </p>
              <p className="text-zinc-400 text-[11px]">
                Keyboard: A/D gerak, W/Spasi loncat, J serang, K skill, L dash, S tahan.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* MODE ATUR TOMBOL FULLSCREEN OVERLAY (Dari Pengaturan Lobby) */}
      {showControlEditor && (
        <div
          ref={editorContainerRef}
          onPointerMove={handleEditorPointerMove}
          onPointerUp={() => {
            controlDragRef.current.id = null;
          }}
          className="fixed inset-0 z-[70] bg-[#060913]/95 backdrop-blur-md select-none overflow-hidden"
        >
          {/* Top Bar Editor */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-40 w-[94%] max-w-2xl rounded-2xl bg-black/90 border border-amber-400/60 px-4 py-2.5 flex items-center justify-between gap-3 shadow-2xl">
            <div className="flex items-center gap-2 min-w-0">
              <Move size={16} className="text-amber-300 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-black text-amber-200 truncate">
                  Mode Atur Tombol ON · Seret tombol ke mana saja
                </p>
                <p className="text-[10px] text-zinc-400 truncate">
                  Dipilih: <b className="text-white">{controlLayout[selectedControlId].label}</b> (Cubit atau geser slider ukuran)
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <label className="flex items-center gap-2 text-[11px] font-bold text-white">
                <span>Ukuran</span>
                <input
                  type="range"
                  min={0.6}
                  max={1.75}
                  step={0.05}
                  value={controlLayout[selectedControlId].scale}
                  onChange={(e) =>
                    updateLobbyControlItem(selectedControlId, { scale: Number(e.target.value) })
                  }
                  className="w-24 accent-amber-400"
                />
                <span className="tabular-nums text-amber-300 w-9 text-right">
                  {Math.round(controlLayout[selectedControlId].scale * 100)}%
                </span>
              </label>

              <button
                type="button"
                onClick={() => {
                  setControlLayout(DEFAULT_CONTROL_LAYOUT);
                  saveControlLayout(userId, DEFAULT_CONTROL_LAYOUT);
                  showToast('Posisi tombol dikembalikan ke default');
                }}
                className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-[10px] font-bold text-white cursor-pointer"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowControlEditor(false);
                  showToast('Posisi & ukuran tombol tersimpan!');
                }}
                className="px-3 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-black text-[11px] font-black uppercase cursor-pointer"
              >
                Simpan
              </button>
            </div>
          </div>

          {/* Ground preview guide */}
          <div className="absolute inset-x-0 bottom-0 h-20 border-t border-white/10 bg-white/[0.02] pointer-events-none flex items-center justify-center">
            <span className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">
              Area Arena Pertarungan
            </span>
          </div>

          {/* Draggable / Resizable Button Previews */}
          {(
            [
              {
                id: 'moveLeft' as ControlButtonId,
                node: (
                  <div className="w-16 h-16 rounded-2xl bg-black/75 border-2 border-dashed border-sky-400 text-white font-black text-[10px] flex flex-col items-center justify-center">
                    <ChevronLeft size={24} />
                    <span>MUNDUR</span>
                  </div>
                )
              },
              {
                id: 'moveRight' as ControlButtonId,
                node: (
                  <div className="w-16 h-16 rounded-2xl bg-black/75 border-2 border-dashed border-sky-400 text-white font-black text-[10px] flex flex-col items-center justify-center">
                    <ChevronRight size={24} />
                    <span>MAJU</span>
                  </div>
                )
              },
              {
                id: 'jump' as ControlButtonId,
                node: (
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-sky-500 to-blue-700 border-2 border-dashed border-amber-300 text-white font-black text-[10px] flex flex-col items-center justify-center">
                    <ChevronUp size={20} />
                    <span>LONCAT</span>
                  </div>
                )
              },
              {
                id: 'skill1' as ControlButtonId,
                node: (
                  <div className="w-15 h-15 rounded-full bg-red-950/90 border-2 border-dashed border-red-400 text-white font-black text-[8.5px] flex flex-col items-center justify-center">
                    <Zap size={14} className="text-red-300" />
                    <span>SKILL 1</span>
                  </div>
                )
              },
              {
                id: 'skill2' as ControlButtonId,
                node: (
                  <div className="w-15 h-15 rounded-full bg-orange-950/90 border-2 border-dashed border-amber-400 text-white font-black text-[8.5px] flex flex-col items-center justify-center">
                    <Flame size={14} className="text-amber-300" />
                    <span>SKILL 2</span>
                  </div>
                )
              },
              {
                id: 'attack' as ControlButtonId,
                node: (
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-orange-500 to-red-600 border-2 border-dashed border-amber-300 text-white font-black text-[10px] flex flex-col items-center justify-center">
                    <Swords size={20} />
                    <span>SERANG</span>
                  </div>
                )
              },
              {
                id: 'dash' as ControlButtonId,
                node: (
                  <div className="w-14 h-14 rounded-2xl bg-zinc-900/90 border-2 border-dashed border-amber-300 text-white font-black text-[10px] flex flex-col items-center justify-center">
                    <Zap size={16} className="text-amber-300" />
                    <span>DASH</span>
                  </div>
                )
              },
              {
                id: 'skill' as ControlButtonId,
                node: (
                  <div className="w-14 h-14 rounded-2xl bg-amber-950/90 border-2 border-dashed border-amber-300 text-amber-200 font-black text-[9px] flex flex-col items-center justify-center">
                    <Flame size={16} className="text-amber-300" />
                    <span>SENJATA</span>
                  </div>
                )
              },
              {
                id: 'switchWeapon' as ControlButtonId,
                node: (
                  <div className="w-14 h-14 rounded-2xl bg-emerald-950/90 border-2 border-dashed border-amber-300 text-emerald-200 font-black text-[9px] flex flex-col items-center justify-center">
                    <RefreshCw size={15} className="text-emerald-300 mb-0.5" />
                    <span>GANTI</span>
                  </div>
                )
              },
              {
                id: 'block' as ControlButtonId,
                node: (
                  <div className="w-12 h-12 rounded-2xl bg-sky-950/85 border-2 border-dashed border-amber-300 text-sky-200 font-black text-[9px] flex flex-col items-center justify-center">
                    <Shield size={15} />
                    <span>TAHAN</span>
                  </div>
                )
              }
            ] as const
          ).map((item) => {
            const cfg = controlLayout[item.id];
            const selected = selectedControlId === item.id;
            return (
              <div
                key={item.id}
                onPointerDown={() => {
                  controlDragRef.current.id = item.id;
                  setSelectedControlId(item.id);
                }}
                onTouchStart={(e) => handleEditorTouchStart(item.id, e)}
                onTouchMove={(e) => handleEditorTouchMove(item.id, e)}
                style={{
                  left: `${cfg.xPct}%`,
                  top: `${cfg.yPct}%`,
                  transform: `translate(-50%, -50%) scale(${cfg.scale})`
                }}
                className={`absolute touch-none cursor-grab active:cursor-grabbing ${
                  selected ? 'ring-4 ring-amber-400/50 rounded-full' : ''
                }`}
              >
                {item.node}
              </div>
            );
          })}
        </div>
      )}

      {/* MAIL MODAL */}
      {showMail && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full rounded-2xl border border-white/15 bg-[#0e131f] p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <h3 className="text-sm font-black uppercase text-white">Kotak Surat</h3>
              <button
                type="button"
                onClick={() => setShowMail(false)}
                className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center cursor-pointer"
              >
                <X size={15} />
              </button>
            </div>
            <div className="max-h-56 overflow-y-auto space-y-2">
              {profile.mail.map((m) => (
                <div
                  key={m.id}
                  className="p-3 rounded-xl bg-black/50 border border-white/10 space-y-1"
                >
                  <p className="text-xs font-black text-amber-300">{m.title}</p>
                  <p className="text-[11px] text-zinc-300 leading-relaxed">{m.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ONLINE 1VS1 & MABAR BOSS MODAL */}
      {showOnlineModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-lg w-full rounded-2xl border border-sky-400/35 bg-[#0b101b] p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <div>
                <h3 className="text-sm font-black uppercase text-sky-300">
                  {selectedMode === '1v1_online'
                    ? '1VS1 ONLINE · MATCHMAKING & MABAR'
                    : 'PETUALANGAN BOSS · SOLO ATAU MABAR'}
                </h3>
                <p className="text-[10px] text-zinc-400">
                  Main dengan teman lewat Kode Room Mabar atau cari pemain acak
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsSearchingQueue(false);
                  safeApiFetch('/api/stickman/matchmaking/cancel', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId })
                  });
                  setShowOnlineModal(false);
                }}
                className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center cursor-pointer"
              >
                <X size={15} />
              </button>
            </div>

            {onlineError && (
              <div className="px-3 py-1.5 rounded-lg bg-rose-950/70 border border-rose-500/40 text-xs font-bold text-rose-200">
                {onlineError}
              </div>
            )}

            {isSearchingQueue ? (
              <div className="py-5 text-center space-y-2.5">
                <div className="flex justify-center">
                  <StickmanModernLogo size={54} pulsing />
                </div>
                <p className="text-sm font-black text-white">
                  Mencari {selectedMode === '1v1_online' ? 'Lawan Online' : 'Rekan Mabar'}...
                </p>
                <p className="text-xs text-zinc-400">Pemain dalam antrean: {queueCount}</p>
                <button
                  type="button"
                  onClick={() => {
                    setIsSearchingQueue(false);
                    safeApiFetch('/api/stickman/matchmaking/cancel', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ userId })
                    });
                  }}
                  className="px-4 py-1.5 rounded-lg bg-white/10 text-xs font-bold text-white cursor-pointer"
                >
                  Batalkan
                </button>
              </div>
            ) : activeRoom && activeRoom.status === 'waiting' ? (
              <div className="py-4 text-center space-y-3">
                <p className="text-xs text-zinc-300">Bagikan kode room ini ke teman untuk Mabar:</p>
                <div className="flex items-center justify-center gap-2">
                  <span className="px-4 py-2 rounded-xl bg-black border border-amber-400/50 text-lg font-black font-mono text-amber-300">
                    {activeRoom.roomId}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText?.(activeRoom.roomId);
                      showToast('Kode room disalin!');
                    }}
                    className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white cursor-pointer"
                  >
                    <Copy size={16} />
                  </button>
                </div>
                <p className="text-[11px] text-sky-300 flex items-center justify-center gap-1.5">
                  <RefreshCw size={12} className="animate-spin" />
                  <span>Menunggu teman bergabung...</span>
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  {selectedMode === 'boss' && (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveRoom(null);
                        setShowOnlineModal(false);
                        setBattleSeed((s) => s + 1);
                        setScreen('battle');
                      }}
                      className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs uppercase cursor-pointer"
                    >
                      Main Solo (Sendiri)
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsSearchingQueue(true)}
                    className="w-full py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-black font-black text-xs uppercase cursor-pointer"
                  >
                    Random Matchmaking
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateMabarRoom}
                    className="w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-black text-xs uppercase cursor-pointer"
                  >
                    Buat Room Mabar
                  </button>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={joinCodeInput}
                      onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                      placeholder="Kode MABAR-XXXX"
                      className="flex-1 min-w-0 px-2.5 py-2 rounded-lg bg-black/70 border border-white/20 text-xs font-mono text-white outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleJoinMabarRoom(joinCodeInput)}
                      className="px-3 py-2 rounded-lg bg-emerald-500 text-black font-black text-xs uppercase cursor-pointer shrink-0"
                    >
                      Gabung
                    </button>
                  </div>

                  <div className="max-h-28 overflow-y-auto space-y-1">
                    {openRooms.length === 0 ? (
                      <p className="text-[10px] text-zinc-500 text-center py-3">
                        Belum ada room terbuka
                      </p>
                    ) : (
                      openRooms.map((r) => (
                        <button
                          key={r.roomId}
                          type="button"
                          onClick={() => handleJoinMabarRoom(r.roomId)}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-black/60 hover:bg-white/10 border border-white/10 flex items-center justify-between text-[11px] cursor-pointer"
                        >
                          <span className="font-bold text-white truncate">{r.hostName}</span>
                          <span className="font-mono text-amber-300 shrink-0">{r.roomId}</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
