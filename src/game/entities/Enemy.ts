import { EnemyConfig } from '../types';
import { CollisionSystem } from '../core/CollisionSystem';

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  config!: EnemyConfig;
  currentHp = 0;
  maxHp = 0;
  contactDamageCooldown = 0;
  private baseScale = 1;
  private baseTint = 0xffffff;
  private static readonly CONTACT_COOLDOWN = 500;

  constructor(scene: Phaser.Scene, collisionSystem: CollisionSystem) {
    super(scene, 0, 0, 'slime');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    collisionSystem.enemyGroup.add(this);
    this.setActive(false);
    this.setVisible(false);
    (this.body as Phaser.Physics.Arcade.Body).enable = false;
  }

  spawn(config: EnemyConfig, x: number, y: number, timeScaling: number): void {
    this.config = config;
    this.setTexture(config.id);
    this.setPosition(x, y);
    this.setActive(true);
    this.setVisible(true);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.enable = true;
    body.setCircle(16);

    // HP scaling: +15% per minute
    this.maxHp = Math.floor(config.hp * (1 + timeScaling));
    this.currentHp = this.maxHp;
    this.contactDamageCooldown = 0;

    // Size variation: 0.85–1.15x
    this.baseScale = 0.85 + Math.random() * 0.3;

    // Tint variation per type
    if (config.id === 'slime') {
      const tints = [0x66dd66, 0x44cc88, 0x88ee55, 0x55bb77];
      this.baseTint = tints[Math.floor(Math.random() * tints.length)];
    } else if (config.id === 'skeleton') {
      const tints = [0xcccccc, 0xddddbb, 0xbbbbaa, 0xeeddcc];
      this.baseTint = tints[Math.floor(Math.random() * tints.length)];
    } else if (config.id === 'wraith') {
      const tints = [0x7799dd, 0x6688cc, 0x88aaee, 0x5577bb];
      this.baseTint = tints[Math.floor(Math.random() * tints.length)];
    } else if (config.id === 'vine_spirit') {
      const tints = [0x44aa55, 0x55bb66, 0x66cc77, 0x338844];
      this.baseTint = tints[Math.floor(Math.random() * tints.length)];
    } else if (config.id === 'crystal_wisp') {
      const tints = [0x88bbff, 0x66aaff, 0xaaddff, 0x4488ee];
      this.baseTint = tints[Math.floor(Math.random() * tints.length)];
    } else if (config.id === 'boss') {
      this.baseTint = 0xaa44ff;
    } else {
      this.baseTint = 0xffffff;
    }
    this.setTint(this.baseTint);

    // Spawn animation: pop in
    this.setAlpha(0);
    this.setScale(this.baseScale * 0.3);
    this.scene.tweens.add({
      targets: this,
      alpha: 1,
      scaleX: this.baseScale,
      scaleY: this.baseScale,
      duration: 200,
      ease: 'Back.easeOut',
    });
  }

  updateAI(playerX: number, playerY: number): void {
    if (!this.active) return;
    const dx = playerX - this.x;
    const dy = playerY - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 0) {
      this.setVelocity(
        (dx / dist) * this.config.speed,
        (dy / dist) * this.config.speed,
      );
    }
  }

  canDealContactDamage(): boolean {
    return this.contactDamageCooldown <= 0;
  }

  resetContactCooldown(): void {
    this.contactDamageCooldown = Enemy.CONTACT_COOLDOWN;
  }

  updateCooldown(delta: number): void {
    if (this.contactDamageCooldown > 0) {
      this.contactDamageCooldown -= delta;
    }
  }

  takeDamage(amount: number): number {
    this.currentHp -= amount;
    // Flash white briefly then restore base tint
    this.setTint(0xffffff);
    this.scene.time.delayedCall(60, () => {
      if (this.active) this.setTint(this.baseTint);
    });
    // Squash on hit
    this.scene.tweens.add({
      targets: this,
      scaleX: this.baseScale * 1.2,
      scaleY: this.baseScale * 0.8,
      duration: 60,
      yoyo: true,
      ease: 'Quad.easeOut',
    });
    return this.currentHp;
  }

  isDead(): boolean {
    return this.currentHp <= 0;
  }

  /** Play death shrink+fade, then deactivate. Returns duration in ms. */
  playDeathEffect(): number {
    const duration = 200;
    this.setVelocity(0, 0);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.enable = false;
    this.setTint(0xff4444);
    this.scene.tweens.add({
      targets: this,
      scaleX: this.baseScale * 1.5,
      scaleY: this.baseScale * 0.2,
      alpha: 0,
      duration,
      ease: 'Quad.easeIn',
      onComplete: () => {
        this.deactivate();
      },
    });
    return duration;
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
