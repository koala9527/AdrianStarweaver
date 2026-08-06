import { EnemySystem } from './EnemySystem';
import { GameTimer } from '../core/GameTimer';
import { EventBus } from '../core/EventBus';
import { Player } from '../entities/Player';
import { MapCollision } from '../core/MapCollision';
import { GameEvents, RunPhase, WaveStartPayload } from '../types';

interface PhaseSpawnConfig {
  baseBudget: number;
  spawnInterval: number;
  maxEnemies: number;
  enemyWeights: { id: string; weight: number }[];
}

const PHASE_SPAWN_CONFIGS: Record<string, PhaseSpawnConfig> = {
  [RunPhase.EARLY]: {
    baseBudget: 5,
    spawnInterval: 1800,
    maxEnemies: 35,
    enemyWeights: [{ id: 'slime', weight: 80 }, { id: 'skeleton', weight: 20 }],
  },
  [RunPhase.MID_EARLY]: {
    baseBudget: 10,
    spawnInterval: 1500,
    maxEnemies: 55,
    enemyWeights: [{ id: 'slime', weight: 60 }, { id: 'skeleton', weight: 40 }],
  },
  [RunPhase.MID]: {
    baseBudget: 16,
    spawnInterval: 1200,
    maxEnemies: 75,
    enemyWeights: [{ id: 'slime', weight: 50 }, { id: 'skeleton', weight: 50 }],
  },
  [RunPhase.MID_LATE]: {
    baseBudget: 22,
    spawnInterval: 1000,
    maxEnemies: 95,
    enemyWeights: [{ id: 'slime', weight: 40 }, { id: 'skeleton', weight: 60 }],
  },
  [RunPhase.LATE]: {
    baseBudget: 30,
    spawnInterval: 800,
    maxEnemies: 120,
    enemyWeights: [{ id: 'slime', weight: 30 }, { id: 'skeleton', weight: 70 }],
  },
};

const EXPECTED_KPM: Record<string, number> = {
  [RunPhase.EARLY]: 15,
  [RunPhase.MID_EARLY]: 25,
  [RunPhase.MID]: 40,
  [RunPhase.MID_LATE]: 50,
  [RunPhase.LATE]: 60,
};

const MAX_ENEMIES = 120;
const KPM_WINDOW = 30; // seconds

export class SpawnDirector {
  private enemySystem: EnemySystem;
  private gameTimer: GameTimer;
  private eventBus: EventBus;
  private player: Player;
  private mapCollision: MapCollision | null = null;

  private timeSinceLastSpawn = 0;
  private waveNumber = 0;
  private recentKills: number[] = []; // timestamps of recent kills
  private totalKills = 0;
  private blueZoneSpawnTimer = 0;
  private static readonly BLUE_ZONE_SPAWN_INTERVAL = 5000;
  private static readonly BLUE_ZONE_ENEMIES = ['vine_spirit', 'crystal_wisp'];

  constructor(enemySystem: EnemySystem, gameTimer: GameTimer, eventBus: EventBus, player: Player) {
    this.enemySystem = enemySystem;
    this.gameTimer = gameTimer;
    this.eventBus = eventBus;
    this.player = player;

    this.eventBus.on(GameEvents.ENEMY_KILL, this.onEnemyKill, this);
  }

  setMapCollision(mc: MapCollision): void {
    this.mapCollision = mc;
  }

  private onEnemyKill(): void {
    this.recentKills.push(this.gameTimer.getElapsed());
    this.totalKills++;
  }

  update(delta: number): void {
    if (this.gameTimer.isPaused()) return;

    this.timeSinceLastSpawn += delta;

    const phase = this.gameTimer.getPhase();
    const config = PHASE_SPAWN_CONFIGS[phase];

    // Blue zone special spawns
    this.blueZoneSpawnTimer += delta;
    if (this.blueZoneSpawnTimer >= SpawnDirector.BLUE_ZONE_SPAWN_INTERVAL && this.mapCollision) {
      this.blueZoneSpawnTimer = 0;
      this.spawnBlueZoneEnemy();
    }

    if (this.timeSinceLastSpawn < config.spawnInterval) return;
    if (this.enemySystem.getActiveCount() >= Math.min(config.maxEnemies, MAX_ENEMIES)) return;

    this.timeSinceLastSpawn = 0;

    const budget = this.calculateBudget(phase, config);
    const enemies = this.selectEnemies(budget, config);

    const elapsed = this.gameTimer.getElapsed();
    let spawned = 0;

    for (const enemyId of enemies) {
      if (this.enemySystem.getActiveCount() >= MAX_ENEMIES) break;
      const pos = this.getSpawnPosition();
      this.enemySystem.spawnEnemy(enemyId, pos.x, pos.y, elapsed);
      spawned++;
    }

    if (spawned > 0) {
      this.waveNumber++;
      this.eventBus.emit(GameEvents.WAVE_START, {
        waveNumber: this.waveNumber,
        enemyCount: spawned,
      } satisfies WaveStartPayload);
    }
  }

  private spawnBlueZoneEnemy(): void {
    if (!this.mapCollision) return;
    const zones = this.mapCollision.getSpecialZones();
    if (zones.length === 0) return;
    if (this.enemySystem.getActiveCount() >= MAX_ENEMIES) return;

    // Pick a random blue zone
    const zone = zones[Math.floor(Math.random() * zones.length)];
    const x = zone.x + Math.random() * zone.w;
    const y = zone.y + Math.random() * zone.h;

    const enemyId = SpawnDirector.BLUE_ZONE_ENEMIES[
      Math.floor(Math.random() * SpawnDirector.BLUE_ZONE_ENEMIES.length)
    ];
    this.enemySystem.spawnEnemy(enemyId, x, y, this.gameTimer.getElapsed());
  }

  private calculateBudget(phase: RunPhase, config: PhaseSpawnConfig): number {
    const kpm = this.getKPM();
    const expectedKpm = EXPECTED_KPM[phase];
    const powerAdjust = Math.max(0.7, Math.min(1.5, expectedKpm > 0 ? kpm / expectedKpm : 1));
    const elapsed = this.gameTimer.getElapsed();
    const intensityFactor = 1.0 + Math.sin(elapsed * 0.5) * 0.2;
    return Math.floor(config.baseBudget * powerAdjust * intensityFactor);
  }

  private selectEnemies(budget: number, config: PhaseSpawnConfig): string[] {
    const result: string[] = [];
    let remaining = budget;
    const totalWeight = config.enemyWeights.reduce((sum, e) => sum + e.weight, 0);

    while (remaining > 0) {
      // Weighted random selection
      let roll = Math.random() * totalWeight;
      let selected = config.enemyWeights[0].id;
      for (const entry of config.enemyWeights) {
        roll -= entry.weight;
        if (roll <= 0) {
          selected = entry.id;
          break;
        }
      }
      const cost = selected === 'skeleton' ? 2 : 1;
      if (cost > remaining) break;
      remaining -= cost;
      result.push(selected);
    }

    return result;
  }

  private getSpawnPosition(): { x: number; y: number } {
    const cam = this.player.scene.cameras.main;
    const halfW = cam.width / 2;
    const halfH = cam.height / 2;
    const minDist = Math.max(halfW, halfH) + 50;
    const maxDist = minDist + 100;

    let bestPos: { x: number; y: number } | null = null;

    // Try up to 20 times to find a valid (non-blocked) position
    for (let attempt = 0; attempt < 20; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = minDist + Math.random() * (maxDist - minDist);

      const x = Math.max(50, Math.min(4046, this.player.x + Math.cos(angle) * dist));
      const y = Math.max(50, Math.min(4046, this.player.y + Math.sin(angle) * dist));

      bestPos = { x, y };

      // Skip blocked (black) zones if possible
      if (this.mapCollision && this.mapCollision.isBlocked(x, y)) continue;

      return { x, y };
    }

    // Fallback: return last attempted position even if blocked
    return bestPos!;
  }

  getKPM(): number {
    const now = this.gameTimer.getElapsed();
    // Prune old kills outside window
    this.recentKills = this.recentKills.filter(t => now - t <= KPM_WINDOW);
    if (KPM_WINDOW <= 0) return 0;
    return (this.recentKills.length / KPM_WINDOW) * 60;
  }

  getTotalKills(): number {
    return this.totalKills;
  }

  destroy(): void {
    this.eventBus.off(GameEvents.ENEMY_KILL, this.onEnemyKill, this);
  }
}
