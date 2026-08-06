import { EventBus } from '../core/EventBus';
import { ObjectPool } from '../core/ObjectPool';
import { CollisionSystem } from '../core/CollisionSystem';
import { Player } from '../entities/Player';
import { Pickup, PickupType } from '../entities/Pickup';
import { GameEvents, XpGainedPayload, PickupCollectedPayload, EnemyKillPayload } from '../types';

export class LootSystem {
  private scene: Phaser.Scene;
  private pickupPool: ObjectPool<Pickup>;
  private player: Player;
  private eventBus: EventBus;

  constructor(
    scene: Phaser.Scene,
    pickupPool: ObjectPool<Pickup>,
    collisionSystem: CollisionSystem,
    player: Player,
    eventBus: EventBus,
  ) {
    this.scene = scene;
    this.pickupPool = pickupPool;
    this.player = player;
    this.eventBus = eventBus;

    this.eventBus.on(GameEvents.ENEMY_KILL, this.onEnemyKill, this);
  }

  private onEnemyKill(payload: EnemyKillPayload): void {
    const { position } = payload;
    const xpValue = payload.enemyType === 'skeleton' ? 4 : 2;

    // Spawn XP orbs
    if (xpValue >= 5) {
      this.spawnPickup(position.x, position.y, 'xp_large');
    } else {
      for (let i = 0; i < xpValue; i++) {
        this.spawnPickup(position.x, position.y, 'xp_small');
      }
    }

    // Health drop: 5% chance, doubled at low HP
    const healthChance = this.player.playerState.hp < this.player.playerState.maxHp * 0.3 ? 0.10 : 0.05;
    if (Math.random() < healthChance) {
      this.spawnPickup(position.x, position.y, 'health');
    }
  }

  private spawnPickup(x: number, y: number, type: PickupType): void {
    const pickup = this.pickupPool.acquire() as Pickup;
    pickup.spawn(x, y, type);
  }

  handlePickupCollected(
    playerObj: Phaser.GameObjects.GameObject,
    pickupObj: Phaser.GameObjects.GameObject,
  ): void {
    const pickup = pickupObj as Pickup;
    if (!pickup.isCollectible()) return;

    if (pickup.pickupType === 'health') {
      this.player.playerState.hp = Math.min(
        this.player.playerState.maxHp,
        this.player.playerState.hp + pickup.value,
      );
      this.eventBus.emit(GameEvents.PLAYER_HEAL, {
        amount: pickup.value,
        source: 'health_orb',
        currentHp: this.player.playerState.hp,
      });
    } else {
      // XP pickup
      this.eventBus.emit(GameEvents.XP_GAINED, {
        amount: pickup.value,
        source: 'orb',
      } satisfies XpGainedPayload);
    }

    this.eventBus.emit(GameEvents.PICKUP_COLLECTED, {
      pickupType: pickup.pickupType,
      value: pickup.value,
      position: { x: pickup.x, y: pickup.y },
    } satisfies PickupCollectedPayload);

    pickup.deactivate();
    this.pickupPool.release(pickup);
  }

  update(delta: number): void {
    const px = this.player.x;
    const py = this.player.y;
    const radius = this.player.playerState.pickupRadius;

    for (const pickup of this.pickupPool.getActiveObjects()) {
      if (pickup.active) {
        (pickup as Pickup).updatePickup(delta, px, py, radius);
      }
    }
  }

  destroy(): void {
    this.eventBus.off(GameEvents.ENEMY_KILL, this.onEnemyKill, this);
    this.pickupPool.releaseAll();
  }
}
