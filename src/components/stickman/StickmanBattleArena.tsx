import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Coins,
  Flame,
  Move,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Shield,
  SlidersHorizontal,
  Swords,
  Volume2,
  VolumeX,
  Zap
} from 'lucide-react';
import {
  CHARACTER_DEFS,
  DEFAULT_CONTROL_LAYOUT,
  DEFAULT_WEAPONS,
  getWeaponCombatDamage,
  loadControlLayout,
  saveControlLayout,
  STICKMAN_SKINS,
  stickmanAudio,
  type AiDifficulty,
  type ControlButtonId,
  type ControlLayoutMap,
  type StickmanBuyableWeaponId,
  type StickmanCharacterId,
  type StickmanMatchMode,
  type StickmanProfile,
  type StickmanSkinId,
  type StickmanWeaponId
} from './stickmanTypes';
import type { StickmanAudioSettings } from './stickmanAudio';
import { getApiBaseUrl } from '../../lib/apiBase';

interface StickmanBattleArenaProps {
  mode: StickmanMatchMode;
  aiDifficulty: AiDifficulty;
  profile: StickmanProfile;
  userName: string;
  onlineRoom: {
    roomId: string;
    mode: '1v1_online' | 'boss';
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
  } | null;
  isRotated90?: boolean;
  onMatchComplete: (won: boolean) => Promise<{ coinsEarned: number; xpEarned: number; leveledUp: boolean }>;
  onExitToLobby: () => void;
  onPlayAgain: () => void;
}

interface ShadowVanishStep {
  delay: number;
  side: 1 | -1;
}

interface FighterEntity {
  id: string;
  name: string;
  team: 'player' | 'enemy';
  isBoss?: boolean;
  character: StickmanCharacterId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  hp: number;
  maxHp: number;
  weapon: StickmanWeaponId;
  skin: StickmanSkinId | null;
  weaponLevels?: Partial<Record<StickmanBuyableWeaponId, number>>;
  attackTimer: number;
  attackDuration: number;
  attackCooldown: number;
  skillCooldown: number;
  skill1Cooldown: number;
  skill1MaxCooldown: number;
  skill2Cooldown: number;
  skill2MaxCooldown: number;
  dashTimer: number;
  dashCooldown: number;
  blocking: boolean;
  hitFlash: number;
  slowTimer: number;
  stunTimer: number;
  invulnerableTimer: number;
  shieldTimer: number;
  shieldReduction: number;
  shieldReflect: number;
  burnTimer: number;
  burnDps: number;
  dragonFormTimer: number;
  dragonBreathTick: number;
  shadowVanishQueue: ShadowVanishStep[];
  shadowVanishTargetId?: string;
  scale: number;
  squashX: number;
  squashY: number;
  wasAirborne: boolean;
  runPhase: number;
  aiThinkTimer: number;
}

interface ProjectileEntity {
  id: string;
  ownerId: string;
  team: 'player' | 'enemy';
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  kind:
    | 'wood_arrow'
    | 'fire_arrow'
    | 'rimba_arrow'
    | 'shadow_rain_arrow'
    | 'wood_bullet'
    | 'ice_dragon'
    | 'shadow_bullet'
    | 'ice_spear'
    | 'boss_fireball';
  life: number;
  pierce?: boolean;
  slowFrames?: number;
}

interface BlizzardZone {
  ownerTeam: 'player' | 'enemy';
  x: number;
  timer: number;
}

interface ParticleEntity {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  colorCore: string;
  colorEdge: string;
  ring?: boolean;
  glow?: boolean;
}

interface SlashArc {
  x: number;
  y: number;
  facing: 1 | -1;
  life: number;
  maxLife: number;
  radius: number;
  style: 'wood' | 'fire_water' | 'steel' | 'fist' | 'boss' | 'van_crimson' | 'kira_shadow' | 'earth_slam';
}

const ARENA_W = 1280;
const ARENA_H = 586;
const GROUND_Y = 492;
const GRAVITY = 0.88;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Circular SVG Cooldown Button Helper
 */
const CooldownRing: React.FC<{ progress: number; color: string }> = ({ progress, color }) => {
  const clamped = Math.max(0, Math.min(1, progress));
  const r = 24;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - clamped);
  return (
    <svg viewBox="0 0 56 56" className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none">
      <circle cx="28" cy="28" r={r} stroke="rgba(255,255,255,0.14)" strokeWidth="3.5" fill="none" />
      <circle
        cx="28"
        cy="28"
        r={r}
        stroke={color}
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
        fill="none"
      />
    </svg>
  );
};

export const StickmanBattleArena: React.FC<StickmanBattleArenaProps> = ({
  mode,
  aiDifficulty,
  profile,
  userName,
  onlineRoom,
  isRotated90 = false,
  onMatchComplete,
  onExitToLobby,
  onPlayAgain
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const playerCharId: StickmanCharacterId = profile.equippedCharacter || 'rex';
  const playerCharDef = CHARACTER_DEFS[playerCharId];

  const [hudState, setHudState] = useState({
    playerHp: playerCharDef.hp,
    playerMaxHp: playerCharDef.hp,
    enemyHp: 120,
    enemyMaxHp: 120,
    enemyName: 'Lawan',
    allyHp: 0,
    allyMaxHp: 0,
    allyName: '',
    stage: 1,
    skillReadyPct: 100,
    dashReadyPct: 100,
    skill1Pct: 100,
    skill1SecLeft: 0,
    skill2Pct: 100,
    skill2SecLeft: 0,
    dragonActiveSec: 0
  });

  const [isPaused, setIsPaused] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'main' | 'audio'>('main');
  const [isEditControls, setIsEditControls] = useState(false);
  const [selectedControlId, setSelectedControlId] = useState<ControlButtonId>('jump');
  const [controlLayout, setControlLayout] = useState<ControlLayoutMap>(() =>
    loadControlLayout(profile.userId)
  );
  const [audioState, setAudioState] = useState<StickmanAudioSettings>(() => ({
    ...stickmanAudio.settings
  }));

  const [activeWeaponLabel, setActiveWeaponLabel] = useState<string>(() =>
    profile.equippedSkin
      ? STICKMAN_SKINS[profile.equippedSkin].name
      : profile.equippedWeapon === 'bare_hands'
      ? 'Tangan Kosong'
      : `${DEFAULT_WEAPONS[profile.equippedWeapon].defaultDisplay} Lv.${profile.weaponLevels?.[profile.equippedWeapon] || 1}`
  );
  const [switchBanner, setSwitchBanner] = useState<string | null>(null);

  const [matchResult, setMatchResult] = useState<{
    won: boolean;
    coinsEarned: number;
    xpEarned: number;
    leveledUp: boolean;
  } | null>(null);

  // Button layout drag & pinch ref
  const btnDragRef = useRef<{
    id: ControlButtonId | null;
    pinchStartDist: number;
    pinchStartScale: number;
  }>({
    id: null,
    pinchStartDist: 0,
    pinchStartScale: 1
  });

  // Live player loadout ref for instant mid-battle weapon switching
  const loadoutQueueRef = useRef<Array<{ weapon: StickmanWeaponId; skin: StickmanSkinId | null; label: string }>>([]);
  const loadoutIndexRef = useRef<number>(0);
  const switchLoadoutPendingRef = useRef<{ weapon: StickmanWeaponId; skin: StickmanSkinId | null } | null>(null);

  useEffect(() => {
    const pickBestSkin = (wId: StickmanWeaponId): StickmanSkinId | null => {
      if (wId === 'bare_hands') return null;
      if (profile.equippedSkin && STICKMAN_SKINS[profile.equippedSkin].baseWeapon === wId) {
        return profile.equippedSkin;
      }
      const priority: StickmanSkinId[] = ['pedang_api_sayap', 'panah_api', 'tembakan_naga_es', 'pedang_baja', 'panah_rimba', 'pistol_bayangan'];
      for (const s of priority) {
        if (profile.ownedSkins.includes(s) && STICKMAN_SKINS[s].baseWeapon === wId) {
          return s;
        }
      }
      return null;
    };

    const list: Array<{ weapon: StickmanWeaponId; skin: StickmanSkinId | null; label: string }> = [
      { weapon: 'bare_hands', skin: null, label: 'Tangan Kosong' }
    ];
    profile.ownedWeapons.forEach((wId) => {
      const sk = pickBestSkin(wId);
      const lv = profile.weaponLevels?.[wId] || 1;
      list.push({
        weapon: wId,
        skin: sk,
        label: sk ? STICKMAN_SKINS[sk].name : `${DEFAULT_WEAPONS[wId].defaultDisplay} Lv.${lv}`
      });
    });

    loadoutQueueRef.current = list;
    const idx = list.findIndex((item) => item.weapon === profile.equippedWeapon);
    loadoutIndexRef.current = idx >= 0 ? idx : 0;
  }, [profile.ownedWeapons, profile.ownedSkins, profile.equippedWeapon, profile.equippedSkin, profile.weaponLevels]);

  const handleCycleWeapon = () => {
    stickmanAudio.unlock();
    const list = loadoutQueueRef.current;
    if (list.length <= 1) {
      setSwitchBanner('Beli Pedang / Panah / Pistol di Shop untuk ganti senjata!');
      setTimeout(() => setSwitchBanner(null), 1900);
      return;
    }
    const nextIdx = (loadoutIndexRef.current + 1) % list.length;
    loadoutIndexRef.current = nextIdx;
    const chosen = list[nextIdx];
    switchLoadoutPendingRef.current = { weapon: chosen.weapon, skin: chosen.skin };
    setActiveWeaponLabel(chosen.label);
    stickmanAudio.playGachaTick();
    setSwitchBanner(`Senjata: ${chosen.label} (Skill Karakter tetap aktif!)`);
    setTimeout(() => setSwitchBanner(null), 1400);
  };

  const keysRef = useRef<{
    left: boolean;
    right: boolean;
    jump: boolean;
    attack: boolean;
    skill: boolean;
    skill1: boolean;
    skill2: boolean;
    dash: boolean;
    block: boolean;
  }>({
    left: false,
    right: false,
    jump: false,
    attack: false,
    skill: false,
    skill1: false,
    skill2: false,
    dash: false,
    block: false
  });

  const pausedRef = useRef(false);
  pausedRef.current = isPaused || isEditControls;
  const finishedRef = useRef(false);

  const wsRef = useRef<WebSocket | null>(null);
  const remotePeerStateRef = useRef<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    facing: 1 | -1;
    hp: number;
    character?: StickmanCharacterId;
    weapon?: StickmanWeaponId;
    skin?: StickmanSkinId | null;
    attackTimer: number;
    blocking: boolean;
    dashTimer: number;
    dragonFormTimer?: number;
    invulnerableTimer?: number;
    shieldTimer?: number;
    pendingAttack?: { type: 'normal' | 'skill' | 'skill1' | 'skill2'; ts: number };
    bossHp?: number;
  } | null>(null);

  const isOnlineHost = Boolean(
    onlineRoom && onlineRoom.hostId.toUpperCase() === profile.userId.toUpperCase()
  );

  useEffect(() => {
    if (!onlineRoom) return;
    let ws: WebSocket | null = null;
    try {
      const base = getApiBaseUrl();
      const parsed = base ? new URL(base) : new URL(window.location.href);
      const wsProto = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${wsProto}//${parsed.host}/ws?userId=${encodeURIComponent(profile.userId)}`;
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        ws?.send(
          JSON.stringify({
            type: 'stickman-room-join',
            roomId: onlineRoom.roomId,
            userId: profile.userId
          })
        );
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg?.type === 'stickman-sync' && msg.senderId !== profile.userId && msg.state) {
            remotePeerStateRef.current = msg.state;
          }
        } catch {}
      };
    } catch {}

    return () => {
      try {
        ws?.send(
          JSON.stringify({
            type: 'stickman-room-leave',
            roomId: onlineRoom.roomId
          })
        );
        ws?.close();
      } catch {}
      wsRef.current = null;
    };
  }, [onlineRoom?.roomId, profile.userId]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'a' || k === 'arrowleft') keysRef.current.left = true;
      if (k === 'd' || k === 'arrowright') keysRef.current.right = true;
      if (k === 'w' || k === 'arrowup' || k === ' ') keysRef.current.jump = true;
      if (k === 'j' || k === 'z') keysRef.current.attack = true;
      if (k === 'k' || k === 'x') keysRef.current.skill = true;
      if (k === '1' || k === 'u') keysRef.current.skill1 = true;
      if (k === '2' || k === 'i') keysRef.current.skill2 = true;
      if (k === 'l' || k === 'shift') keysRef.current.dash = true;
      if (k === 's' || k === 'arrowdown') keysRef.current.block = true;
      if (k === 'q' || k === 'e') handleCycleWeapon();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'a' || k === 'arrowleft') keysRef.current.left = false;
      if (k === 'd' || k === 'arrowright') keysRef.current.right = false;
      if (k === 'w' || k === 'arrowup' || k === ' ') keysRef.current.jump = false;
      if (k === 'j' || k === 'z') keysRef.current.attack = false;
      if (k === 'k' || k === 'x') keysRef.current.skill = false;
      if (k === '1' || k === 'u') keysRef.current.skill1 = false;
      if (k === '2' || k === 'i') keysRef.current.skill2 = false;
      if (k === 'l' || k === 'shift') keysRef.current.dash = false;
      if (k === 's' || k === 'arrowdown') keysRef.current.block = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  // Main 60FPS Game Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    finishedRef.current = false;

    const pCharId: StickmanCharacterId = profile.equippedCharacter || 'rex';
    const pCharDef = CHARACTER_DEFS[pCharId];
    const playerStartX = onlineRoom ? (isOnlineHost ? 250 : 1030) : 250;
    const playerFacing: 1 | -1 = onlineRoom ? (isOnlineHost ? 1 : -1) : 1;

    const makeFighter = (
      overrides: Partial<FighterEntity> & { id: string; name: string; team: 'player' | 'enemy' }
    ): FighterEntity => {
      const cId: StickmanCharacterId = overrides.character || 'rex';
      const cDef = CHARACTER_DEFS[cId];
      return {
        x: 250,
        y: GROUND_Y,
        vx: 0,
        vy: 0,
        facing: 1,
        hp: cDef.hp,
        maxHp: cDef.hp,
        weapon: 'bare_hands',
        skin: null,
        attackTimer: 0,
        attackDuration: 18,
        attackCooldown: 0,
        skillCooldown: 0,
        skill1Cooldown: 0,
        skill1MaxCooldown: cDef.skill1.cooldownSec * 60,
        skill2Cooldown: 0,
        skill2MaxCooldown: cDef.skill2.cooldownSec * 60,
        dashTimer: 0,
        dashCooldown: 0,
        blocking: false,
        hitFlash: 0,
        slowTimer: 0,
        stunTimer: 0,
        invulnerableTimer: 0,
        shieldTimer: 0,
        shieldReduction: 0,
        shieldReflect: 0,
        burnTimer: 0,
        burnDps: 0,
        dragonFormTimer: 0,
        dragonBreathTick: 0,
        shadowVanishQueue: [],
        scale: cDef.scale,
        squashX: 1,
        squashY: 1,
        wasAirborne: false,
        runPhase: 0,
        aiThinkTimer: 0,
        ...overrides,
        character: cId
      };
    };

    const player = makeFighter({
      id: profile.userId,
      name: userName || 'Player',
      team: 'player',
      character: pCharId,
      x: playerStartX,
      facing: playerFacing,
      hp: pCharDef.hp,
      maxHp: pCharDef.hp,
      weapon: profile.equippedWeapon,
      skin: profile.equippedSkin,
      weaponLevels: profile.weaponLevels
    });

    let ally: FighterEntity | null = null;
    const enemies: FighterEntity[] = [];
    const blizzards: BlizzardZone[] = [];
    let currentStage = 1;

    const spawnBossStage = (stageNum: number) => {
      enemies.length = 0;
      if (stageNum === 1) {
        enemies.push(
          makeFighter({
            id: 'minion_1',
            name: 'Prajurit Kayu 1',
            team: 'enemy',
            character: 'rex',
            x: 910,
            facing: -1,
            hp: 80,
            maxHp: 80,
            weapon: 'sword',
            attackCooldown: 30,
            scale: 0.96
          }),
          makeFighter({
            id: 'minion_2',
            name: 'Prajurit Kayu 2',
            team: 'enemy',
            character: 'rex',
            x: 1090,
            facing: -1,
            hp: 80,
            maxHp: 80,
            weapon: 'bare_hands',
            attackCooldown: 40,
            scale: 0.96,
            aiThinkTimer: 15
          })
        );
      } else if (stageNum === 2) {
        enemies.push(
          makeFighter({
            id: 'guard_1',
            name: 'Penjaga Kira',
            team: 'enemy',
            character: 'kira',
            x: 1050,
            facing: -1,
            hp: 115,
            maxHp: 115,
            weapon: 'bow',
            skin: 'panah_rimba',
            attackCooldown: 35
          }),
          makeFighter({
            id: 'guard_2',
            name: 'Penjaga Bruno',
            team: 'enemy',
            character: 'bruno',
            x: 880,
            facing: -1,
            hp: 150,
            maxHp: 150,
            weapon: 'sword',
            skin: 'pedang_baja',
            attackCooldown: 30,
            aiThinkTimer: 10
          })
        );
      } else {
        const bossHp = onlineRoom ? 560 : 420;
        enemies.push(
          makeFighter({
            id: 'final_boss',
            name: 'BOSS · RAJA KEGELAPAN',
            team: 'enemy',
            character: 'bruno',
            isBoss: true,
            x: 980,
            facing: -1,
            hp: bossHp,
            maxHp: bossHp,
            weapon: 'sword',
            skin: 'pedang_api_sayap',
            attackCooldown: 35,
            skillCooldown: 100,
            scale: 1.5
          })
        );
      }
    };

    if (mode === '1v1_online' && onlineRoom) {
      const oppName = isOnlineHost
        ? onlineRoom.guestName || 'Lawan Online'
        : onlineRoom.hostName || 'Lawan Online';
      const oppChar = (isOnlineHost ? onlineRoom.guestCharacter : onlineRoom.hostCharacter) || 'rex';
      const oppCharDef = CHARACTER_DEFS[oppChar];
      const oppWeapon = (isOnlineHost ? onlineRoom.guestWeapon : onlineRoom.hostWeapon) || 'bare_hands';
      const oppSkin = (isOnlineHost ? onlineRoom.guestSkin : onlineRoom.hostSkin) || null;

      enemies.push(
        makeFighter({
          id: isOnlineHost ? onlineRoom.guestId || 'opp' : onlineRoom.hostId,
          name: oppName,
          team: 'enemy',
          character: oppChar,
          x: isOnlineHost ? 1030 : 250,
          facing: isOnlineHost ? -1 : 1,
          hp: oppCharDef.hp,
          maxHp: oppCharDef.hp,
          weapon: oppWeapon,
          skin: oppSkin
        })
      );
    } else if (mode === 'boss') {
      if (onlineRoom) {
        const allyName = isOnlineHost ? onlineRoom.guestName || 'Rekan' : onlineRoom.hostName || 'Rekan';
        const allyChar = (isOnlineHost ? onlineRoom.guestCharacter : onlineRoom.hostCharacter) || 'rex';
        const allyCharDef = CHARACTER_DEFS[allyChar];
        const allyWeapon = (isOnlineHost ? onlineRoom.guestWeapon : onlineRoom.hostWeapon) || 'bare_hands';
        const allySkin = (isOnlineHost ? onlineRoom.guestSkin : onlineRoom.hostSkin) || null;
        ally = makeFighter({
          id: isOnlineHost ? onlineRoom.guestId || 'ally' : onlineRoom.hostId,
          name: allyName,
          team: 'player',
          character: allyChar,
          x: 340,
          facing: 1,
          hp: allyCharDef.hp,
          maxHp: allyCharDef.hp,
          weapon: allyWeapon,
          skin: allySkin
        });
      }
      spawnBossStage(1);
    } else {
      const aiChar: StickmanCharacterId =
        aiDifficulty === 'easy' ? 'rex' : aiDifficulty === 'normal' ? 'kira' : 'frost';
      const aiHp = aiDifficulty === 'easy' ? 110 : aiDifficulty === 'normal' ? 150 : 210;
      const aiWeapon: StickmanWeaponId =
        aiDifficulty === 'easy' ? 'sword' : aiDifficulty === 'normal' ? 'bow' : 'pistol';
      const aiSkin: StickmanSkinId | null =
        aiDifficulty === 'easy'
          ? null
          : aiDifficulty === 'normal'
          ? 'panah_rimba'
          : (['tembakan_naga_es', 'panah_api', 'pedang_api_sayap'][
              Math.floor(Math.random() * 3)
            ] as StickmanSkinId);
      const effectiveAiWeapon: StickmanWeaponId =
        aiSkin === 'pedang_api_sayap'
          ? 'sword'
          : aiSkin === 'panah_api'
          ? 'bow'
          : aiSkin === 'tembakan_naga_es'
          ? 'pistol'
          : aiWeapon;

      enemies.push(
        makeFighter({
          id: 'ai_bot',
          name: `${CHARACTER_DEFS[aiChar].name} AI (${aiDifficulty.toUpperCase()})`,
          team: 'enemy',
          character: aiChar,
          x: 1000,
          facing: -1,
          hp: aiHp,
          maxHp: aiHp,
          weapon: effectiveAiWeapon,
          skin: aiSkin,
          attackCooldown: 25,
          skillCooldown: 100
        })
      );
    }

    const projectiles: ProjectileEntity[] = [];
    const particles: ParticleEntity[] = [];
    const slashes: SlashArc[] = [];
    let lastRemoteAttackTs = 0;
    let lastAttackPayload: { type: 'normal' | 'skill' | 'skill1' | 'skill2'; ts: number } | undefined;
    let frameCount = 0;
    let shakeMag = 0;
    let stageBannerTimer = 95;
    let stageBannerText = mode === 'boss' ? 'STAGE 1 · PRAJURIT KAYU' : `${pCharDef.name} SIAP BERTARUNG!`;

    const triggerShake = (amount: number) => {
      shakeMag = Math.min(18, Math.max(shakeMag, amount));
    };

    const spawnBurst = (
      x: number,
      y: number,
      count: number,
      coreColor: string,
      edgeColor: string,
      speed = 5,
      size = 7,
      ringColor?: string,
      glow = true
    ) => {
      if (ringColor) {
        particles.push({
          x,
          y,
          vx: 0,
          vy: 0,
          life: 0,
          maxLife: 18,
          size: 16,
          colorCore: ringColor,
          colorEdge: ringColor,
          ring: true,
          glow
        });
      }
      for (let i = 0; i < count; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = (0.4 + Math.random() * 0.9) * speed;
        particles.push({
          x,
          y,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd - 1.3,
          life: 0,
          maxLife: 18 + Math.random() * 14,
          size: size * (0.7 + Math.random() * 0.75),
          colorCore: coreColor,
          colorEdge: edgeColor,
          glow
        });
      }
    };

    const applyDamageToTarget = (
      attacker: FighterEntity | null,
      target: FighterEntity,
      rawDmg: number,
      options?: { isMelee?: boolean; bypassBlock?: boolean; burnSec?: number; burnDps?: number }
    ) => {
      if (target.hp <= 0 || target.invulnerableTimer > 0) return 0;
      let dmg = rawDmg;
      if (!options?.bypassBlock) {
        if (target.shieldTimer > 0) {
          dmg = Math.max(1, Math.round(dmg * (1 - target.shieldReduction)));
          if (options?.isMelee && attacker && target.shieldReflect > 0 && attacker.invulnerableTimer <= 0) {
            attacker.hp = Math.max(0, attacker.hp - target.shieldReflect);
            attacker.hitFlash = 6;
          }
        } else if (target.blocking) {
          dmg = Math.round(dmg * 0.35);
        }
      }
      target.hp = Math.max(0, target.hp - dmg);
      target.hitFlash = 10;
      target.squashX = 0.82;
      target.squashY = 1.18;
      if (options?.burnSec && options?.burnDps) {
        target.burnTimer = Math.max(target.burnTimer, options.burnSec * 60);
        target.burnDps = Math.max(target.burnDps, options.burnDps);
      }
      return dmg;
    };

    const performWeaponAttack = (actor: FighterEntity, isSkill: boolean) => {
      if (actor.blocking || actor.stunTimer > 0 || actor.dragonFormTimer > 0) return;
      if (isSkill) {
        if (actor.skillCooldown > 0) return;
        actor.skillCooldown = 190;
      } else {
        if (actor.attackCooldown > 0) return;
        actor.attackCooldown =
          actor.weapon === 'pistol'
            ? 20
            : actor.weapon === 'bare_hands'
            ? 17
            : actor.weapon === 'sword'
            ? 23
            : 27;
      }

      actor.attackDuration = isSkill ? 20 : 16;
      actor.attackTimer = actor.attackDuration;
      actor.squashX = 1.15;
      actor.squashY = 0.88;

      const targets = actor.team === 'player' ? enemies : [player, ...(ally ? [ally] : [])];
      const baseDmg = getWeaponCombatDamage(actor.weapon, actor.skin, actor.weaponLevels);

      if (actor.weapon === 'bare_hands' || actor.weapon === 'sword') {
        const isFireWing = actor.skin === 'pedang_api_sayap';
        const isSteel = actor.skin === 'pedang_baja';
        const reach =
          (actor.weapon === 'sword' ? (isFireWing ? 158 : 126) : 90) *
          actor.scale *
          (isSkill ? 1.25 : 1);
        const dmg = Math.round(baseDmg * (isSkill ? 1.45 : 1) * (actor.isBoss ? 1.1 : 1));

        slashes.push({
          x: actor.x + actor.facing * 32 * actor.scale,
          y: actor.y - 64 * actor.scale,
          facing: actor.facing,
          life: 0,
          maxLife: 15,
          radius: reach * 0.65,
          style: actor.isBoss
            ? 'boss'
            : isFireWing
            ? 'fire_water'
            : isSteel
            ? 'steel'
            : actor.weapon === 'sword'
            ? 'wood'
            : 'fist'
        });

        if (actor.weapon === 'sword') stickmanAudio.playSwordSwing(isFireWing);
        else stickmanAudio.playPunchSwing();

        if (isFireWing) {
          spawnBurst(actor.x + actor.facing * 74, actor.y - 62, isSkill ? 18 : 10, '#fde047', 'rgba(239,68,68,0)', 6.5, 9, isSkill ? '#f97316' : undefined);
          spawnBurst(actor.x + actor.facing * 68, actor.y - 54, isSkill ? 10 : 6, '#7dd3fc', 'rgba(2,132,199,0)', 4.5, 7);
        }

        if (isSkill) actor.vx = actor.facing * 12;

        let hitAny = false;
        for (const t of targets) {
          if (t.hp <= 0 || t.invulnerableTimer > 0) continue;
          const dx = (t.x - actor.x) * actor.facing;
          const dy = Math.abs(t.y - actor.y);
          if (dx >= -28 && dx <= reach && dy < 110 * actor.scale) {
            hitAny = true;
            applyDamageToTarget(actor, t, dmg, {
              isMelee: true,
              burnSec: isFireWing ? 3 : 0,
              burnDps: isFireWing ? 5 : 0
            });
            t.vx = actor.facing * (isSkill ? 11 : 6.2);
            triggerShake(isSkill || isFireWing ? 8.5 : 5);
            spawnBurst(
              t.x,
              t.y - 58 * t.scale,
              isFireWing ? 14 : 9,
              isFireWing ? '#fef08a' : '#ffffff',
              isFireWing ? 'rgba(239,68,68,0)' : 'rgba(148,163,184,0)',
              isFireWing ? 6 : 4.5,
              isFireWing ? 9 : 6,
              isFireWing ? '#f97316' : undefined
            );
          }
        }
        if (hitAny) {
          if (actor.weapon === 'sword') stickmanAudio.playSwordHit(isFireWing);
          else stickmanAudio.playPunchHit();
        }
      } else if (actor.weapon === 'bow') {
        const isFireBow = actor.skin === 'panah_api';
        const isRimba = actor.skin === 'panah_rimba';
        const kind = isFireBow ? 'fire_arrow' : isRimba ? 'rimba_arrow' : 'wood_arrow';
        stickmanAudio.playBowRelease(isFireBow);

        const angles = isSkill ? [-0.14, 0, 0.14] : [0];
        angles.forEach((ang) => {
          const speed = 18.5;
          projectiles.push({
            id: `${actor.id}_${Date.now()}_${Math.random()}`,
            ownerId: actor.id,
            team: actor.team,
            x: actor.x + actor.facing * 36 * actor.scale,
            y: actor.y - 68 * actor.scale,
            vx: Math.cos(ang) * speed * actor.facing,
            vy: Math.sin(ang) * speed - 0.75,
            damage: isSkill ? Math.round(baseDmg * 0.9) : baseDmg,
            kind,
            life: 0
          });
        });
      } else if (actor.weapon === 'pistol') {
        const isIceDragon = actor.skin === 'tembakan_naga_es';
        const isShadow = actor.skin === 'pistol_bayangan';
        const kind = isIceDragon ? 'ice_dragon' : isShadow ? 'shadow_bullet' : 'wood_bullet';
        stickmanAudio.playGunShot(isIceDragon);
        triggerShake(isIceDragon ? 5.5 : 3.5);

        spawnBurst(
          actor.x + actor.facing * 56 * actor.scale,
          actor.y - 68 * actor.scale,
          isIceDragon ? 14 : 7,
          isIceDragon ? '#e0f2fe' : isShadow ? '#ddd6fe' : '#fef08a',
          isIceDragon ? 'rgba(14,165,233,0)' : 'rgba(217,119,6,0)',
          isIceDragon ? 6.5 : 4.2,
          isIceDragon ? 9 : 6,
          isIceDragon ? '#38bdf8' : undefined
        );

        const count = isSkill ? 3 : 1;
        for (let i = 0; i < count; i++) {
          projectiles.push({
            id: `${actor.id}_${Date.now()}_${i}_${Math.random()}`,
            ownerId: actor.id,
            team: actor.team,
            x: actor.x + actor.facing * (48 + i * 20) * actor.scale,
            y: actor.y - 68 * actor.scale + (i - (count - 1) / 2) * 7,
            vx: actor.facing * (isIceDragon ? 20 : 21.5),
            vy: 0,
            damage: isSkill ? Math.round(baseDmg * 0.85) : baseDmg,
            kind,
            life: 0,
            pierce: isSkill && isIceDragon,
            slowFrames: isIceDragon ? 85 : 0
          });
        }
      }
    };

    /**
     * ALL 5 CHARACTER UNIQUE SKILLS (Remain active even when switching weapons!)
     */
    const performCharacterSkill = (actor: FighterEntity, slot: 1 | 2) => {
      if (actor.hp <= 0 || actor.stunTimer > 0) return;
      if (slot === 1 && actor.skill1Cooldown > 0) return;
      if (slot === 2 && actor.skill2Cooldown > 0) return;

      const cDef = CHARACTER_DEFS[actor.character];
      if (slot === 1) {
        actor.skill1MaxCooldown = cDef.skill1.cooldownSec * 60;
        actor.skill1Cooldown = actor.skill1MaxCooldown;
      } else {
        actor.skill2MaxCooldown = cDef.skill2.cooldownSec * 60;
        actor.skill2Cooldown = actor.skill2MaxCooldown;
      }

      const targets = (actor.team === 'player' ? enemies : [player, ...(ally ? [ally] : [])]).filter(
        (t) => t.hp > 0
      );
      const nearest = targets.sort((a, b) => Math.abs(a.x - actor.x) - Math.abs(b.x - actor.x))[0];

      // 1. REX
      if (actor.character === 'rex') {
        if (slot === 1) {
          // Pukulan Cepat (4 rapid punches = 60 dmg)
          stickmanAudio.playRexFlurry();
          actor.vx = actor.facing * 14;
          actor.attackDuration = 22;
          actor.attackTimer = 22;
          slashes.push({
            x: actor.x + actor.facing * 44,
            y: actor.y - 64,
            facing: actor.facing,
            life: 0,
            maxLife: 18,
            radius: 75,
            style: 'fist'
          });
          targets.forEach((t) => {
            if (Math.abs(t.x - actor.x) <= 165) {
              applyDamageToTarget(actor, t, 60, { isMelee: true });
              t.vx = actor.facing * 10;
              spawnBurst(t.x, t.y - 60, 14, '#fef08a', 'rgba(245,158,11,0)', 6, 8, '#f59e0b');
            }
          });
          triggerShake(7);
        } else {
          // Perisai Kayu (3.5s 65% dmg reduction)
          stickmanAudio.playShieldActivate(false);
          actor.shieldTimer = 210;
          actor.shieldReduction = 0.65;
          actor.shieldReflect = 0;
          spawnBurst(actor.x, actor.y - 60, 12, '#fde68a', 'rgba(180,83,9,0)', 4, 7, '#d97706');
        }
        return;
      }

      // 2. KIRA
      if (actor.character === 'kira') {
        if (slot === 1) {
          // Dash Bayangan (75 dmg shadow blink)
          stickmanAudio.playKiraShadowDash();
          actor.invulnerableTimer = 18;
          if (nearest) {
            actor.x = Math.max(70, Math.min(ARENA_W - 70, nearest.x + (nearest.x > actor.x ? 75 : -75)));
            actor.facing = nearest.x >= actor.x ? 1 : -1;
          } else {
            actor.x = Math.max(70, Math.min(ARENA_W - 70, actor.x + actor.facing * 240));
          }
          slashes.push({
            x: actor.x,
            y: actor.y - 66,
            facing: actor.facing,
            life: 0,
            maxLife: 18,
            radius: 90,
            style: 'kira_shadow'
          });
          targets.forEach((t) => {
            if (Math.abs(t.x - actor.x) <= 135) {
              applyDamageToTarget(actor, t, 75, { isMelee: true });
              spawnBurst(t.x, t.y - 60, 16, '#e9d5ff', 'rgba(147,51,234,0)', 6.5, 9, '#a855f7');
            }
          });
          triggerShake(7.5);
        } else {
          // Panah Hujan (7 arrows raining from sky onto enemy zone)
          stickmanAudio.playKiraArrowRain();
          const dropCenter = nearest ? nearest.x : actor.x + actor.facing * 260;
          for (let i = -3; i <= 3; i++) {
            projectiles.push({
              id: `kira_rain_${Date.now()}_${i}_${Math.random()}`,
              ownerId: actor.id,
              team: actor.team,
              x: dropCenter + i * 36,
              y: -30 - Math.abs(i) * 28,
              vx: 0,
              vy: 15.5,
              damage: 22,
              kind: 'shadow_rain_arrow',
              life: 0
            });
          }
        }
        return;
      }

      // 3. BRUNO
      if (actor.character === 'bruno') {
        if (slot === 1) {
          // Hentakan Tanah (95 AoE dmg + knockup + shake)
          stickmanAudio.playBrunoEarthSlam();
          actor.squashX = 1.35;
          actor.squashY = 0.72;
          triggerShake(14);
          slashes.push({
            x: actor.x,
            y: GROUND_Y - 10,
            facing: actor.facing,
            life: 0,
            maxLife: 22,
            radius: 175,
            style: 'earth_slam'
          });
          spawnBurst(actor.x, GROUND_Y - 12, 24, '#6ee7b7', 'rgba(16,185,129,0)', 8.5, 11, '#34d399');
          targets.forEach((t) => {
            if (Math.abs(t.x - actor.x) <= 210) {
              applyDamageToTarget(actor, t, 95, { isMelee: true });
              t.vy = -12.5;
              t.vx = (t.x >= actor.x ? 1 : -1) * 11;
            }
          });
        } else {
          // Tameng Besi (4s 80% reduction + 15 melee reflect)
          stickmanAudio.playShieldActivate(true);
          actor.shieldTimer = 240;
          actor.shieldReduction = 0.8;
          actor.shieldReflect = 15;
          spawnBurst(actor.x, actor.y - 60, 14, '#e2e8f0', 'rgba(16,185,129,0)', 5, 8, '#10b981');
        }
        return;
      }

      // 4. FROST
      if (actor.character === 'frost') {
        if (slot === 1) {
          // Tembak Es (3 piercing spears = 28x3 dmg + slow)
          stickmanAudio.playFrostIceShot();
          [-0.08, 0, 0.08].forEach((ang) => {
            projectiles.push({
              id: `frost_spear_${Date.now()}_${Math.random()}`,
              ownerId: actor.id,
              team: actor.team,
              x: actor.x + actor.facing * 42,
              y: actor.y - 68,
              vx: Math.cos(ang) * 20 * actor.facing,
              vy: Math.sin(ang) * 20,
              damage: 28,
              kind: 'ice_spear',
              life: 0,
              pierce: true,
              slowFrames: 95
            });
          });
        } else {
          // Badai Es (3s blizzard vortex)
          stickmanAudio.playFrostBlizzard();
          const zoneX = nearest ? nearest.x : actor.x + actor.facing * 240;
          blizzards.push({
            ownerTeam: actor.team,
            x: zoneX,
            timer: 180
          });
          spawnBurst(zoneX, GROUND_Y - 70, 22, '#f0f9ff', 'rgba(56,189,248,0)', 7, 10, '#38bdf8');
        }
        return;
      }

      // 5. THE VAN (PALING OP)
      if (actor.character === 'the_van') {
        if (slot === 1) {
          // SKILL 1: SHADOW VANISH (Hayabusa Ulti — Disappear, 6x teleport crimson flame slashes, 30x6 = 180 DMG, enemy stunned!)
          actor.invulnerableTimer = 46;
          actor.shadowVanishTargetId = nearest?.id;
          actor.shadowVanishQueue = [
            { delay: 2, side: 1 },
            { delay: 8, side: -1 },
            { delay: 14, side: 1 },
            { delay: 20, side: -1 },
            { delay: 26, side: 1 },
            { delay: 32, side: -1 }
          ];
          if (nearest && nearest.invulnerableTimer <= 0) {
            nearest.stunTimer = Math.max(nearest.stunTimer, 44);
          }
          stickmanAudio.playVanShadowVanish();
          spawnBurst(actor.x, actor.y - 65, 20, '#fde047', 'rgba(220,38,38,0)', 7, 10, '#ef4444');
        } else {
          // SKILL 2: DRAGON VAN (Transform into giant flying Fire Dragon for 4 seconds = 240 frames, breathes fire = 200 DMG + 5s burn 10/sec)
          stickmanAudio.playVanDragonTransform();
          actor.dragonFormTimer = 240;
          actor.dragonBreathTick = 0;
          actor.vy = -6;
          triggerShake(12);
          spawnBurst(actor.x, actor.y - 90, 28, '#fde047', 'rgba(220,38,38,0)', 9, 13, '#ef4444');
        }
      }
    };

    const updatePhysics = (f: FighterEntity) => {
      if (f.dragonFormTimer > 0) {
        // FLYING DRAGON FORM: hovers cleanly above ground with smooth sinusoidal flight
        f.vx *= 0.86;
        const targetFlyY = GROUND_Y - 115 + Math.sin(frameCount * 0.1) * 14;
        f.y += (targetFlyY - f.y) * 0.16;
        f.vy = 0;
        f.wasAirborne = true;
      } else {
        const friction = f.y >= GROUND_Y ? 0.78 : 0.93;
        f.vx *= friction;
        f.vy += GRAVITY;
        f.x += f.vx;
        f.y += f.vy;
      }

      f.squashX += (1 - f.squashX) * 0.22;
      f.squashY += (1 - f.squashY) * 0.22;

      if (Math.abs(f.vx) > 0.65 && f.y >= GROUND_Y) {
        f.runPhase += Math.abs(f.vx) * 0.058;
      }

      if (f.dragonFormTimer <= 0) {
        if (f.y >= GROUND_Y) {
          if (f.wasAirborne && f.vy > 4.5) {
            f.squashX = 1.24;
            f.squashY = 0.78;
            spawnBurst(f.x, GROUND_Y, 6, '#94a3b8', 'rgba(148,163,184,0)', 2.8, 5, undefined, false);
            if (f.id === player.id) stickmanAudio.playLand();
          }
          f.y = GROUND_Y;
          f.vy = 0;
          f.wasAirborne = false;
        } else {
          f.wasAirborne = true;
        }
      }

      f.x = Math.max(54, Math.min(ARENA_W - 54, f.x));

      if (f.attackTimer > 0) f.attackTimer -= 1;
      if (f.attackCooldown > 0) f.attackCooldown -= 1;
      if (f.skillCooldown > 0) f.skillCooldown -= 1;
      if (f.skill1Cooldown > 0) f.skill1Cooldown -= 1;
      if (f.skill2Cooldown > 0) f.skill2Cooldown -= 1;
      if (f.dashTimer > 0) f.dashTimer -= 1;
      if (f.dashCooldown > 0) f.dashCooldown -= 1;
      if (f.hitFlash > 0) f.hitFlash -= 1;
      if (f.slowTimer > 0) f.slowTimer -= 1;
      if (f.stunTimer > 0) f.stunTimer -= 1;
      if (f.invulnerableTimer > 0) f.invulnerableTimer -= 1;
      if (f.shieldTimer > 0) f.shieldTimer -= 1;

      // Burn DoT (e.g. Dragon Van 10 dmg/sec for 5s, Pedang Api Sayap burn)
      if (f.burnTimer > 0 && f.hp > 0) {
        f.burnTimer -= 1;
        if (f.burnTimer % 30 === 0) {
          const tickBurn = Math.max(1, Math.round(f.burnDps / 2));
          f.hp = Math.max(0, f.hp - tickBurn);
          spawnBurst(f.x, f.y - 62, 7, '#fde047', 'rgba(239,68,68,0)', 3.5, 7);
        }
      }

      // SHADOW VANISH 6x teleport queue execution
      if (f.shadowVanishQueue.length > 0 && f.hp > 0) {
        for (let q = f.shadowVanishQueue.length - 1; q >= 0; q--) {
          f.shadowVanishQueue[q].delay -= 1;
          if (f.shadowVanishQueue[q].delay <= 0) {
            const step = f.shadowVanishQueue.splice(q, 1)[0];
            const pool = f.team === 'player' ? enemies : [player, ...(ally ? [ally] : [])];
            const liveTarget =
              pool.find((e) => e.id === f.shadowVanishTargetId && e.hp > 0) ||
              pool.find((e) => e.hp > 0);
            if (liveTarget) {
              f.x = Math.max(70, Math.min(ARENA_W - 70, liveTarget.x + step.side * 66));
              f.y = liveTarget.y;
              f.facing = liveTarget.x >= f.x ? 1 : -1;
              liveTarget.stunTimer = Math.max(liveTarget.stunTimer, 18);
              applyDamageToTarget(f, liveTarget, 30, { isMelee: true, bypassBlock: true });
              slashes.push({
                x: liveTarget.x,
                y: liveTarget.y - 66,
                facing: f.facing,
                life: 0,
                maxLife: 16,
                radius: 95,
                style: 'van_crimson'
              });
              spawnBurst(liveTarget.x, liveTarget.y - 64, 15, '#fde047', 'rgba(220,38,38,0)', 7.5, 10, '#ef4444');
              stickmanAudio.playVanShadowVanish();
              triggerShake(9.5);
            }
          }
        }
      }

      // DRAGON VAN active dragon flight & fire breath (200 total damage across 8 ticks + 5s 10/s burn)
      if (f.dragonFormTimer > 0 && f.hp > 0) {
        f.dragonFormTimer -= 1;
        f.dragonBreathTick += 1;
        // Roaring continuous fire breath stream particles
        for (let b = 0; b < 3; b++) {
          particles.push({
            x: f.x + f.facing * (84 + Math.random() * 65),
            y: f.y - 54 + (Math.random() - 0.5) * 32,
            vx: f.facing * (12 + Math.random() * 6),
            vy: 2.8 + (Math.random() - 0.5) * 3,
            life: 0,
            maxLife: 22,
            size: 16 + Math.random() * 10,
            colorCore: Math.random() < 0.4 ? '#fef08a' : '#f97316',
            colorEdge: 'rgba(185,28,28,0)',
            glow: true
          });
        }
        if (f.dragonBreathTick % 30 === 1) {
          stickmanAudio.playVanDragonBreath();
          triggerShake(6.5);
          const pool = f.team === 'player' ? enemies : [player, ...(ally ? [ally] : [])];
          pool.forEach((t) => {
            if (t.hp <= 0 || t.invulnerableTimer > 0) return;
            const forwardDist = (t.x - f.x) * f.facing;
            if (forwardDist >= -60 && forwardDist <= 420) {
              // 240 frames / 30 = 8 ticks; 25 * 8 = 200 direct damage + 5s burn @ 10/sec
              applyDamageToTarget(f, t, 25, { bypassBlock: true, burnSec: 5, burnDps: 10 });
              spawnBurst(t.x, t.y - 60, 12, '#fde047', 'rgba(239,68,68,0)', 6, 9, '#ef4444');
            }
          });
        }
      }

      // Ambient continuous aura particles for THE VAN & legendary skins
      if (f.hp > 0 && frameCount % 2 === 0 && f.dragonFormTimer <= 0) {
        if (f.character === 'the_van') {
          particles.push({
            x: f.x + (Math.random() - 0.5) * 52,
            y: f.y - Math.random() * 115,
            vx: (Math.random() - 0.5) * 1.1,
            vy: -1.6 - Math.random() * 1.6,
            life: 0,
            maxLife: 20,
            size: 8,
            colorCore: Math.random() < 0.4 ? '#fde047' : '#ef4444',
            colorEdge: 'rgba(185,28,28,0)',
            glow: true
          });
        } else if (f.skin === 'panah_api') {
          particles.push({
            x: f.x + f.facing * 26 * f.scale + (Math.random() - 0.5) * 14,
            y: f.y - 68 * f.scale + (Math.random() - 0.5) * 20,
            vx: (Math.random() - 0.5) * 0.8,
            vy: -1.4 - Math.random(),
            life: 0,
            maxLife: 20,
            size: 6,
            colorCore: Math.random() < 0.5 ? '#fde047' : '#fb923c',
            colorEdge: 'rgba(220,38,38,0)',
            glow: true
          });
        } else if (f.skin === 'tembakan_naga_es') {
          particles.push({
            x: f.x + f.facing * 48 * f.scale,
            y: f.y - 68 * f.scale + (Math.random() - 0.5) * 8,
            vx: f.facing * (0.8 + Math.random() * 0.9),
            vy: -0.9 - Math.random() * 0.8,
            life: 0,
            maxLife: 26,
            size: 7.5,
            colorCore: '#e0f2fe',
            colorEdge: 'rgba(14,165,233,0)',
            glow: true
          });
        } else if (f.skin === 'pedang_api_sayap') {
          const isWater = Math.random() < 0.28;
          particles.push({
            x: f.x + f.facing * 24 * f.scale + (Math.random() - 0.5) * 18,
            y: f.y - 76 * f.scale - Math.random() * 28,
            vx: (Math.random() - 0.5) * 1,
            vy: isWater ? 0.5 - Math.random() * 1.2 : -1.5 - Math.random(),
            life: 0,
            maxLife: 22,
            size: isWater ? 5.5 : 7,
            colorCore: isWater ? '#bae6fd' : '#fde047',
            colorEdge: isWater ? 'rgba(2,132,199,0)' : 'rgba(239,68,68,0)',
            glow: true
          });
        }
      }
    };

    const runAiBrain = (bot: FighterEntity) => {
      if (bot.hp <= 0 || bot.stunTimer > 0) return;
      const target =
        ally && ally.hp > 0 && Math.abs(ally.x - bot.x) < Math.abs(player.x - bot.x) ? ally : player;
      if (target.hp <= 0) return;

      const dx = target.x - bot.x;
      const dist = Math.abs(dx);
      bot.facing = dx >= 0 ? 1 : -1;

      const isRanged = bot.weapon === 'bow' || bot.weapon === 'pistol';
      const idealDist = bot.isBoss ? 124 : isRanged ? 380 : 92;
      const charSpd = CHARACTER_DEFS[bot.character].moveSpeed;
      const moveSpeed =
        bot.slowTimer > 0
          ? 2.2
          : bot.isBoss
          ? 3.8
          : aiDifficulty === 'hard'
          ? charSpd * 0.9
          : aiDifficulty === 'normal'
          ? charSpd * 0.7
          : charSpd * 0.5;

      if (dist > idealDist + 20) {
        bot.vx = bot.facing * moveSpeed;
      } else if (isRanged && dist < 210) {
        bot.vx = -bot.facing * moveSpeed * 0.85;
      }

      if (bot.aiThinkTimer > 0) {
        bot.aiThinkTimer -= 1;
        return;
      }

      const thinkDelay =
        bot.isBoss ? 14 : aiDifficulty === 'hard' ? 12 : aiDifficulty === 'normal' ? 24 : 42;
      bot.aiThinkTimer = thinkDelay + Math.floor(Math.random() * 14);
      bot.blocking = false;

      if (bot.isBoss && dist > 260 && bot.skillCooldown <= 0) {
        bot.skillCooldown = 140;
        stickmanAudio.playBowRelease(true);
        [-0.12, 0.04].forEach((ang) => {
          projectiles.push({
            id: `boss_fb_${Date.now()}_${Math.random()}`,
            ownerId: bot.id,
            team: 'enemy',
            x: bot.x + bot.facing * 58,
            y: bot.y - 96,
            vx: Math.cos(ang) * 13.5 * bot.facing,
            vy: Math.sin(ang) * 13.5,
            damage: 24,
            kind: 'boss_fireball',
            life: 0
          });
        });
        return;
      }

      // AI character skill usage on normal/hard
      if (!bot.isBoss && aiDifficulty !== 'easy') {
        if (bot.skill1Cooldown <= 0 && dist < 250 && Math.random() < 0.32) {
          performCharacterSkill(bot, 1);
          return;
        }
        if (bot.skill2Cooldown <= 0 && Math.random() < 0.24) {
          performCharacterSkill(bot, 2);
          return;
        }
      }

      if (isRanged || dist <= idealDist + 40) {
        const useSkill =
          bot.skillCooldown <= 0 &&
          (aiDifficulty === 'hard' || bot.isBoss || Math.random() < 0.4);
        performWeaponAttack(bot, useSkill);
      } else if (Math.random() < 0.25 && bot.y >= GROUND_Y) {
        bot.vy = -16.5;
        bot.squashX = 0.82;
        bot.squashY = 1.2;
      }
    };

    const drawFighter = (f: FighterEntity, timeSec: number) => {
      if (f.hp <= 0) return;

      // GIANT FLYING FIRE DRAGON FORM (THE VAN SKILL 2)
      if (f.dragonFormTimer > 0) {
        const flap = Math.sin(timeSec * 11) * 32;
        ctx.save();
        ctx.translate(f.x, f.y - 52);
        ctx.scale(f.facing, 1);
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 28;

        // Sweeping Crimson Dragon Wings
        const dwGrad = ctx.createLinearGradient(0, -10, -110, -110 - flap);
        dwGrad.addColorStop(0, '#7f1d1d');
        dwGrad.addColorStop(0.55, '#ef4444');
        dwGrad.addColorStop(1, '#fde047');
        ctx.fillStyle = dwGrad;
        ctx.strokeStyle = '#fde047';
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.moveTo(-12, -16);
        ctx.bezierCurveTo(-48, -125 - flap, -98, -108 - flap, -124, -64 - flap);
        ctx.lineTo(-90, -18 - flap * 0.4);
        ctx.lineTo(-104, 16);
        ctx.lineTo(-42, 12);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Serpentine Dragon Tail + Body
        ctx.fillStyle = '#991b1b';
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(-108, 12);
        ctx.quadraticCurveTo(-55, -24, 34, -14);
        ctx.lineTo(54, 12);
        ctx.quadraticCurveTo(-45, 22, -108, 12);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Horned Fire Dragon Head + Jaw
        ctx.fillStyle = '#b91c1c';
        ctx.beginPath();
        ctx.moveTo(28, -28);
        ctx.lineTo(12, -52);
        ctx.lineTo(44, -30);
        ctx.lineTo(84, -14);
        ctx.lineTo(66, -2);
        ctx.lineTo(82, 8);
        ctx.lineTo(44, 18);
        ctx.lineTo(24, 4);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Glowing Dragon Eye
        ctx.fillStyle = '#fef08a';
        ctx.beginPath();
        ctx.arc(54, -13, 4.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();

        // Overhead Name + HP Bar above Dragon
        const barW = 90;
        const topY = f.y - 170;
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.fillRect(f.x - barW / 2, topY, barW, 8);
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(f.x - barW / 2, topY, barW * Math.max(0, f.hp / f.maxHp), 8);
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fde047';
        ctx.fillText(`DRAGON ${f.name}`, f.x, topY - 6);
        return;
      }

      const isMoving = Math.abs(f.vx) > 0.65 && f.y >= GROUND_Y;
      const idleBreath = Math.sin(timeSec * 3.4) * 2.5;
      const lean = Math.max(-0.18, Math.min(0.18, f.vx * 0.015 * f.facing));

      const heightRatio = Math.max(0.35, 1 - Math.max(0, GROUND_Y - f.y) / 260);
      ctx.fillStyle = `rgba(0,0,0,${0.48 * heightRatio})`;
      ctx.beginPath();
      ctx.ellipse(f.x, GROUND_Y + 4, 28 * f.scale * heightRatio, 7.5 * f.scale * heightRatio, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      if (f.invulnerableTimer > 0) ctx.globalAlpha = 0.42;
      ctx.translate(f.x, f.y);
      ctx.scale(f.facing * f.scale * f.squashX, f.scale * f.squashY);
      ctx.rotate(lean);

      // THE VAN Giant Red Fire Wings (always rendered) OR Pedang Api Sayap wings
      if (f.character === 'the_van') {
        const flap = Math.sin(timeSec * 7.2) * 16;
        ctx.save();
        ctx.translate(-8, -74 + idleBreath);
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 18;
        const wGrad = ctx.createLinearGradient(0, 0, -82, -58);
        wGrad.addColorStop(0, '#450a0a');
        wGrad.addColorStop(0.5, '#ef4444');
        wGrad.addColorStop(1, '#fde047');
        ctx.fillStyle = wGrad;
        ctx.strokeStyle = '#fde047';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(-28, -76 - flap, -66, -64 - flap, -84, -36 - flap);
        ctx.lineTo(-56, -6 - flap * 0.45);
        ctx.lineTo(-70, 16);
        ctx.lineTo(-26, 20);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      } else if (f.skin === 'pedang_api_sayap') {
        const flap = Math.sin(timeSec * 6.5) * 14;
        ctx.save();
        ctx.translate(-8, -72 + idleBreath);
        const wGrad = ctx.createLinearGradient(0, 0, -68, -46);
        wGrad.addColorStop(0, '#09090b');
        wGrad.addColorStop(0.55, '#991b1b');
        wGrad.addColorStop(1, '#fbbf24');
        ctx.fillStyle = wGrad;
        ctx.strokeStyle = '#fde047';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(-24, -64 - flap, -54, -52 - flap, -68, -30 - flap);
        ctx.lineTo(-48, -4 - flap * 0.45);
        ctx.lineTo(-58, 14);
        ctx.lineTo(-22, 18);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      const bodyFill =
        f.hitFlash > 0
          ? '#ffffff'
          : f.slowTimer > 0
          ? '#38bdf8'
          : f.isBoss
          ? '#7f1d1d'
          : f.character === 'the_van'
          ? '#1a0608'
          : f.character === 'kira'
          ? '#1e1033'
          : f.character === 'bruno'
          ? '#0b221a'
          : f.character === 'frost'
          ? '#082032'
          : '#0f172a';

      const outline =
        f.isBoss
          ? '#ef4444'
          : f.character === 'the_van'
          ? '#ff2e2e'
          : f.character === 'kira'
          ? '#a855f7'
          : f.character === 'bruno'
          ? '#10b981'
          : f.character === 'frost'
          ? '#38bdf8'
          : f.team === 'player'
          ? '#38bdf8'
          : '#f97316';

      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Legs
      const strideA = isMoving ? Math.sin(f.runPhase) * 18 : -11;
      const strideB = isMoving ? Math.sin(f.runPhase + Math.PI) * 18 : 11;
      const liftA = isMoving ? Math.max(0, -Math.cos(f.runPhase)) * 12 : 0;
      const liftB = isMoving ? Math.max(0, -Math.cos(f.runPhase + Math.PI)) * 12 : 0;

      const hipY = -44 + idleBreath * 0.4;
      const kneeYA = -22 - liftA * 0.7;
      const kneeYB = -22 - liftB * 0.7;
      const footYA = -liftA;
      const footYB = -liftB;

      ctx.strokeStyle = bodyFill;
      ctx.lineWidth = f.character === 'bruno' ? 12 : 9.5;
      ctx.beginPath();
      ctx.moveTo(0, hipY);
      ctx.lineTo(strideA * 0.55 + 4, kneeYA);
      ctx.lineTo(strideA, footYA);
      ctx.moveTo(0, hipY);
      ctx.lineTo(strideB * 0.55 + 4, kneeYB);
      ctx.lineTo(strideB, footYB);
      ctx.stroke();

      // KIRA flowing scarf
      if (f.character === 'kira') {
        const sw = Math.sin(timeSec * 8) * 6;
        ctx.fillStyle = '#9333ea';
        ctx.beginPath();
        ctx.moveTo(0, -82 + idleBreath);
        ctx.quadraticCurveTo(-24, -76 + sw, -40, -64 + sw);
        ctx.lineTo(-32, -56 + sw);
        ctx.closePath();
        ctx.fill();
      }

      // Torso
      const shoulderY = -84 + idleBreath;
      ctx.lineWidth = f.character === 'bruno' ? 15 : 11.5;
      ctx.beginPath();
      ctx.moveTo(0, hipY);
      ctx.lineTo(3, shoulderY);
      ctx.stroke();

      // BRUNO shoulder pauldron
      if (f.character === 'bruno') {
        ctx.fillStyle = '#1e293b';
        ctx.strokeStyle = '#34d399';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(2, shoulderY + 3, 14, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // Head + Character Headgear
      const headY = -103 + idleBreath;
      ctx.fillStyle = bodyFill;
      ctx.strokeStyle = outline;
      ctx.lineWidth = 2.8;
      ctx.beginPath();
      ctx.arc(3, headY, 17, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      if (f.character === 'rex' && !f.isBoss) {
        ctx.fillStyle = '#dc2626';
        ctx.fillRect(-13, headY - 9, 32, 4.5);
        ctx.beginPath();
        ctx.moveTo(-13, headY - 7);
        ctx.lineTo(-28, headY - 12);
        ctx.lineTo(-24, headY - 3);
        ctx.closePath();
        ctx.fill();
      } else if (f.character === 'frost' && !f.isBoss) {
        ctx.fillStyle = '#7dd3fc';
        ctx.beginPath();
        ctx.moveTo(-9, headY - 14);
        ctx.lineTo(-5, headY - 29);
        ctx.lineTo(3, headY - 19);
        ctx.lineTo(11, headY - 29);
        ctx.lineTo(15, headY - 14);
        ctx.closePath();
        ctx.fill();
      } else if (f.isBoss) {
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.moveTo(-11, headY - 14);
        ctx.lineTo(-7, headY - 29);
        ctx.lineTo(3, headY - 19);
        ctx.lineTo(13, headY - 29);
        ctx.lineTo(17, headY - 14);
        ctx.closePath();
        ctx.fill();
      }

      // Glowing Eyes (THE VAN glowing bright red!)
      if (f.character === 'the_van') {
        ctx.save();
        ctx.shadowColor = '#ff0000';
        ctx.shadowBlur = 12;
        ctx.fillStyle = '#ff2a2a';
        ctx.beginPath();
        ctx.ellipse(11, headY - 1, 6.2, 2.8, -0.18, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else {
        ctx.fillStyle =
          f.isBoss
            ? '#ef4444'
            : f.character === 'frost'
            ? '#bae6fd'
            : f.character === 'kira'
            ? '#e9d5ff'
            : f.team === 'player'
            ? '#7dd3fc'
            : '#fb923c';
        ctx.beginPath();
        ctx.ellipse(11, headY - 1, 5.5, 2.4, -0.15, 0, Math.PI * 2);
        ctx.fill();
      }

      // Shield / Perisai Kayu / Tameng Besi
      if (f.shieldTimer > 0) {
        ctx.strokeStyle = f.character === 'bruno' ? '#34d399' : '#f59e0b';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(4, -64, 48, 0, Math.PI * 2);
        ctx.stroke();
      } else if (f.blocking) {
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(14, -64, 46, -Math.PI * 0.45, Math.PI * 0.45);
        ctx.stroke();
      }

      // Weapon Arm
      let armRot = Math.sin(timeSec * 3.4 + 0.5) * 0.06;
      if (f.attackTimer > 0) {
        const p = 1 - f.attackTimer / Math.max(1, f.attackDuration);
        if (f.weapon === 'sword' || f.weapon === 'bare_hands') {
          armRot = p < 0.25 ? -1.35 * easeOutCubic(p / 0.25) : -1.35 + 2.75 * easeOutCubic((p - 0.25) / 0.75);
        } else if (f.weapon === 'pistol') {
          armRot = -0.35 * (1 - p);
        } else {
          armRot = -0.18 * Math.sin(p * Math.PI);
        }
      }

      ctx.save();
      ctx.translate(3, shoulderY + 6);
      ctx.rotate(armRot);
      ctx.strokeStyle = bodyFill;
      ctx.lineWidth = 8.5;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(27, 8);
      ctx.stroke();

      const wLv = f.weapon !== 'bare_hands' ? Number(f.weaponLevels?.[f.weapon] || 1) : 1;

      if (f.weapon === 'sword') {
        if (f.skin === 'pedang_api_sayap') {
          ctx.save();
          ctx.shadowColor = '#f97316';
          ctx.shadowBlur = 12;
          const bG = ctx.createLinearGradient(24, 6, 24, -58);
          bG.addColorStop(0, '#b45309');
          bG.addColorStop(0.6, '#fbbf24');
          bG.addColorStop(1, '#fef9c3');
          ctx.fillStyle = bG;
          ctx.fillRect(24, -56, 8, 62);
          ctx.fillStyle = '#dc2626';
          ctx.fillRect(18, 3, 20, 5.5);
          ctx.restore();
        } else {
          ctx.fillStyle =
            f.skin === 'pedang_baja'
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
          ctx.fillRect(24, -48, 7, 54);
          ctx.fillStyle = '#78350f';
          ctx.fillRect(19, 3, 17, 5);
        }
      } else if (f.weapon === 'bow') {
        ctx.strokeStyle =
          f.skin === 'panah_api'
            ? '#ef4444'
            : f.skin === 'panah_rimba'
            ? '#10b981'
            : wLv >= 5
            ? '#ef4444'
            : '#854d0e';
        ctx.lineWidth = 4.5;
        ctx.beginPath();
        ctx.moveTo(26, -24);
        ctx.quadraticCurveTo(44, 5, 26, 34);
        ctx.stroke();
      } else if (f.weapon === 'pistol') {
        if (f.skin === 'tembakan_naga_es') {
          ctx.save();
          ctx.shadowColor = '#38bdf8';
          ctx.shadowBlur = 10;
          ctx.fillStyle = '#0284c7';
          ctx.fillRect(24, 0, 30, 11);
          ctx.fillStyle = '#09111e';
          ctx.strokeStyle = '#7dd3fc';
          ctx.lineWidth = 1.6;
          ctx.fillRect(46, -3, 14, 14);
          ctx.strokeRect(46, -3, 14, 14);
          ctx.restore();
        } else {
          ctx.fillStyle = f.skin === 'pistol_bayangan' ? '#312e81' : '#92400e';
          ctx.fillRect(24, 2, 22, 8);
        }
      }

      ctx.restore();
      ctx.restore();

      // Overhead Name & HP Bar
      const barW = f.isBoss ? 120 : 66;
      const topY = f.y - 136 * f.scale;
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(f.x - barW / 2, topY, barW, 8);
      ctx.fillStyle = f.team === 'player' ? '#22c55e' : '#ef4444';
      ctx.fillRect(f.x - barW / 2, topY, barW * Math.max(0, f.hp / f.maxHp), 8);
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = f.character === 'the_van' ? '#fca5a5' : '#f4f4f5';
      ctx.fillText(f.stunTimer > 0 ? `${f.name} (STUN!)` : f.name, f.x, topY - 6);
    };

    let rafId = 0;

    const tick = () => {
      if (!pausedRef.current && !finishedRef.current) {
        frameCount += 1;

        if (switchLoadoutPendingRef.current) {
          player.weapon = switchLoadoutPendingRef.current.weapon;
          player.skin = switchLoadoutPendingRef.current.skin;
          switchLoadoutPendingRef.current = null;
          spawnBurst(player.x, player.y - 60, 8, '#fde047', 'rgba(245,158,11,0)', 3.8, 7);
        }

        const k = keysRef.current;
        const baseSpd = CHARACTER_DEFS[player.character].moveSpeed;
        const moveSpd =
          player.dragonFormTimer > 0
            ? baseSpd * 1.35
            : player.slowTimer > 0
            ? baseSpd * 0.55
            : baseSpd;
        player.blocking = k.block && player.dragonFormTimer <= 0;

        if (player.stunTimer <= 0 && !player.blocking && player.dashTimer <= 0) {
          if (k.left) {
            player.vx = -moveSpd;
            player.facing = -1;
          } else if (k.right) {
            player.vx = moveSpd;
            player.facing = 1;
          }
        }

        if (player.stunTimer <= 0) {
          if (k.jump && player.y >= GROUND_Y && player.dragonFormTimer <= 0) {
            player.vy = -17.8;
            player.squashX = 0.8;
            player.squashY = 1.24;
            stickmanAudio.playJump();
          }
          if (k.dash && player.dashCooldown <= 0) {
            player.dashTimer = 11;
            player.dashCooldown = 55;
            player.vx = player.facing * 18;
            player.squashX = 1.28;
            player.squashY = 0.78;
            stickmanAudio.playDash();
            spawnBurst(player.x, player.y - 46, 10, '#e2e8f0', 'rgba(148,163,184,0)', 4, 6);
          }
          if (k.skill1 && player.skill1Cooldown <= 0) {
            performCharacterSkill(player, 1);
            lastAttackPayload = { type: 'skill1', ts: Date.now() };
          } else if (k.skill2 && player.skill2Cooldown <= 0) {
            performCharacterSkill(player, 2);
            lastAttackPayload = { type: 'skill2', ts: Date.now() };
          } else if (k.skill && player.skillCooldown <= 0) {
            performWeaponAttack(player, true);
            lastAttackPayload = { type: 'skill', ts: Date.now() };
          } else if (k.attack) {
            performWeaponAttack(player, false);
            lastAttackPayload = { type: 'normal', ts: Date.now() };
          }
        }

        updatePhysics(player);

        // Online sync
        if (onlineRoom && wsRef.current?.readyState === WebSocket.OPEN && frameCount % 2 === 0) {
          wsRef.current.send(
            JSON.stringify({
              type: 'stickman-sync',
              roomId: onlineRoom.roomId,
              senderId: profile.userId,
              state: {
                x: player.x,
                y: player.y,
                vx: player.vx,
                vy: player.vy,
                facing: player.facing,
                hp: player.hp,
                character: player.character,
                weapon: player.weapon,
                skin: player.skin,
                attackTimer: player.attackTimer,
                blocking: player.blocking,
                dashTimer: player.dashTimer,
                dragonFormTimer: player.dragonFormTimer,
                invulnerableTimer: player.invulnerableTimer,
                shieldTimer: player.shieldTimer,
                pendingAttack: lastAttackPayload,
                bossHp: isOnlineHost && mode === 'boss' && enemies[0] ? enemies[0].hp : undefined
              }
            })
          );
          lastAttackPayload = undefined;
        }

        const rState = remotePeerStateRef.current;
        if (onlineRoom && rState) {
          const remoteFighter = mode === '1v1_online' ? enemies[0] : ally;
          if (remoteFighter) {
            remoteFighter.x = rState.x;
            remoteFighter.y = rState.y;
            remoteFighter.vx = rState.vx;
            remoteFighter.vy = rState.vy;
            remoteFighter.facing = rState.facing;
            remoteFighter.hp = rState.hp;
            if (rState.character) remoteFighter.character = rState.character;
            if (rState.weapon) remoteFighter.weapon = rState.weapon;
            if (rState.skin !== undefined) remoteFighter.skin = rState.skin;
            remoteFighter.blocking = rState.blocking;
            if (typeof rState.dragonFormTimer === 'number') remoteFighter.dragonFormTimer = rState.dragonFormTimer;
            if (typeof rState.invulnerableTimer === 'number') remoteFighter.invulnerableTimer = rState.invulnerableTimer;
            if (typeof rState.shieldTimer === 'number') remoteFighter.shieldTimer = rState.shieldTimer;
            if (rState.pendingAttack && rState.pendingAttack.ts > lastRemoteAttackTs) {
              lastRemoteAttackTs = rState.pendingAttack.ts;
              if (rState.pendingAttack.type === 'skill1') performCharacterSkill(remoteFighter, 1);
              else if (rState.pendingAttack.type === 'skill2') performCharacterSkill(remoteFighter, 2);
              else performWeaponAttack(remoteFighter, rState.pendingAttack.type === 'skill');
            }
          }
          if (!isOnlineHost && mode === 'boss' && typeof rState.bossHp === 'number' && enemies[0]) {
            enemies[0].hp = Math.min(enemies[0].hp, rState.bossHp);
          }
        }

        if (mode !== '1v1_online') {
          enemies.forEach((en) => {
            runAiBrain(en);
            updatePhysics(en);
          });
        } else if (enemies[0]) {
          updatePhysics(enemies[0]);
        }

        if (ally) updatePhysics(ally);

        // Blizzard Zones (Frost Skill 2)
        for (let bi = blizzards.length - 1; bi >= 0; bi--) {
          const bz = blizzards[bi];
          bz.timer -= 1;
          if (frameCount % 2 === 0) {
            particles.push({
              x: bz.x + (Math.random() - 0.5) * 210,
              y: 120 + Math.random() * 140,
              vx: (Math.random() - 0.5) * 3,
              vy: 9 + Math.random() * 4,
              life: 0,
              maxLife: 28,
              size: 8,
              colorCore: '#e0f2fe',
              colorEdge: 'rgba(56,189,248,0)',
              glow: true
            });
          }
          if (bz.timer % 20 === 0) {
            const bTargets = bz.ownerTeam === 'player' ? enemies : [player, ...(ally ? [ally] : [])];
            bTargets.forEach((t) => {
              if (t.hp > 0 && Math.abs(t.x - bz.x) <= 135) {
                applyDamageToTarget(null, t, 15, { bypassBlock: false });
                t.slowTimer = Math.max(t.slowTimer, 65);
              }
            });
          }
          if (bz.timer <= 0) blizzards.splice(bi, 1);
        }

        // Projectiles
        for (let i = projectiles.length - 1; i >= 0; i--) {
          const p = projectiles[i];
          p.x += p.vx;
          p.y += p.vy;
          if (p.kind === 'wood_arrow' || p.kind === 'fire_arrow' || p.kind === 'rimba_arrow') {
            p.vy += 0.1;
          }
          p.life += 1;

          if (p.kind === 'fire_arrow' || p.kind === 'boss_fireball') {
            particles.push({
              x: p.x,
              y: p.y,
              vx: -p.vx * 0.14 + (Math.random() - 0.5) * 0.9,
              vy: (Math.random() - 0.5) * 1.4,
              life: 0,
              maxLife: 18,
              size: p.kind === 'boss_fireball' ? 11 : 7.5,
              colorCore: Math.random() < 0.45 ? '#fef08a' : '#fb923c',
              colorEdge: 'rgba(220,38,38,0)',
              glow: true
            });
          } else if (p.kind === 'ice_dragon' || p.kind === 'ice_spear') {
            particles.push({
              x: p.x,
              y: p.y,
              vx: -p.vx * 0.1,
              vy: (Math.random() - 0.5) * 1.6,
              life: 0,
              maxLife: 20,
              size: 9,
              colorCore: '#e0f2fe',
              colorEdge: 'rgba(14,165,233,0)',
              glow: true
            });
          } else if (p.kind === 'shadow_rain_arrow') {
            particles.push({
              x: p.x,
              y: p.y,
              vx: 0,
              vy: -1.5,
              life: 0,
              maxLife: 14,
              size: 6,
              colorCore: '#c084fc',
              colorEdge: 'rgba(147,51,234,0)',
              glow: true
            });
          }

          let hit = false;
          const potentialTargets = p.team === 'player' ? enemies : [player, ...(ally ? [ally] : [])];
          for (const t of potentialTargets) {
            if (t.hp <= 0 || t.invulnerableTimer > 0) continue;
            if (Math.abs(p.x - t.x) < 34 * t.scale && p.y >= t.y - 118 * t.scale && p.y <= t.y + 8) {
              applyDamageToTarget(null, t, p.damage);
              if (p.kind === 'fire_arrow' || p.kind === 'boss_fireball') {
                stickmanAudio.playArrowHit(true);
                triggerShake(8);
                spawnBurst(p.x, p.y, 18, '#fef08a', 'rgba(239,68,68,0)', 6.8, 10, '#f97316');
                // Fire arrow explosive splash (+8)
                if (p.kind === 'fire_arrow') {
                  potentialTargets.forEach((other) => {
                    if (other.id !== t.id && other.hp > 0 && Math.abs(other.x - p.x) < 95) {
                      applyDamageToTarget(null, other, 8);
                    }
                  });
                }
              } else if (p.kind === 'ice_dragon' || p.kind === 'ice_spear' || p.slowFrames) {
                t.slowTimer = Math.max(t.slowTimer, p.slowFrames || 75);
                stickmanAudio.playIceImpact();
                triggerShake(6);
                spawnBurst(p.x, p.y, 16, '#e0f2fe', 'rgba(14,165,233,0)', 6, 9, '#38bdf8');
              } else if (p.kind === 'wood_arrow' || p.kind === 'rimba_arrow' || p.kind === 'shadow_rain_arrow') {
                stickmanAudio.playArrowHit(false);
                triggerShake(3.5);
                spawnBurst(p.x, p.y, 8, '#e2e8f0', 'rgba(148,163,184,0)', 4, 5);
              } else {
                stickmanAudio.playPunchHit();
                triggerShake(3.5);
                spawnBurst(p.x, p.y, 8, '#e2e8f0', 'rgba(148,163,184,0)', 4, 5);
              }

              if (!p.pierce) {
                hit = true;
                break;
              }
            }
          }

          if (hit || p.x < -50 || p.x > ARENA_W + 50 || p.y > GROUND_Y + 14 || p.life > 125) {
            projectiles.splice(i, 1);
          }
        }

        for (let i = particles.length - 1; i >= 0; i--) {
          const pt = particles[i];
          pt.x += pt.vx;
          pt.y += pt.vy;
          pt.life += 1;
          if (pt.life >= pt.maxLife) particles.splice(i, 1);
        }
        for (let i = slashes.length - 1; i >= 0; i--) {
          slashes[i].life += 1;
          if (slashes[i].life >= slashes[i].maxLife) slashes.splice(i, 1);
        }

        if (stageBannerTimer > 0) stageBannerTimer -= 1;
        shakeMag *= 0.82;
        if (shakeMag < 0.2) shakeMag = 0;

        const allEnemiesDead = enemies.every((e) => e.hp <= 0);
        if (mode === 'boss' && allEnemiesDead && currentStage < 3) {
          currentStage += 1;
          player.hp = Math.min(player.maxHp, player.hp + 45);
          spawnBossStage(currentStage);
          stageBannerTimer = 115;
          stageBannerText =
            currentStage === 2 ? 'STAGE 2 · KIRA & BRUNO PENJAGA' : 'FINAL BOSS · RAJA KEGELAPAN!';
        } else if (allEnemiesDead || player.hp <= 0) {
          finishedRef.current = true;
          const won = allEnemiesDead && player.hp > 0;
          if (won) stickmanAudio.playVictory();
          else stickmanAudio.playDefeat();
          onMatchComplete(won).then((reward) => {
            setMatchResult({ won, ...reward });
          });
        }

        if (frameCount % 4 === 0) {
          const leadEnemy = enemies.find((e) => e.hp > 0) || enemies[0];
          const totalEnemyHp = enemies.reduce((s, e) => s + e.hp, 0);
          const totalEnemyMax = enemies.reduce((s, e) => s + e.maxHp, 0);
          setHudState({
            playerHp: player.hp,
            playerMaxHp: player.maxHp,
            enemyHp: totalEnemyHp,
            enemyMaxHp: Math.max(1, totalEnemyMax),
            enemyName: leadEnemy?.name || 'Lawan',
            allyHp: ally?.hp || 0,
            allyMaxHp: ally?.maxHp || 0,
            allyName: ally?.name || '',
            stage: currentStage,
            skillReadyPct: Math.round(Math.max(0, 100 - (player.skillCooldown / 190) * 100)),
            dashReadyPct: Math.round(Math.max(0, 100 - (player.dashCooldown / 55) * 100)),
            skill1Pct: Math.round(Math.max(0, 100 - (player.skill1Cooldown / Math.max(1, player.skill1MaxCooldown)) * 100)),
            skill1SecLeft: Math.ceil(player.skill1Cooldown / 60),
            skill2Pct: Math.round(Math.max(0, 100 - (player.skill2Cooldown / Math.max(1, player.skill2MaxCooldown)) * 100)),
            skill2SecLeft: Math.ceil(player.skill2Cooldown / 60),
            dragonActiveSec: Math.ceil(player.dragonFormTimer / 60)
          });
        }
      }

      // RENDER ARENA
      const timeSec = performance.now() / 1000;
      const sx = shakeMag > 0 ? (Math.random() - 0.5) * 2 * shakeMag : 0;
      const sy = shakeMag > 0 ? (Math.random() - 0.5) * 2 * shakeMag : 0;

      ctx.save();
      ctx.translate(sx, sy);

      const skyGrad = ctx.createLinearGradient(0, 0, ARENA_W, ARENA_H);
      skyGrad.addColorStop(0, '#091529');
      skyGrad.addColorStop(0.5, '#090d16');
      skyGrad.addColorStop(1, '#26100b');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(-20, -20, ARENA_W + 40, ARENA_H + 40);

      ctx.fillStyle = 'rgba(14, 42, 71, 0.55)';
      ctx.beginPath();
      ctx.moveTo(0, GROUND_Y);
      ctx.lineTo(140, 210);
      ctx.lineTo(270, 340);
      ctx.lineTo(390, 185);
      ctx.lineTo(540, GROUND_Y);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = 'rgba(20, 12, 16, 0.78)';
      ctx.fillRect(880, 220, 95, GROUND_Y - 220);
      ctx.fillRect(1020, 170, 120, GROUND_Y - 170);
      ctx.fillRect(1165, 250, 80, GROUND_Y - 250);

      ctx.fillStyle = '#0e1118';
      ctx.fillRect(0, GROUND_Y, ARENA_W, ARENA_H - GROUND_Y + 20);
      const lineGrad = ctx.createLinearGradient(0, 0, ARENA_W, 0);
      lineGrad.addColorStop(0, '#38bdf8');
      lineGrad.addColorStop(0.5, '#94a3b8');
      lineGrad.addColorStop(1, '#f97316');
      ctx.strokeStyle = lineGrad;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, GROUND_Y);
      ctx.lineTo(ARENA_W, GROUND_Y);
      ctx.stroke();

      drawFighter(player, timeSec);
      if (ally) drawFighter(ally, timeSec);
      enemies.forEach((en) => drawFighter(en, timeSec));

      // Slash Arcs
      slashes.forEach((s) => {
        const alpha = 1 - s.life / s.maxLife;
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.scale(s.facing, 1);
        ctx.globalAlpha = alpha;
        ctx.lineCap = 'round';
        if (s.style === 'van_crimson') {
          ctx.shadowColor = '#ef4444';
          ctx.shadowBlur = 20;
          ctx.strokeStyle = '#ff2a2a';
          ctx.lineWidth = 10;
          ctx.beginPath();
          ctx.moveTo(-s.radius * 0.7, -s.radius * 0.6);
          ctx.lineTo(s.radius * 0.7, s.radius * 0.6);
          ctx.moveTo(s.radius * 0.7, -s.radius * 0.6);
          ctx.lineTo(-s.radius * 0.7, s.radius * 0.6);
          ctx.stroke();
          ctx.strokeStyle = '#fde047';
          ctx.lineWidth = 4;
          ctx.stroke();
        } else if (s.style === 'earth_slam') {
          ctx.strokeStyle = '#34d399';
          ctx.lineWidth = 8;
          ctx.beginPath();
          ctx.ellipse(0, 0, s.radius * (0.4 + (1 - alpha) * 0.7), 22, 0, 0, Math.PI * 2);
          ctx.stroke();
        } else if (s.style === 'kira_shadow') {
          ctx.shadowColor = '#a855f7';
          ctx.shadowBlur = 16;
          ctx.strokeStyle = '#c084fc';
          ctx.lineWidth = 11;
          ctx.beginPath();
          ctx.arc(0, 0, s.radius, -1.2, 1.2);
          ctx.stroke();
        } else if (s.style === 'fire_water') {
          ctx.shadowColor = '#f97316';
          ctx.shadowBlur = 14;
          ctx.strokeStyle = '#fb923c';
          ctx.lineWidth = 12;
          ctx.beginPath();
          ctx.arc(0, 0, s.radius, -1.15, 1.15);
          ctx.stroke();
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 6;
          ctx.beginPath();
          ctx.arc(0, 0, s.radius * 0.82, -0.95, 1.25);
          ctx.stroke();
        } else {
          ctx.strokeStyle =
            s.style === 'boss'
              ? '#ef4444'
              : s.style === 'steel'
              ? '#60a5fa'
              : s.style === 'wood'
              ? '#d97706'
              : '#e2e8f0';
          ctx.lineWidth = 7;
          ctx.beginPath();
          ctx.arc(0, 0, s.radius, -1.0, 1.0);
          ctx.stroke();
        }
        ctx.restore();
      });

      // Projectiles
      projectiles.forEach((p) => {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(Math.atan2(p.vy, p.vx));
        if (p.kind === 'fire_arrow') {
          ctx.shadowColor = '#f97316';
          ctx.shadowBlur = 14;
          ctx.fillStyle = '#fde047';
          ctx.fillRect(-18, -2.5, 36, 5);
          ctx.fillStyle = '#ef4444';
          ctx.beginPath();
          ctx.arc(18, 0, 6.5, 0, Math.PI * 2);
          ctx.fill();
        } else if (p.kind === 'ice_dragon' || p.kind === 'ice_spear') {
          ctx.shadowColor = '#38bdf8';
          ctx.shadowBlur = 14;
          ctx.fillStyle = '#38bdf8';
          ctx.beginPath();
          ctx.ellipse(0, 0, p.kind === 'ice_spear' ? 24 : 20, 7.5, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.ellipse(5, 0, 10, 3.8, 0, 0, Math.PI * 2);
          ctx.fill();
        } else if (p.kind === 'shadow_rain_arrow') {
          ctx.fillStyle = '#c084fc';
          ctx.fillRect(-16, -2.5, 32, 5);
        } else if (p.kind === 'boss_fireball') {
          ctx.shadowColor = '#ef4444';
          ctx.shadowBlur = 16;
          ctx.fillStyle = '#dc2626';
          ctx.beginPath();
          ctx.arc(0, 0, 14, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#fde047';
          ctx.beginPath();
          ctx.arc(3, 0, 7, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle =
            p.kind === 'rimba_arrow'
              ? '#34d399'
              : p.kind === 'shadow_bullet'
              ? '#a78bfa'
              : '#d97706';
          ctx.fillRect(-13, -2.5, 26, 5);
        }
        ctx.restore();
      });

      // Soft Particles
      particles.forEach((pt) => {
        const progress = pt.life / pt.maxLife;
        const alpha = 1 - progress;
        ctx.save();
        if (pt.glow) ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = alpha;
        if (pt.ring) {
          ctx.strokeStyle = pt.colorCore;
          ctx.lineWidth = 3.5;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, pt.size + pt.life * 2.8, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          const r = Math.max(1, pt.size * (1 - progress * 0.45));
          const pg = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, r);
          pg.addColorStop(0, pt.colorCore);
          pg.addColorStop(1, pt.colorEdge);
          ctx.fillStyle = pg;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      });

      if (stageBannerTimer > 0) {
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.72)';
        ctx.fillRect(ARENA_W / 2 - 260, 108, 520, 48);
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 2;
        ctx.strokeRect(ARENA_W / 2 - 260, 108, 520, 48);
        ctx.font = '900 18px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fde047';
        ctx.fillText(stageBannerText, ARENA_W / 2, 138);
        ctx.restore();
      }

      ctx.restore();
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [
    mode,
    aiDifficulty,
    onlineRoom?.roomId,
    profile.userId,
    profile.equippedCharacter,
    profile.equippedWeapon,
    profile.equippedSkin
  ]);

  const setKey = (
    key: 'left' | 'right' | 'jump' | 'attack' | 'skill' | 'skill1' | 'skill2' | 'dash' | 'block',
    val: boolean
  ) => {
    if (isEditControls) return;
    if (val) stickmanAudio.unlock();
    keysRef.current[key] = val;
  };

  const getLocalArenaCoords = (clientX: number, clientY: number) => {
    const el = containerRef.current;
    if (!el) return { xPct: 50, yPct: 50 };
    if (isRotated90) {
      const logicalW = window.innerHeight || 1;
      const logicalH = window.innerWidth || 1;
      return {
        xPct: Math.max(5, Math.min(95, (clientY / logicalW) * 100)),
        yPct: Math.max(12, Math.min(90, ((logicalH - clientX) / logicalH) * 100))
      };
    }
    const rect = el.getBoundingClientRect();
    return {
      xPct: Math.max(5, Math.min(95, ((clientX - rect.left) / Math.max(1, rect.width)) * 100)),
      yPct: Math.max(12, Math.min(90, ((clientY - rect.top) / Math.max(1, rect.height)) * 100))
    };
  };

  const updateControlItem = (id: ControlButtonId, patch: Partial<{ xPct: number; yPct: number; scale: number }>) => {
    setControlLayout((prev) => {
      const next: ControlLayoutMap = {
        ...prev,
        [id]: { ...prev[id], ...patch }
      };
      saveControlLayout(profile.userId, next);
      return next;
    });
  };

  const handleArenaPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isEditControls || !btnDragRef.current.id) return;
    const { xPct, yPct } = getLocalArenaCoords(e.clientX, e.clientY);
    updateControlItem(btnDragRef.current.id, { xPct, yPct });
  };

  const handleArenaPointerUp = () => {
    btnDragRef.current.id = null;
  };

  const handleControlTouchStart = (id: ControlButtonId, e: React.TouchEvent) => {
    if (!isEditControls) return;
    setSelectedControlId(id);
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      btnDragRef.current.pinchStartDist = Math.max(1, dist);
      btnDragRef.current.pinchStartScale = controlLayout[id].scale;
    }
  };

  const handleControlTouchMove = (id: ControlButtonId, e: React.TouchEvent) => {
    if (!isEditControls || e.touches.length !== 2) return;
    const dist = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    );
    const ratio = dist / Math.max(1, btnDragRef.current.pinchStartDist);
    const nextScale = Math.max(0.6, Math.min(1.75, btnDragRef.current.pinchStartScale * ratio));
    updateControlItem(id, { scale: Number(nextScale.toFixed(2)) });
  };

  const updateAudio = (patch: Partial<StickmanAudioSettings>) => {
    stickmanAudio.updateSettings(patch);
    setAudioState({ ...stickmanAudio.settings });
  };

  const renderControlStyle = (id: ControlButtonId): React.CSSProperties => {
    const cfg = controlLayout[id];
    return {
      left: `${cfg.xPct}%`,
      top: `${cfg.yPct}%`,
      transform: `translate(-50%, -50%) scale(${cfg.scale})`
    };
  };

  return (
    <div
      ref={containerRef}
      onPointerMove={handleArenaPointerMove}
      onPointerUp={handleArenaPointerUp}
      className="w-full h-full relative bg-[#070b14] select-none overflow-hidden flex flex-col"
    >
      {/* TOP HUD */}
      <div className="absolute top-2.5 left-3 right-3 z-20 flex items-center justify-between gap-4 pointer-events-none">
        <div className="flex-1 max-w-[36%] bg-black/75 border border-white/15 rounded-xl px-3 py-1.5 backdrop-blur-sm">
          <div className="flex items-center justify-between text-[11px] font-black text-white mb-1">
            <span className="truncate">
              {playerCharDef.name} ({userName}) · {activeWeaponLabel}
            </span>
            <span className="text-sky-300 tabular-nums shrink-0 ml-1">
              {hudState.playerHp}/{hudState.playerMaxHp}
            </span>
          </div>
          <div className="h-2.5 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-sky-400 transition-all duration-100"
              style={{ width: `${(hudState.playerHp / hudState.playerMaxHp) * 100}%` }}
            />
          </div>
          {hudState.dragonActiveSec > 0 && (
            <div className="mt-0.5 text-[9px] font-black text-amber-300 uppercase">
              MODE NAGA API AKTIF: {hudState.dragonActiveSec} dtk
            </div>
          )}
          {hudState.allyMaxHp > 0 && (
            <div className="mt-0.5 flex items-center gap-2 text-[9px] text-emerald-300 font-bold">
              <span>Rekan: {hudState.allyName}</span>
              <span className="tabular-nums">{hudState.allyHp}/{hudState.allyMaxHp}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 pointer-events-auto">
          {mode === 'boss' && (
            <div className="px-2.5 py-1 rounded-lg bg-black/75 border border-amber-400/40 text-[11px] font-black text-amber-300">
              STAGE {hudState.stage}/3
            </div>
          )}
          <button
            type="button"
            onClick={() => updateAudio({ muted: !audioState.muted })}
            className="w-8 h-8 rounded-lg bg-black/75 border border-white/15 flex items-center justify-center text-white cursor-pointer"
            title="Mute / Unmute"
          >
            {audioState.muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </button>
          <button
            type="button"
            onClick={() => {
              setSettingsTab('main');
              setIsPaused((p) => !p);
            }}
            className="w-8 h-8 rounded-lg bg-black/75 border border-white/15 flex items-center justify-center text-white cursor-pointer"
            title="Pengaturan / Jeda"
          >
            {isPaused ? <Play size={15} /> : <Pause size={15} />}
          </button>
        </div>

        <div className="flex-1 max-w-[34%] bg-black/75 border border-white/15 rounded-xl px-3 py-1.5 backdrop-blur-sm">
          <div className="flex items-center justify-between text-[11px] font-black text-white mb-1">
            <span className="text-rose-300 tabular-nums">
              {hudState.enemyHp}/{hudState.enemyMaxHp}
            </span>
            <span className="truncate">{hudState.enemyName}</span>
          </div>
          <div className="h-2.5 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-orange-500 to-rose-600 transition-all duration-100 ml-auto"
              style={{ width: `${(hudState.enemyHp / hudState.enemyMaxHp) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {switchBanner && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-30 px-3.5 py-1 rounded-xl bg-black/85 border border-amber-400/50 text-[11px] font-black text-amber-200 pointer-events-none">
          {switchBanner}
        </div>
      )}

      {/* GAME CANVAS */}
      <canvas
        ref={canvasRef}
        width={ARENA_W}
        height={ARENA_H}
        className="w-full h-full object-contain bg-[#070b14]"
      />

      {/* CUSTOMIZABLE TOUCH CONTROLS (MUNDUR/MAJU HOLD + LONCAT + SKILL 1/2 RING + WEAPON ACTIONS) */}
      <div className="absolute inset-0 z-20 pointer-events-none">
        {/* 1. MUNDUR (Kiri Bawah) */}
        <button
          type="button"
          style={renderControlStyle('moveLeft')}
          onPointerDown={() => {
            if (isEditControls) {
              btnDragRef.current.id = 'moveLeft';
              setSelectedControlId('moveLeft');
            } else {
              setKey('left', true);
            }
          }}
          onPointerUp={() => setKey('left', false)}
          onPointerLeave={() => setKey('left', false)}
          onPointerCancel={() => setKey('left', false)}
          onTouchStart={(e) => handleControlTouchStart('moveLeft', e)}
          onTouchMove={(e) => handleControlTouchMove('moveLeft', e)}
          className={`absolute pointer-events-auto w-16 h-16 rounded-2xl bg-black/70 border-2 text-white font-black text-[10px] uppercase flex flex-col items-center justify-center active:scale-90 touch-none cursor-pointer shadow-lg ${
            isEditControls && selectedControlId === 'moveLeft'
              ? 'border-amber-300 ring-4 ring-amber-400/40'
              : isEditControls
              ? 'border-sky-400 border-dashed'
              : 'border-white/30'
          }`}
        >
          <ChevronLeft size={24} />
          <span>MUNDUR</span>
        </button>

        {/* 2. MAJU (Kiri Bawah Sebelah MUNDUR) */}
        <button
          type="button"
          style={renderControlStyle('moveRight')}
          onPointerDown={() => {
            if (isEditControls) {
              btnDragRef.current.id = 'moveRight';
              setSelectedControlId('moveRight');
            } else {
              setKey('right', true);
            }
          }}
          onPointerUp={() => setKey('right', false)}
          onPointerLeave={() => setKey('right', false)}
          onPointerCancel={() => setKey('right', false)}
          onTouchStart={(e) => handleControlTouchStart('moveRight', e)}
          onTouchMove={(e) => handleControlTouchMove('moveRight', e)}
          className={`absolute pointer-events-auto w-16 h-16 rounded-2xl bg-black/70 border-2 text-white font-black text-[10px] uppercase flex flex-col items-center justify-center active:scale-90 touch-none cursor-pointer shadow-lg ${
            isEditControls && selectedControlId === 'moveRight'
              ? 'border-amber-300 ring-4 ring-amber-400/40'
              : isEditControls
              ? 'border-sky-400 border-dashed'
              : 'border-white/30'
          }`}
        >
          <ChevronRight size={24} />
          <span>MAJU</span>
        </button>

        {/* 3. LONCAT (Kanan Bawah Paling Besar) */}
        <button
          type="button"
          style={renderControlStyle('jump')}
          onPointerDown={() => {
            if (isEditControls) {
              btnDragRef.current.id = 'jump';
              setSelectedControlId('jump');
            } else {
              setKey('jump', true);
            }
          }}
          onPointerUp={() => setKey('jump', false)}
          onPointerLeave={() => setKey('jump', false)}
          onPointerCancel={() => setKey('jump', false)}
          onTouchStart={(e) => handleControlTouchStart('jump', e)}
          onTouchMove={(e) => handleControlTouchMove('jump', e)}
          className={`absolute pointer-events-auto touch-none w-16 h-16 rounded-full bg-gradient-to-br from-sky-500 to-blue-700 border-2 text-white font-black text-[10px] uppercase flex flex-col items-center justify-center active:scale-90 cursor-pointer shadow-[0_0_24px_rgba(56,189,248,0.45)] ${
            isEditControls && selectedControlId === 'jump'
              ? 'border-amber-300 ring-4 ring-amber-400/40'
              : isEditControls
              ? 'border-amber-400 border-dashed'
              : 'border-sky-200'
          }`}
        >
          <ChevronUp size={20} />
          <span>LONCAT</span>
        </button>

        {/* 4. SKILL 1 KARAKTER (Kanan Atas Tombol LONCAT + Circular Cooldown Ring) */}
        <button
          type="button"
          style={renderControlStyle('skill1')}
          onPointerDown={() => {
            if (isEditControls) {
              btnDragRef.current.id = 'skill1';
              setSelectedControlId('skill1');
            } else {
              setKey('skill1', true);
            }
          }}
          onPointerUp={() => setKey('skill1', false)}
          onPointerLeave={() => setKey('skill1', false)}
          onPointerCancel={() => setKey('skill1', false)}
          onTouchStart={(e) => handleControlTouchStart('skill1', e)}
          onTouchMove={(e) => handleControlTouchMove('skill1', e)}
          className={`relative absolute pointer-events-auto touch-none w-15 h-15 rounded-full bg-gradient-to-br from-red-950/90 to-black border text-white font-black text-[8.5px] uppercase flex flex-col items-center justify-center active:scale-90 cursor-pointer shadow-lg ${
            isEditControls && selectedControlId === 'skill1'
              ? 'border-amber-300 ring-4 ring-amber-400/40'
              : hudState.skill1Pct >= 100
              ? 'border-red-400 shadow-[0_0_16px_rgba(239,68,68,0.5)]'
              : 'border-white/20 opacity-80'
          }`}
        >
          <CooldownRing progress={hudState.skill1Pct / 100} color={playerCharDef.accentColor} />
          <Zap size={14} className="text-red-300" />
          <span>{hudState.skill1SecLeft > 0 && !isEditControls ? `${hudState.skill1SecLeft}s` : 'SKILL 1'}</span>
        </button>

        {/* 5. SKILL 2 KARAKTER (Kanan Atas Tombol LONCAT + Circular Cooldown Ring) */}
        <button
          type="button"
          style={renderControlStyle('skill2')}
          onPointerDown={() => {
            if (isEditControls) {
              btnDragRef.current.id = 'skill2';
              setSelectedControlId('skill2');
            } else {
              setKey('skill2', true);
            }
          }}
          onPointerUp={() => setKey('skill2', false)}
          onPointerLeave={() => setKey('skill2', false)}
          onPointerCancel={() => setKey('skill2', false)}
          onTouchStart={(e) => handleControlTouchStart('skill2', e)}
          onTouchMove={(e) => handleControlTouchMove('skill2', e)}
          className={`relative absolute pointer-events-auto touch-none w-15 h-15 rounded-full bg-gradient-to-br from-orange-950/90 to-black border text-white font-black text-[8.5px] uppercase flex flex-col items-center justify-center active:scale-90 cursor-pointer shadow-lg ${
            isEditControls && selectedControlId === 'skill2'
              ? 'border-amber-300 ring-4 ring-amber-400/40'
              : hudState.skill2Pct >= 100
              ? 'border-amber-400 shadow-[0_0_16px_rgba(245,158,11,0.5)]'
              : 'border-white/20 opacity-80'
          }`}
        >
          <CooldownRing progress={hudState.skill2Pct / 100} color={playerCharDef.auraColor} />
          <Flame size={14} className="text-amber-300" />
          <span>{hudState.skill2SecLeft > 0 && !isEditControls ? `${hudState.skill2SecLeft}s` : 'SKILL 2'}</span>
        </button>

        {/* 6. SERANG */}
        <button
          type="button"
          style={renderControlStyle('attack')}
          onPointerDown={() => {
            if (isEditControls) {
              btnDragRef.current.id = 'attack';
              setSelectedControlId('attack');
            } else {
              setKey('attack', true);
            }
          }}
          onPointerUp={() => setKey('attack', false)}
          onPointerLeave={() => setKey('attack', false)}
          onPointerCancel={() => setKey('attack', false)}
          onTouchStart={(e) => handleControlTouchStart('attack', e)}
          onTouchMove={(e) => handleControlTouchMove('attack', e)}
          className={`absolute pointer-events-auto touch-none w-16 h-16 rounded-full bg-gradient-to-br from-orange-500 to-red-600 border-2 text-white font-black text-[10px] uppercase flex flex-col items-center justify-center active:scale-90 shadow-[0_0_24px_rgba(249,115,22,0.55)] cursor-pointer ${
            isEditControls && selectedControlId === 'attack'
              ? 'border-amber-300 ring-4 ring-amber-400/40'
              : isEditControls
              ? 'border-amber-400 border-dashed'
              : 'border-amber-200'
          }`}
        >
          <Swords size={20} />
          <span>SERANG</span>
        </button>

        {/* 7. SKILL SENJATA */}
        <button
          type="button"
          style={renderControlStyle('skill')}
          onPointerDown={() => {
            if (isEditControls) {
              btnDragRef.current.id = 'skill';
              setSelectedControlId('skill');
            } else {
              setKey('skill', true);
            }
          }}
          onPointerUp={() => setKey('skill', false)}
          onPointerLeave={() => setKey('skill', false)}
          onPointerCancel={() => setKey('skill', false)}
          onTouchStart={(e) => handleControlTouchStart('skill', e)}
          onTouchMove={(e) => handleControlTouchMove('skill', e)}
          className={`absolute pointer-events-auto touch-none w-14 h-14 rounded-2xl bg-amber-950/90 border-2 text-amber-200 font-black text-[9px] uppercase flex flex-col items-center justify-center active:scale-90 cursor-pointer overflow-hidden ${
            isEditControls && selectedControlId === 'skill'
              ? 'border-amber-300 ring-4 ring-amber-400/40'
              : isEditControls
              ? 'border-amber-400 border-dashed'
              : 'border-amber-400/65'
          }`}
        >
          <Flame size={16} className="text-amber-300" />
          <span>SENJATA</span>
          {hudState.skillReadyPct < 100 && !isEditControls && (
            <div
              className="absolute inset-x-0 bottom-0 bg-black/65 pointer-events-none"
              style={{ height: `${100 - hudState.skillReadyPct}%` }}
            />
          )}
        </button>

        {/* 8. DASH */}
        <button
          type="button"
          style={renderControlStyle('dash')}
          onPointerDown={() => {
            if (isEditControls) {
              btnDragRef.current.id = 'dash';
              setSelectedControlId('dash');
            } else {
              setKey('dash', true);
            }
          }}
          onPointerUp={() => setKey('dash', false)}
          onPointerLeave={() => setKey('dash', false)}
          onPointerCancel={() => setKey('dash', false)}
          onTouchStart={(e) => handleControlTouchStart('dash', e)}
          onTouchMove={(e) => handleControlTouchMove('dash', e)}
          className={`absolute pointer-events-auto touch-none w-14 h-14 rounded-2xl bg-zinc-900/85 border-2 text-white font-black text-[10px] uppercase flex flex-col items-center justify-center active:scale-90 cursor-pointer overflow-hidden ${
            isEditControls && selectedControlId === 'dash'
              ? 'border-amber-300 ring-4 ring-amber-400/40'
              : isEditControls
              ? 'border-amber-400 border-dashed'
              : 'border-white/30'
          }`}
        >
          <Zap size={16} className="text-amber-300" />
          <span>DASH</span>
          {hudState.dashReadyPct < 100 && !isEditControls && (
            <div
              className="absolute inset-x-0 bottom-0 bg-amber-400/30 pointer-events-none"
              style={{ height: `${100 - hudState.dashReadyPct}%` }}
            />
          )}
        </button>

        {/* 9. GANTI SENJATA */}
        <button
          type="button"
          style={renderControlStyle('switchWeapon')}
          onPointerDown={() => {
            if (isEditControls) {
              btnDragRef.current.id = 'switchWeapon';
              setSelectedControlId('switchWeapon');
            } else {
              handleCycleWeapon();
            }
          }}
          onTouchStart={(e) => handleControlTouchStart('switchWeapon', e)}
          onTouchMove={(e) => handleControlTouchMove('switchWeapon', e)}
          className={`absolute pointer-events-auto touch-none w-14 h-14 rounded-2xl bg-emerald-950/85 border-2 text-emerald-200 font-black text-[9px] uppercase flex flex-col items-center justify-center active:scale-90 cursor-pointer text-center leading-tight px-1 ${
            isEditControls && selectedControlId === 'switchWeapon'
              ? 'border-amber-300 ring-4 ring-amber-400/40'
              : isEditControls
              ? 'border-amber-400 border-dashed'
              : 'border-emerald-400/50'
          }`}
        >
          <RefreshCw size={15} className="text-emerald-300 mb-0.5" />
          <span>GANTI</span>
        </button>

        {/* 10. TAHAN */}
        <button
          type="button"
          style={renderControlStyle('block')}
          onPointerDown={() => {
            if (isEditControls) {
              btnDragRef.current.id = 'block';
              setSelectedControlId('block');
            } else {
              setKey('block', true);
            }
          }}
          onPointerUp={() => setKey('block', false)}
          onPointerLeave={() => setKey('block', false)}
          onPointerCancel={() => setKey('block', false)}
          onTouchStart={(e) => handleControlTouchStart('block', e)}
          onTouchMove={(e) => handleControlTouchMove('block', e)}
          className={`absolute pointer-events-auto touch-none w-12 h-12 rounded-2xl bg-sky-950/80 border-2 text-sky-200 font-black text-[9px] uppercase flex flex-col items-center justify-center active:scale-90 cursor-pointer ${
            isEditControls && selectedControlId === 'block'
              ? 'border-amber-300 ring-4 ring-amber-400/40'
              : isEditControls
              ? 'border-amber-400 border-dashed'
              : 'border-sky-400/45'
          }`}
        >
          <Shield size={15} />
          <span>TAHAN</span>
        </button>
      </div>

      {/* MODE ATUR TOMBOL HUD BAR */}
      {isEditControls && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-40 w-[92%] max-w-xl rounded-2xl bg-black/90 border border-amber-400/60 px-4 py-2.5 flex items-center justify-between gap-3 shadow-2xl">
          <div className="flex items-center gap-2 min-w-0">
            <Move size={16} className="text-amber-300 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-black text-amber-200 truncate">
                Mode Atur Tombol ON · Seret tombol ke mana saja
              </p>
              <p className="text-[10px] text-zinc-400 truncate">
                Dipilih: <b className="text-white">{controlLayout[selectedControlId].label}</b> (Cubit atau geser slider)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <label className="flex items-center gap-2 text-[11px] font-bold text-white">
              <span>Ukuran</span>
              <input
                type="range"
                min={0.6}
                max={1.75}
                step={0.05}
                value={controlLayout[selectedControlId].scale}
                onChange={(e) =>
                  updateControlItem(selectedControlId, { scale: Number(e.target.value) })
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
                saveControlLayout(profile.userId, DEFAULT_CONTROL_LAYOUT);
              }}
              className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-[10px] font-bold text-white cursor-pointer"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={() => setIsEditControls(false)}
              className="px-3 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-black text-[11px] font-black uppercase cursor-pointer"
            >
              Simpan
            </button>
          </div>
        </div>
      )}

      {/* PAUSE & SETTINGS OVERLAY */}
      {isPaused && !matchResult && !isEditControls && (
        <div className="absolute inset-0 z-30 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-sm w-full rounded-2xl border border-white/15 bg-[#0c121e] p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <h3 className="text-sm font-black uppercase text-white">
                {settingsTab === 'audio' ? 'Pengaturan Suara' : 'Pertarungan Dijeda'}
              </h3>
              {settingsTab === 'audio' && (
                <button
                  type="button"
                  onClick={() => setSettingsTab('main')}
                  className="text-xs font-bold text-amber-300 cursor-pointer"
                >
                  Kembali
                </button>
              )}
            </div>

            {settingsTab === 'main' ? (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setIsPaused(false)}
                  className="w-full py-2.5 rounded-xl bg-amber-500 text-black font-black text-xs uppercase cursor-pointer"
                >
                  Lanjutkan Pertarungan
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsPaused(false);
                    setIsEditControls(true);
                  }}
                  className="w-full py-2.5 rounded-xl bg-sky-500/20 border border-sky-400/40 text-sky-200 font-black text-xs uppercase flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Move size={14} />
                  <span>Atur Tombol (Posisi &amp; Ukuran)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSettingsTab('audio')}
                  className="w-full py-2.5 rounded-xl bg-white/10 border border-white/15 text-white font-bold text-xs uppercase flex items-center justify-center gap-2 cursor-pointer"
                >
                  <SlidersHorizontal size={14} />
                  <span>Volume Musik &amp; Efek</span>
                </button>
                <button
                  type="button"
                  onClick={onExitToLobby}
                  className="w-full py-2.5 rounded-xl bg-rose-950/60 border border-rose-500/30 text-rose-200 font-bold text-xs uppercase cursor-pointer"
                >
                  Keluar ke Lobby
                </button>
              </div>
            ) : (
              <div className="space-y-3 text-xs">
                <div className="space-y-1">
                  <div className="flex justify-between font-bold text-zinc-200">
                    <span>Volume Musik</span>
                    <span className="tabular-nums text-amber-300">{audioState.musicVolume}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={audioState.musicVolume}
                    onChange={(e) => updateAudio({ musicVolume: Number(e.target.value) })}
                    className="w-full accent-amber-400"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between font-bold text-zinc-200">
                    <span>Volume Efek Suara</span>
                    <span className="tabular-nums text-sky-300">{audioState.sfxVolume}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={audioState.sfxVolume}
                    onChange={(e) => updateAudio({ sfxVolume: Number(e.target.value) })}
                    className="w-full accent-sky-400"
                  />
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="font-bold text-zinc-200">Mute Semua Suara</span>
                  <button
                    type="button"
                    onClick={() => updateAudio({ muted: !audioState.muted })}
                    className={`px-3 py-1 rounded-lg font-black cursor-pointer ${
                      audioState.muted ? 'bg-rose-500 text-white' : 'bg-emerald-500 text-black'
                    }`}
                  >
                    {audioState.muted ? 'MUTE ON' : 'SUARA AKTIF'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* VICTORY / DEFEAT SUMMARY MODAL */}
      {matchResult && (
        <div className="absolute inset-0 z-40 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div
            className={`max-w-sm w-full rounded-3xl border-2 p-5 text-center space-y-3.5 shadow-2xl ${
              matchResult.won
                ? 'border-amber-400 bg-gradient-to-b from-amber-950/80 to-black'
                : 'border-zinc-600 bg-gradient-to-b from-zinc-900 to-black'
            }`}
          >
            <h2
              className={`text-2xl font-black uppercase tracking-wider ${
                matchResult.won ? 'text-amber-300' : 'text-zinc-300'
              }`}
            >
              {matchResult.won ? 'KEMENANGAN!' : 'KALAH'}
            </h2>
            <p className="text-xs text-zinc-300">
              {matchResult.won
                ? 'Lawan berhasil ditumbangkan!'
                : 'Tetap semangat! Kumpulkan koin untuk beli karakter & upgrade senjata.'}
            </p>

            <div className="rounded-2xl bg-black/60 border border-white/10 p-3 flex items-center justify-around">
              <div className="flex flex-col items-center">
                <span className="text-[10px] text-zinc-400 uppercase font-bold">Hadiah Koin</span>
                <span className="text-base font-black text-amber-300 flex items-center gap-1">
                  <Coins size={15} /> +{matchResult.coinsEarned}
                </span>
              </div>
              <div className="w-px h-8 bg-white/10" />
              <div className="flex flex-col items-center">
                <span className="text-[10px] text-zinc-400 uppercase font-bold">EXP</span>
                <span className="text-base font-black text-sky-300">+{matchResult.xpEarned} XP</span>
              </div>
            </div>

            {matchResult.leveledUp && (
              <p className="text-xs font-black text-emerald-300 uppercase tracking-wider">
                NAIK LEVEL! LV.{profile.level}
              </p>
            )}

            <div className="flex items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={onExitToLobby}
                className="flex-1 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white font-bold text-xs uppercase flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft size={14} />
                <span>Lobby</span>
              </button>
              {mode !== '1v1_online' && (
                <button
                  type="button"
                  onClick={onPlayAgain}
                  className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs uppercase flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw size={14} />
                  <span>Main Lagi</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
