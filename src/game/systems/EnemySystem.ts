import { Enemy } from '../entities/Enemy';
import { ObjectPool } from '../core/ObjectPool';
import { CollisionSystem } from '../core/CollisionSystem';
import { Player } from '../entities/Player';
import { EnemyConfig } from '../types';
import { ENEMY_CONFIGS } from '../data/enemies';

export class EnemySystem {
  private scene: Phaser.Scene;
  private pool: ObjectPool<Enemy>;
  private player: Player;
  private timeScaling = 0;

  /** Set by RunScene to notify BubbleSystem */
  onEnemySpawned: ((enemy: Enemy) => void) | null = null;

  constructor(scene: Phaser.Scene, pool: ObjectPool<Enemy>, collisionSystem: CollisionSystem, player: Player) {
    this.scene = scene;
    this.pool = pool;
    this.player = player;
  }

  spawnEnemy(configId: string, x: number, y: number, elapsed: number): Enemy | null {
    const config = ENEMY_CONFIGS[configId];
    if (!config) return null;

    const enemy = this.pool.acquire();
    this.timeScaling = 0.15 * (elapsed / 60);
    enemy.spawn(config, x, y, this.timeScaling);

    if (this.onEnemySpawned) {
      this.onEnemySpawned(enemy);
    }

    return enemy;
  }

  update(delta: number): void {
    const px = this.player.x;
    const py = this.player.y;

    for (const enemy of this.pool.getActiveObjects()) {
      if (!enemy.active) continue;
      enemy.updateAI(px, py);
      enemy.updateCooldown(delta);
    }
  }

  killEnemy(enemy: Enemy): void {
    enemy.playDeathEffect();
    // Release back to pool after death animation
    this.scene.time.delayedCall(220, () => {
      if (!enemy.active) {
        this.pool.release(enemy);
      }
    });
  }

  getActiveCount(): number {
    return this.pool.getActiveCount();
  }

  destroy(): void {
    this.pool.releaseAll();
  }
}
