// ============================================================
// Shared Types — 艾德里安·星织 (Adrian Starweaver)
// ============================================================

// --- Enums ---

export enum GameEvents {
  SPELL_CAST = 'SPELL_CAST',
  SPELL_HIT = 'SPELL_HIT',
  ENEMY_KILL = 'ENEMY_KILL',
  ENEMY_DAMAGED = 'ENEMY_DAMAGED',
  PLAYER_DAMAGED = 'PLAYER_DAMAGED',
  PLAYER_HEAL = 'PLAYER_HEAL',
  CRIT = 'CRIT',
  STATUS_APPLY = 'STATUS_APPLY',
  STATUS_EXPIRE = 'STATUS_EXPIRE',
  XP_GAINED = 'XP_GAINED',
  LEVEL_UP = 'LEVEL_UP',
  UPGRADE_CHOSEN = 'UPGRADE_CHOSEN',
  RELIC_ACQUIRED = 'RELIC_ACQUIRED',
  WAVE_START = 'WAVE_START',
  RUN_START = 'RUN_START',
  RUN_END = 'RUN_END',
  PHASE_CHANGE = 'PHASE_CHANGE',
  PICKUP_COLLECTED = 'PICKUP_COLLECTED',
  BUFF_GAINED = 'BUFF_GAINED',
  ZONE_ENTER = 'ZONE_ENTER',
}

export enum RunPhase {
  EARLY = 'EARLY',
  MID_EARLY = 'MID_EARLY',
  MID = 'MID',
  MID_LATE = 'MID_LATE',
  LATE = 'LATE',
  BOSS = 'BOSS',
}

export enum ElementType {
  FIRE = 'FIRE',
  ICE = 'ICE',
  LIGHTNING = 'LIGHTNING',
  ARCANE = 'ARCANE',
}

// --- Spell Interfaces ---

export type CastMode = 'auto' | 'interval' | 'trigger';
export type TargetMode = 'nearest' | 'random' | 'area' | 'surround';
export type SpellType = 'projectile' | 'laser' | 'aura' | 'orbit' | 'beam' | 'spin';
export type ModOperation = 'add' | 'mul' | 'set';

export interface SpellConfig {
  id: string;
  name: string;
  rarity: 'common' | 'rare' | 'epic';
  tags: string[];
  element: ElementType | null;
  castMode: CastMode;
  targetMode: TargetMode;
  spellType?: SpellType;
  baseDamage: number;
  cooldown: number;
  projectileSpeed?: number;
  projectileCount?: number;
  duration?: number;
  radius?: number;
  pierce?: number;
  chain?: number;
  statusEffect?: { type: string; chance: number };
  upgrades: string[];
}

export interface SpellSlotState {
  spellId: string;
  level: number;
  element: ElementType | null;
  cooldownRemaining: number;
  modifiers: SpellModifier[];
}

export interface SpellModifier {
  field: string;
  operation: ModOperation;
  value: number;
}

// --- Player ---

export interface PlayerState {
  hp: number;
  maxHp: number;
  moveSpeed: number;
  power: number;
  critChance: number;
  critDamage: number;
  cooldownRate: number;
  pickupRadius: number;
  shield: number;
  hpRegen: number;
  level: number;
  expToNext: number;
  spellSlots: SpellSlotState[];
  relics: string[];
  tags: string[];
}

// --- Enemies ---

export type EnemyBehavior = 'chase' | 'chase_slow' | 'ranged' | 'charge' | 'split';

export interface EnemyConfig {
  id: string;
  name: string;
  category: 'normal' | 'elite' | 'boss';
  hp: number;
  speed: number;
  contactDamage: number;
  xpValue: number;
  spawnCost: number;
  behavior: EnemyBehavior;
}

// --- Upgrades & Build ---

export type UpgradeCategory = 'new_spell' | 'spell_upgrade' | 'global_stat' | 'element' | 'relic' | 'survival';
export type Rarity = 'common' | 'rare' | 'epic';

export interface UpgradeCard {
  id: string;
  name: string;
  description: string;
  category: UpgradeCategory;
  rarity: Rarity;
  element?: ElementType | null;
  weight: number;
  requires?: Requirement[];
  excludes?: string[];
  tags?: string[];
  apply: ApplyInstruction[];
}

export interface Requirement {
  type: 'has_spell' | 'min_level' | 'has_tag' | 'spell_slot_available';
  value?: string | number;
}

export interface ApplyInstruction {
  target: 'player' | 'spell' | 'tag';
  targetId?: string;
  operation: 'add' | 'mul' | 'set' | 'append_tag';
  field: string;
  value: number | string;
}

export interface GlobalMod {
  field: string;
  operation: 'add' | 'mul';
  value: number;
}

export interface ElementAffinity {
  [ElementType.FIRE]: number;
  [ElementType.ICE]: number;
  [ElementType.LIGHTNING]: number;
  [ElementType.ARCANE]: number;
}

export interface BuildState {
  spells: SpellSlotState[];
  relics: string[];
  globalModifiers: GlobalMod[];
  elementAffinity: ElementAffinity;
  upgradeHistory: string[];
  tags: string[];
}

export interface BuildSnapshot {
  spells: { id: string; name: string; level: number; element: ElementType | null }[];
  relics: string[];
  totalUpgrades: number;
  dominantElement: ElementType | null;
  tags: string[];
}

// --- Event Payloads ---

export interface RunEndPayload {
  survived: boolean;
  time: number;
  cause: 'death' | 'boss_killed' | 'timeout' | 'victory';
}

export interface PhaseChangePayload {
  phase: RunPhase;
  previousPhase: RunPhase;
}

export interface SpellHitPayload {
  spellId: string;
  element: ElementType | null;
  target: Phaser.GameObjects.Sprite;
  damage: number;
  isCrit: boolean;
  position: { x: number; y: number };
}

export interface EnemyKillPayload {
  enemyId: string;
  enemyType: string;
  position: { x: number; y: number };
  killerSpellId: string;
  element: ElementType | null;
  enemy: Phaser.GameObjects.Sprite;
}

export interface EnemyDamagedPayload {
  enemyId: string;
  damage: number;
  element: ElementType | null;
  remainingHp: number;
  enemy: Phaser.GameObjects.Sprite;
}

export interface PlayerDamagedPayload {
  damage: number;
  source: string;
  remainingHp: number;
}

export interface XpGainedPayload {
  amount: number;
  source: string;
}

export interface LevelUpPayload {
  newLevel: number;
}

export interface UpgradeChosenPayload {
  upgradeCard: UpgradeCard;
}

export interface PickupCollectedPayload {
  pickupType: 'xp_small' | 'xp_large' | 'health';
  value: number;
  position: { x: number; y: number };
}

export interface WaveStartPayload {
  waveNumber: number;
  enemyCount: number;
}

// --- Run Result (scene data) ---

export interface RunResultData {
  survived: boolean;
  time: number;
  cause: string;
  kills: number;
  level: number;
}

// --- Poolable ---

export interface Poolable {
  active: boolean;
  reset(): void;
}
