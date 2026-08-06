import { PlayerState, SpellSlotState, ElementType } from '../types';
import { CollisionSystem } from '../core/CollisionSystem';

const DEFAULT_PLAYER_STATE: PlayerState = {
  hp: 100,
  maxHp: 100,
  moveSpeed: 220,
  power: 1.0,
  critChance: 0.05,
  critDamage: 1.5,
  cooldownRate: 1.0,
  pickupRadius: 60,
  shield: 0,
  hpRegen: 0,
  level: 1,
  expToNext: 10,
  spellSlots: [],
  relics: [],
  tags: [],
};

export class Player extends Phaser.Physics.Arcade.Sprite {
  playerState: PlayerState;
  private iFrameTimer = 0;
  private static readonly I_FRAME_DURATION = 200;

  constructor(scene: Phaser.Scene, x: number, y: number, collisionSystem: CollisionSystem) {
    super(scene, x, y, 'player');
    scene.add.existing(this as unknown as Phaser.GameObjects.GameObject);
    scene.physics.add.existing(this as unknown as Phaser.GameObjects.GameObject);

    this.setCircle(24);
    this.setCollideWorldBounds(true);
    collisionSystem.playerGroup.add(this as unknown as Phaser.GameObjects.GameObject);

    this.playerState = { ...DEFAULT_PLAYER_STATE, spellSlots: [], relics: [], tags: [] };
  }

  isInvulnerable(): boolean {
    return this.iFrameTimer > 0;
  }

  takeDamage(amount: number): number {
    if (this.iFrameTimer > 0) return 0;

    let remaining = amount;

    // Shield absorbs first
    if (this.playerState.shield > 0) {
      const absorbed = Math.min(this.playerState.shield, remaining);
      this.playerState.shield -= absorbed;
      remaining -= absorbed;
    }

    if (remaining > 0) {
      this.playerState.hp = Math.max(0, this.playerState.hp - remaining);
    }

    this.iFrameTimer = Player.I_FRAME_DURATION;
    this.setAlpha(0.5);

    return amount;
  }

  isDead(): boolean {
    return this.playerState.hp <= 0;
  }

  updateIFrames(delta: number): void {
    if (this.iFrameTimer > 0) {
      this.iFrameTimer -= delta;
      if (this.iFrameTimer <= 0) {
        this.iFrameTimer = 0;
        this.setAlpha(1);
      }
    }
  }

  updateRegen(deltaSec: number): void {
    if (this.playerState.hpRegen > 0 && this.playerState.hp < this.playerState.maxHp && this.playerState.hp > 0) {
      this.playerState.hp = Math.min(this.playerState.maxHp, this.playerState.hp + this.playerState.hpRegen * deltaSec);
    }
  }
}
