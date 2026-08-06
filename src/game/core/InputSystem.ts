import { VirtualJoystick } from '../ui/VirtualJoystick';

export class InputSystem {
  private keys: {
    up: Phaser.Input.Keyboard.Key[];
    down: Phaser.Input.Keyboard.Key[];
    left: Phaser.Input.Keyboard.Key[];
    right: Phaser.Input.Keyboard.Key[];
  };
  private joystick: VirtualJoystick | null = null;
  private isMobile: boolean;

  constructor(scene: Phaser.Scene) {
    this.isMobile = this.detectMobile();

    const kb = scene.input.keyboard!;
    this.keys = {
      up: [kb.addKey(Phaser.Input.Keyboard.KeyCodes.W), kb.addKey(Phaser.Input.Keyboard.KeyCodes.UP)],
      down: [kb.addKey(Phaser.Input.Keyboard.KeyCodes.S), kb.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN)],
      left: [kb.addKey(Phaser.Input.Keyboard.KeyCodes.A), kb.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT)],
      right: [kb.addKey(Phaser.Input.Keyboard.KeyCodes.D), kb.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT)],
    };

    // Create joystick for mobile
    if (this.isMobile) {
      const cam = scene.cameras.main;
      this.joystick = new VirtualJoystick(scene, 100, cam.height - 100);
    }
  }

  private detectMobile(): boolean {
    const ua = navigator.userAgent.toLowerCase();
    return /mobile|android|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(ua);
  }

  private isDown(keys: Phaser.Input.Keyboard.Key[]): boolean {
    return keys.some(k => k.isDown);
  }

  getDirection(): { x: number; y: number } {
    // Mobile: use joystick
    if (this.isMobile && this.joystick) {
      return this.joystick.getDirection();
    }

    // PC: use keyboard
    const rawX = (this.isDown(this.keys.right) ? 1 : 0) - (this.isDown(this.keys.left) ? 1 : 0);
    const rawY = (this.isDown(this.keys.down) ? 1 : 0) - (this.isDown(this.keys.up) ? 1 : 0);
    const magnitude = Math.sqrt(rawX * rawX + rawY * rawY);
    if (magnitude === 0) return { x: 0, y: 0 };
    return { x: rawX / magnitude, y: rawY / magnitude };
  }

  getJoystick(): VirtualJoystick | null {
    return this.joystick;
  }

  destroy(): void {
    if (this.joystick) {
      this.joystick.destroy();
    }
  }
}
