/**
 * Parses collision mask images:
 * - Black (dark) = blocked — no walking, no monster spawns
 * - Blue = special zone — walkable, special effects, special monsters
 * - White/bright = normal walkable area
 */

export enum ZoneType {
  NORMAL = 'normal',
  BLOCKED = 'blocked',
  SPECIAL = 'special',
}

interface SpecialZoneRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export class MapCollision {
  private scene: Phaser.Scene;
  private blockers: Phaser.Physics.Arcade.StaticGroup;
  private specialZones: SpecialZoneRect[] = [];
  private static readonly SAMPLE_STEP = 32;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.blockers = scene.physics.add.staticGroup();
  }

  buildFromMasks(): void {
    const tileSize = 1024;
    const step = MapCollision.SAMPLE_STEP;

    for (let row = 1; row <= 4; row++) {
      for (let col = 1; col <= 4; col++) {
        const key = `mask_${row}_${col}`;
        const texture = this.scene.textures.get(key);
        if (!texture || texture.key === '__MISSING') continue;

        const source = texture.getSourceImage() as HTMLImageElement;
        const canvas = document.createElement('canvas');
        canvas.width = source.width;
        canvas.height = source.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(source, 0, 0);

        const offsetX = (col - 1) * tileSize;
        const offsetY = (row - 1) * tileSize;
        const scaleX = tileSize / source.width;
        const scaleY = tileSize / source.height;

        for (let py = 0; py < source.height; py += step) {
          let blockStart = -1;
          let blueStart = -1;

          for (let px = 0; px <= source.width; px += step) {
            const zone = px < source.width ? this.classifyPixel(ctx, px, py) : ZoneType.NORMAL;

            // Handle blocked zones
            if (zone === ZoneType.BLOCKED && blockStart === -1) {
              blockStart = px;
            } else if (zone !== ZoneType.BLOCKED && blockStart !== -1) {
              const worldX = offsetX + blockStart * scaleX;
              const worldY = offsetY + py * scaleY;
              const worldW = (px - blockStart) * scaleX;
              const worldH = step * scaleY;

              const rect = this.scene.add.rectangle(
                worldX + worldW / 2, worldY + worldH / 2,
                worldW, worldH, 0x000000, 0,
              );
              this.blockers.add(rect);
              (rect.body as Phaser.Physics.Arcade.StaticBody).setSize(worldW, worldH);
              blockStart = -1;
            }

            // Handle special (blue) zones
            if (zone === ZoneType.SPECIAL && blueStart === -1) {
              blueStart = px;
            } else if (zone !== ZoneType.SPECIAL && blueStart !== -1) {
              const worldX = offsetX + blueStart * scaleX;
              const worldY = offsetY + py * scaleY;
              const worldW = (px - blueStart) * scaleX;
              const worldH = step * scaleY;
              this.specialZones.push({ x: worldX, y: worldY, w: worldW, h: worldH });
              blueStart = -1;
            }
          }
        }
      }
    }

    this.blockers.refresh();
  }

  private classifyPixel(ctx: CanvasRenderingContext2D, x: number, y: number): ZoneType {
    const pixel = ctx.getImageData(x, y, 1, 1).data;
    const r = pixel[0], g = pixel[1], b = pixel[2];
    const brightness = (r + g + b) / 3;

    // Blue detection: high blue, low red/green relative to blue
    if (b > 120 && b > r * 1.5 && b > g * 1.3) {
      return ZoneType.SPECIAL;
    }

    // Dark = blocked
    if (brightness < 128) {
      return ZoneType.BLOCKED;
    }

    return ZoneType.NORMAL;
  }

  /** Check if a world position is in a special (blue) zone */
  isInSpecialZone(wx: number, wy: number): boolean {
    for (const z of this.specialZones) {
      if (wx >= z.x && wx <= z.x + z.w && wy >= z.y && wy <= z.y + z.h) {
        return true;
      }
    }
    return false;
  }

  /** Check if a world position is blocked (black zone) */
  isBlocked(wx: number, wy: number): boolean {
    // Check against blocker bodies
    for (const child of this.blockers.getChildren()) {
      const body = (child as Phaser.GameObjects.Rectangle).body as Phaser.Physics.Arcade.StaticBody;
      if (body && wx >= body.x && wx <= body.x + body.width &&
          wy >= body.y && wy <= body.y + body.height) {
        return true;
      }
    }
    return false;
  }

  /** Get zone type at world position */
  getZoneAt(wx: number, wy: number): ZoneType {
    if (this.isBlocked(wx, wy)) return ZoneType.BLOCKED;
    if (this.isInSpecialZone(wx, wy)) return ZoneType.SPECIAL;
    return ZoneType.NORMAL;
  }

  /** Get all special zone rects for spawning/effects */
  getSpecialZones(): SpecialZoneRect[] {
    return this.specialZones;
  }

  getBlockers(): Phaser.Physics.Arcade.StaticGroup {
    return this.blockers;
  }

  destroy(): void {
    this.blockers.clear(true, true);
    this.specialZones = [];
  }
}
