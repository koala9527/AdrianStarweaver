import { CollisionSystem } from '../core/CollisionSystem';
import { ElementType } from '../types';
import { Enemy } from './Enemy';
import { SPELL_VFX } from '../data/spellVfx';

interface TrailDot {
  obj: Phaser.GameObjects.Arc;
  timer: number;
}

export class Projectile extends Phaser.Physics.Arcade.Sprite {
  spellId = '';
  baseDamage = 0;
  element: ElementType | null = null;
  pierceCount = 0;
  maxPierce = 0;
  hitSet: Set<Enemy> = new Set();
  lifetime = 0;
  maxLifetime = 3000;

  private trailDots: TrailDot[] = [];
  private trailTimer = 0;
  private trailColor = 0x2288cc;
  private projColor = 0x44ddff;

  constructor(scene: Phaser.Scene, collisionSystem: CollisionSystem) {
    super(scene, 0, 0, 'projectile');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    collisionSystem.playerProjectileGroup.add(this);
    this.setActive(false);
    this.setVisible(false);
    (this.body as Phaser.Physics.Arcade.Body).enable = false;
  }

  fire(
    x: number, y: number,
    vx: number, vy: number,
    spellId: string, baseDamage: number,
    element: ElementType | null, pierce: number,
  ): void {
    this.setPosition(x, y);
    this.setActive(true);
    this.setVisible(true);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.enable = true;
    this.setVelocity(vx, vy);

    this.spellId = spellId;
    this.baseDamage = baseDamage;
    this.element = element;
    this.pierceCount = 0;
    this.maxPierce = pierce;
    this.hitSet.clear();
    this.lifetime = 0;
    this.trailTimer = 0;

    // Apply spell color
    const vfx = SPELL_VFX[spellId] ?? SPELL_VFX.arcane_missile;
    this.projColor = vfx.projectileColor;
    this.trailColor = vfx.trailColor;
    this.setTint(this.projColor);

    // Rotation toward velocity
    this.setRotation(Math.atan2(vy, vx));
  }

  updateProjectile(delta: number): void {
    if (!this.active) return;
    this.lifetime += delta;
    if (this.lifetime >= this.maxLifetime) {
      this.deactivate();
      return;
    }

    // Trail particles
    this.trailTimer += delta;
    if (this.trailTimer >= 40) {
      this.trailTimer = 0;
      const dot = this.scene.add.circle(
        this.x + (Math.random() - 0.5) * 4,
        this.y + (Math.random() - 0.5) * 4,
        2 + Math.random() * 2,
        this.trailColor, 0.7,
      ).setDepth(this.depth - 1);
      this.trailDots.push({ obj: dot, timer: 200 });
    }

    // Fade trail dots
    for (let i = this.trailDots.length - 1; i >= 0; i--) {
      const td = this.trailDots[i];
      td.timer -= delta;
      td.obj.setAlpha(Math.max(0, td.timer / 200) * 0.7);
      td.obj.setScale(Math.max(0.2, td.timer / 200));
      if (td.timer <= 0) {
        td.obj.destroy();
        this.trailDots.splice(i, 1);
      }
    }
  }

  deactivate(): void {
    this.setActive(false);
    this.setVisible(false);
    this.setVelocity(0, 0);
    this.clearTint();
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.enable = false;
    // Clean up trail
    for (const td of this.trailDots) td.obj.destroy();
    this.trailDots = [];
  }

  reset(): void {
    this.deactivate();
    this.hitSet.clear();
  }
}
