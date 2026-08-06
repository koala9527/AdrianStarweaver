import { Player } from '../entities/Player';
import { InputSystem } from '../core/InputSystem';

interface TrailDot {
  obj: Phaser.GameObjects.Arc;
  timer: number;
}

export class PlayerController {
  private player: Player;
  private inputSystem: InputSystem;
  private scene: Phaser.Scene;
  private trail: TrailDot[] = [];
  private trailTimer = 0;
  private static readonly TRAIL_INTERVAL = 40;
  private static readonly TRAIL_LIFETIME = 300;
  private static readonly TRAIL_MAX = 12;

  constructor(player: Player, inputSystem: InputSystem) {
    this.player = player;
    this.inputSystem = inputSystem;
    this.scene = player.scene;
  }

  update(delta: number): void {
    const dir = this.inputSystem.getDirection();
    const speed = this.player.playerState.moveSpeed;

    this.player.setVelocity(dir.x * speed, dir.y * speed);

    // Sprite flip
    if (dir.x < 0) this.player.setFlipX(true);
    else if (dir.x > 0) this.player.setFlipX(false);

    // Lean effect — slight rotation toward movement direction
    const targetAngle = dir.x * 0.15;
    this.player.rotation += (targetAngle - this.player.rotation) * 0.2;

    // Squash & stretch when moving
    const isMoving = dir.x !== 0 || dir.y !== 0;
    const targetScaleX = isMoving ? 0.92 : 1;
    const targetScaleY = isMoving ? 1.08 : 1;
    this.player.scaleX += (targetScaleX - this.player.scaleX) * 0.15;
    this.player.scaleY += (targetScaleY - this.player.scaleY) * 0.15;

    // Movement trail
    if (isMoving) {
      this.trailTimer += delta;
      if (this.trailTimer >= PlayerController.TRAIL_INTERVAL) {
        this.trailTimer = 0;
        this.spawnTrailDot();
      }
    }

    // Update trail
    for (let i = this.trail.length - 1; i >= 0; i--) {
      const t = this.trail[i];
      t.timer -= delta;
      t.obj.setAlpha(Math.max(0, t.timer / PlayerController.TRAIL_LIFETIME) * 0.4);
      t.obj.setScale(Math.max(0.2, t.timer / PlayerController.TRAIL_LIFETIME));
      if (t.timer <= 0) {
        t.obj.destroy();
        this.trail.splice(i, 1);
      }
    }

    // I-frames
    this.player.updateIFrames(delta);

    // HP regen
    this.player.updateRegen(delta / 1000);
  }

  private spawnTrailDot(): void {
    // Limit trail count
    if (this.trail.length >= PlayerController.TRAIL_MAX) {
      const oldest = this.trail.shift()!;
      oldest.obj.destroy();
    }

    const dot = this.scene.add.circle(
      this.player.x,
      this.player.y,
      5,
      0x4488ff,
      0.4,
    ).setDepth(this.player.depth - 1);

    this.trail.push({
      obj: dot,
      timer: PlayerController.TRAIL_LIFETIME,
    });
  }

  getPlayer(): Player {
    return this.player;
  }
}
