import { CollisionSystem } from '../core/CollisionSystem';

export type PickupType = 'xp_small' | 'xp_large' | 'health';

const TEXTURE_MAP: Record<PickupType, string> = {
  xp_small: 'xp_orb_small',
  xp_large: 'xp_orb_large',
  health: 'health_orb',
};

const VALUE_MAP: Record<PickupType, number> = {
  xp_small: 1,
  xp_large: 5,
  health: 20,
};

export class Pickup extends Phaser.Physics.Arcade.Sprite {
  pickupType: PickupType = 'xp_small';
  value = 1;
  scatterTimer = 0;
  lifetime = 0;

  private static readonly SCATTER_DURATION = 300;
  private static readonly MAX_LIFETIME = 30000;

  constructor(scene: Phaser.Scene, collisionSystem: CollisionSystem) {
    super(scene, 0, 0, 'xp_orb_small');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    collisionSystem.pickupGroup.add(this);
    this.setActive(false);
    this.setVisible(false);
    (this.body as Phaser.Physics.Arcade.Body).enable = false;
  }

  spawn(x: number, y: number, type: PickupType): void {
    this.pickupType = type;
    this.value = VALUE_MAP[type];
    this.setTexture(TEXTURE_MAP[type]);
    this.setPosition(x, y);
    this.setActive(true);
    this.setVisible(true);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.enable = true;

    // Scatter: random velocity for brief period
    const angle = Math.random() * Math.PI * 2;
    const speed = 80 + Math.random() * 60;
    this.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    this.scatterTimer = Pickup.SCATTER_DURATION;
    this.lifetime = 0;
  }

  updatePickup(delta: number, playerX: number, playerY: number, pickupRadius: number): boolean {
    if (!this.active) return false;

    this.lifetime += delta;
    if (this.lifetime >= Pickup.MAX_LIFETIME) {
      this.deactivate();
      return false;
    }

    // Scatter phase — not collectible
    if (this.scatterTimer > 0) {
      this.scatterTimer -= delta;
      if (this.scatterTimer <= 0) {
        this.setVelocity(0, 0);
      }
      return false;
    }

    // Magnetic pull
    const dx = playerX - this.x;
    const dy = playerY - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < pickupRadius && dist > 0) {
      // Accelerate toward player: 200 → 600
      const t = 1 - dist / pickupRadius;
      const speed = 200 + t * 400;
      this.setVelocity((dx / dist) * speed, (dy / dist) * speed);
      return true; // in pull range
    } else {
      this.setVelocity(0, 0);
      return false;
    }
  }

  isCollectible(): boolean {
    return this.active && this.scatterTimer <= 0;
  }

  deactivate(): void {
    this.setActive(false);
    this.setVisible(false);
    this.setVelocity(0, 0);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.enable = false;
  }

  reset(): void {
    this.deactivate();
  }
}
