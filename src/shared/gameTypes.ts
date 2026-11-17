export type BuildPieceType = 'wall' | 'floor' | 'ramp' | 'roof';
export type BuildMaterial = 'wood' | 'brick' | 'metal';
export type WeaponId = 'pickaxe' | 'ar' | 'shotgun' | 'smg' | 'sniper';
export type ConsumableId = 'mini_shield' | 'big_shield' | 'medkit';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export type VoiceMode = 'proximity' | 'global';

export const ISLAND_RADIUS = 130;
export const CELL_SIZE = 4;
export const WALL_HEIGHT = 3;
export const BUILD_COST = 10;

export const MATERIAL_MAX_HP: Record<BuildMaterial, number> = {
  wood: 150,
  brick: 300,
  metal: 500,
};

export interface WeaponSpec {
  id: WeaponId;
  name: string;
  shortName: string;
  rarity: Rarity;
  damage: number;
  buildDamage: number;
  fireRateMs: number;
  range: number;
  spread: number;
  pellets: number;
  magSize: number;
  reloadMs: number;
  auto: boolean;
  adsFov: number;
}

export const WEAPONS: Record<WeaponId, WeaponSpec> = {
  pickaxe: {
    id: 'pickaxe',
    name: 'Pico Táctico',
    shortName: 'Pico',
    rarity: 'common',
    damage: 25,
    buildDamage: 65,
    fireRateMs: 420,
    range: 4.4,
    spread: 0.01,
    pellets: 1,
    magSize: 0,
    reloadMs: 0,
    auto: true,
    adsFov: 62,
  },
  ar: {
    id: 'ar',
    name: 'Fusil de Asalto',
    shortName: 'Fusil',
    rarity: 'rare',
    damage: 32,
    buildDamage: 34,
    fireRateMs: 165,
    range: 140,
    spread: 0.022,
    pellets: 1,
    magSize: 30,
    reloadMs: 1600,
    auto: true,
    adsFov: 48,
  },
  shotgun: {
    id: 'shotgun',
    name: 'Escopeta Táctica',
    shortName: 'Escopeta',
    rarity: 'epic',
    damage: 13,
    buildDamage: 16,
    fireRateMs: 680,
    range: 34,
    spread: 0.075,
    pellets: 8,
    magSize: 8,
    reloadMs: 1850,
    auto: false,
    adsFov: 54,
  },
  smg: {
    id: 'smg',
    name: 'Subfusil Compacto',
    shortName: 'Subfusil',
    rarity: 'uncommon',
    damage: 19,
    buildDamage: 22,
    fireRateMs: 92,
    range: 72,
    spread: 0.036,
    pellets: 1,
    magSize: 35,
    reloadMs: 1450,
    auto: true,
    adsFov: 52,
  },
  sniper: {
    id: 'sniper',
    name: 'Rifle de Francotirador',
    shortName: 'Sniper',
    rarity: 'legendary',
    damage: 98,
    buildDamage: 85,
    fireRateMs: 1350,
    range: 220,
    spread: 0.002,
    pellets: 1,
    magSize: 5,
    reloadMs: 2100,
    auto: false,
    adsFov: 26,
  },
};

export interface BuildPiece {
  id: string;
  type: BuildPieceType;
  material: BuildMaterial;
  gx: number;
  gy: number;
  gz: number;
  rot: number; // 0, 1, 2, 3 (multiples of 90 deg)
  hp: number;
  maxHp: number;
  ownerId: string;
}

export interface ResourceNode {
  id: string;
  kind: 'tree' | 'rock' | 'crate';
  x: number;
  y: number;
  z: number;
  scale: number;
  rotY: number;
  hp: number;
  maxHp: number;
  material: BuildMaterial;
  yieldAmount: number;
}

export interface LootItem {
  id: string;
  kind: 'weapon' | 'consumable' | 'mats';
  weaponId?: WeaponId;
  consumableId?: ConsumableId;
  material?: BuildMaterial;
  amount: number;
  x: number;
  y: number;
  z: number;
}

export interface TargetDrone {
  id: string;
  x: number;
  y: number;
  z: number;
  hp: number;
  maxHp: number;
  respawnAt: number;
}

export interface PlayerState {
  id: string;
  name: string;
  skinColor: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  hp: number;
  shield: number;
  alive: boolean;
  kills: number;
  activeSlot: number; // 0=pickaxe, 1..4 weapons
  weaponId: WeaponId;
  buildMode: boolean;
  stance: 'idle' | 'run' | 'jump' | 'crouch';
  materials: Record<BuildMaterial, number>;
  weaponsUnlocked: WeaponId[];
  consumables: Record<ConsumableId, number>;
  isSpeaking: boolean;
  voiceMuted: boolean;
}

export interface StormState {
  phase: number;
  centerX: number;
  centerZ: number;
  currentRadius: number;
  targetRadius: number;
  nextShrinkIn: number;
  isShrinking: boolean;
  dps: number;
}

export interface KillFeedItem {
  id: string;
  killerName: string;
  victimName: string;
  weaponName: string;
  timestamp: number;
}

export interface RoomSummary {
  roomId: string;
  players: number;
  alive: number;
  phase: 'waiting' | 'active' | 'ended';
}

export const SKIN_PALETTE = [
  { id: 'cobalt', name: 'Cobalto Táctico', hex: '#2563eb' },
  { id: 'crimson', name: 'Carmesí Élite', hex: '#dc2626' },
  { id: 'emerald', name: 'Guardia Esmeralda', hex: '#059669' },
  { id: 'amber', name: 'Vanguardia Ámbar', hex: '#d97706' },
  { id: 'violet', name: 'Sombra Violeta', hex: '#7c3aed' },
  { id: 'slate', name: 'Titanio Negro', hex: '#334155' },
];

/**
 * Deterministic multi-octave island height function shared by server and client.
 * Returns Y elevation at world coordinates (x, z). Sea level is y <= 0.
 */
export function groundHeightAt(x: number, z: number): number {
  const dist = Math.hypot(x, z);
  const edgeFade = Math.max(0, Math.min(1, (ISLAND_RADIUS - dist) / 26));
  const smoothFade = edgeFade * edgeFade * (3 - 2 * edgeFade);

  // Gentle rolling hills + central plateau
  const hill1 = Math.sin(x * 0.032) * Math.cos(z * 0.032) * 3.8;
  const hill2 = Math.sin(x * 0.075 + 1.3) * Math.sin(z * 0.068 + 0.7) * 1.4;
  const ridge = Math.cos((x + z) * 0.021) * 1.9;

  // Flatten central plaza slightly around (0, 0)
  const centerDist = Math.hypot(x, z);
  const plazaBlend = Math.min(1, Math.max(0, (centerDist - 12) / 18));

  const rawHeight = 2.2 + (hill1 + hill2 + ridge) * plazaBlend;
  const beachDrop = (1 - smoothFade) * -4.2;
  return Number((rawHeight * smoothFade + beachDrop).toFixed(3));
}

export function buildKey(type: BuildPieceType, gx: number, gy: number, gz: number, rot: number): string {
  const normRot = ((rot % 4) + 4) % 4;
  if (type === 'floor' || type === 'roof') {
    return `${type}:${gx}:${gy}:${gz}`;
  }
  if (type === 'wall') {
    // Wall sits on an edge between cells; normalize so opposing rotations share the edge or keep directional
    return `${type}:${gx}:${gy}:${gz}:${normRot}`;
  }
  return `${type}:${gx}:${gy}:${gz}:${normRot}`;
}
