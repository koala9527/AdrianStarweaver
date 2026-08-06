/**
 * Virtual Joystick for mobile H5
 * Provides touch-based directional input
 */
export class VirtualJoystick {
  private scene: Phaser.Scene;
  private base: Phaser.GameObjects.Arc;
  private stick: Phaser.GameObjects.Arc;
  private pointer: Phaser.Input.Pointer | null = null;
  private direction: { x: number; y: number } = { x: 0, y: 0 };
  private readonly maxDistance = 50;
  private readonly baseRadius = 60;
  private readonly stickRadius = 30;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;

    // Base circle
    this.base = scene.add.circle(x, y, this.baseRadius, 0x333333, 0.5)
      .setDepth(10000)
      .setScrollFactor(0);

    // Stick circle
    this.stick = scene.add.circle(x, y, this.stickRadius, 0x4488ff, 0.8)
      .setDepth(10001)
      .setScrollFactor(0);

    // Make base interactive
    this.base.setInteractive({ useHandCursor: true, draggable: false });

    // Touch events
    this.base.on('pointerdown', this.onPointerDown, this);
    scene.input.on('pointermove', this.onPointerMove, this);
    scene.input.on('pointerup', this.onPointerUp, this);
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    this.pointer = pointer;
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (this.pointer !== pointer) return;

    const dx = pointer.x - this.base.x;
    const dy = pointer.y - this.base.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > 0) {
      const clampedDistance = Math.min(distance, this.maxDistance);
      const angle = Math.atan2(dy, dx);

      this.stick.x = this.base.x + Math.cos(angle) * clampedDistance;
      this.stick.y = this.base.y + Math.sin(angle) * clampedDistance;

      // Normalized direction
      this.direction.x = dx / distance;
      this.direction.y = dy / distance;
    }
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    if (this.pointer !== pointer) return;

    this.pointer = null;
    this.stick.x = this.base.x;
    this.stick.y = this.base.y;
    this.direction.x = 0;
    this.direction.y = 0;
  }

  getDirection(): { x: number; y: number } {
    return { ...this.direction };
  }

  setVisible(visible: boolean): void {
    this.base.setVisible(visible);
    this.stick.setVisible(visible);
  }

  setInputEnabled(enabled: boolean): void {
    if (enabled) {
      this.base.setInteractive({ useHandCursor: true, draggable: false });
    } else {
      this.base.disableInteractive();
      // Release any active drag
      if (this.pointer) {
        this.pointer = null;
        this.stick.x = this.base.x;
        this.stick.y = this.base.y;
        this.direction.x = 0;
        this.direction.y = 0;
      }
    }
  }

  setPosition(x: number, y: number): void {
    const offsetX = x - this.base.x;
    const offsetY = y - this.base.y;
    this.base.setPosition(x, y);
    this.stick.x += offsetX;
    this.stick.y += offsetY;
  }

  destroy(): void {
    this.base.destroy();
    this.stick.destroy();
  }
}
