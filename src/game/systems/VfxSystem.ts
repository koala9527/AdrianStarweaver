import { EventBus } from '../core/EventBus';
import { GameEvents, SpellHitPayload, EnemyKillPayload, LevelUpPayload, PlayerDamagedPayload } from '../types';
import { SPELL_VFX } from '../data/spellVfx';
import { MapCollision } from '../core/MapCollision';
import { Player } from '../entities/Player';

interface DamageNumber {
  text: Phaser.GameObjects.Text;
  timer: number;
  vy: number;
}

interface HitSpark {
  particles: Phaser.GameObjects.Arc[];
  timer: number;
  vx: number[];
  vy: number[];
}

export class VfxSystem {
  private scene: Phaser.Scene;
  private damageNumbers: DamageNumber[] = [];
  private hitSparks: HitSpark[] = [];
  private killStreak = 0;
  private killStreakTimer = 0;
  private streakText: Phaser.GameObjects.Text | null = null;
  private lowHpVignette: Phaser.GameObjects.Rectangle | null = null;
  private mapCollision: MapCollision | null = null;
  private player: Player | null = null;
  private inSpecialZone = false;
  private zoneParticleTimer = 0;
  private zoneGlow: Phaser.GameObjects.Arc | null = null;

  constructor(scene: Phaser.Scene, eventBus: EventBus) {
    this.scene = scene;

    eventBus.on(GameEvents.SPELL_HIT, this.onSpellHit, this);
    eventBus.on(GameEvents.ENEMY_KILL, this.onEnemyKill, this);
    eventBus.on(GameEvents.LEVEL_UP, this.onLevelUp, this);
    eventBus.on(GameEvents.PLAYER_DAMAGED, this.onPlayerDamaged, this);
    eventBus.on(GameEvents.RELIC_ACQUIRED, this.onRelicAcquired, this);
    eventBus.on(GameEvents.BUFF_GAINED, this.onBuffGained, this);
  }

  setMapCollision(mc: MapCollision, player: Player): void {
    this.mapCollision = mc;
    this.player = player;
  }

  private onSpellHit(payload: SpellHitPayload): void {
    const { position, damage, isCrit, spellId } = payload;
    const vfx = SPELL_VFX[spellId] ?? SPELL_VFX.arcane_missile;

    // Damage number with spell color
    this.spawnDamageNumber(position.x, position.y, damage, isCrit, vfx.hitColor);

    // Hit spark particles with spell color
    const sparkColor = isCrit ? 0xffdd44 : vfx.hitColor;
    this.spawnHitSpark(position.x, position.y, sparkColor, vfx.hitParticleCount, vfx.hitSparkSize);

    // Screen shake — per spell
    this.shake(isCrit ? vfx.critScreenShake * 1.5 : vfx.screenShake, isCrit ? 150 : 80);

    // Crit: enhanced effects
    if (isCrit) {
      this.freezeFrame(80);
      this.spawnCritBurst(position.x, position.y, vfx.hitColor);
      this.screenFlash(vfx.hitColor, 0.25, 180);

      // Multi-layer shockwave rings (3 concentric rings at different speeds)
      for (let ring = 0; ring < 3; ring++) {
        const delay = ring * 60;
        const maxRadius = 80 + ring * 30;
        const lineWidth = 4 - ring;
        const ringColor = ring === 0 ? 0xffffff : vfx.hitColor;
        this.scene.time.delayedCall(delay, () => {
          const shockwave = this.scene.add.circle(position.x, position.y, 10, ringColor, 0)
            .setDepth(157).setStrokeStyle(lineWidth, ringColor, 0.8 - ring * 0.2);
          this.scene.tweens.add({
            targets: shockwave,
            radius: maxRadius,
            alpha: 0,
            duration: 350 + ring * 80,
            ease: 'Quad.easeOut',
            onUpdate: () => {
              shockwave.setStrokeStyle(lineWidth, ringColor, shockwave.alpha);
            },
            onComplete: () => shockwave.destroy(),
          });
        });
      }

      // Cross slash lines (X pattern)
      for (let s = 0; s < 2; s++) {
        const slash = this.scene.add.graphics().setDepth(158);
        const slashAngle = s * (Math.PI / 2) + Math.random() * 0.3;
        const len = 50;
        slash.lineStyle(3, 0xffffff, 0.9);
        slash.beginPath();
        slash.moveTo(
          position.x - Math.cos(slashAngle) * len,
          position.y - Math.sin(slashAngle) * len,
        );
        slash.lineTo(
          position.x + Math.cos(slashAngle) * len,
          position.y + Math.sin(slashAngle) * len,
        );
        slash.strokePath();
        this.scene.tweens.add({
          targets: slash,
          alpha: 0,
          duration: 250,
          delay: s * 40,
          onComplete: () => slash.destroy(),
        });
      }
    }
  }

  private onEnemyKill(payload: EnemyKillPayload): void {
    const { position, element } = payload;
    const color = element === 'FIRE' ? 0xff6622
      : element === 'ICE' ? 0x88ccff
      : element === 'LIGHTNING' ? 0xffee44
      : element === 'ARCANE' ? 0xaa44ff
      : 0xffffff;

    // Kill burst
    this.spawnKillBurst(position.x, position.y, color);

    // Kill streak
    this.killStreak++;
    this.killStreakTimer = 2500;

    // Tiered display: only show at 7+ kills, then every 5
    if (this.killStreak >= 7 && (this.killStreak === 7 || this.killStreak % 5 === 0)) {
      this.showKillStreak();
      this.screenFlash(0xffdd44, 0.15, 150);
      this.shake(5 + Math.min(this.killStreak * 0.5, 10), 200);
    } else {
      this.shake(3, 100);
    }
  }

  private onLevelUp(_payload: LevelUpPayload): void {
    this.screenFlash(0x44ffcc, 0.25, 300);
    this.shake(6, 200);

    const cam = this.scene.cameras.main;
    const cx = cam.scrollX + cam.width / 2;
    const cy = cam.scrollY + cam.height / 2;
    this.spawnLevelUpBurst(cx, cy);
  }

  private onRelicAcquired(): void {
    if (!this.player) return;
    const px = this.player.x;
    const py = this.player.y;

    this.screenFlash(0xffaa44, 0.3, 300);
    this.shake(5, 200);

    // Gold light pillar
    const pillar = this.scene.add.rectangle(px, py - 200, 8, 400, 0xffcc44, 0.6)
      .setDepth(160).setOrigin(0.5, 1);
    this.scene.tweens.add({
      targets: pillar,
      alpha: 0,
      scaleX: 3,
      duration: 800,
      ease: 'Quad.easeOut',
      onComplete: () => pillar.destroy(),
    });

    // Gold particle burst
    for (let i = 0; i < 20; i++) {
      const angle = (i / 20) * Math.PI * 2;
      const speed = 3 + Math.random() * 4;
      const colors = [0xffcc44, 0xffdd88, 0xffaa22, 0xffffff];
      const c = colors[Math.floor(Math.random() * colors.length)];
      const p = this.scene.add.circle(px, py, 3 + Math.random() * 3, c, 0.9)
        .setDepth(161);
      this.scene.tweens.add({
        targets: p,
        x: px + Math.cos(angle) * speed * 25,
        y: py + Math.sin(angle) * speed * 25,
        alpha: 0,
        duration: 600,
        onComplete: () => p.destroy(),
      });
    }
  }

  private onBuffGained(payload: { name: string }): void {
    if (!this.player) return;

    // Brief green/gold flash around player
    const ring = this.scene.add.circle(this.player.x, this.player.y, 20, 0xffcc44, 0)
      .setDepth(156).setStrokeStyle(3, 0xffcc44, 0.7);
    this.scene.tweens.add({
      targets: ring,
      radius: 60,
      alpha: 0,
      duration: 400,
      ease: 'Quad.easeOut',
      onUpdate: () => ring.setStrokeStyle(3, 0xffcc44, ring.alpha * 0.7),
      onComplete: () => ring.destroy(),
    });

    // Floating buff name text
    const text = this.scene.add.text(this.player.x, this.player.y - 30, payload.name, {
      fontSize: '14px',
      color: '#ffcc44',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(162);
    this.scene.tweens.add({
      targets: text,
      y: text.y - 40,
      alpha: 0,
      duration: 1500,
      ease: 'Quad.easeOut',
      onComplete: () => text.destroy(),
    });
  }

  private onPlayerDamaged(payload: PlayerDamagedPayload): void {
    this.screenFlash(0xff0000, 0.4, 250);
    this.shake(10, 200);
    this.showDamageVignette();

    // Red crack lines from screen edges
    const cam = this.scene.cameras.main;
    const cx = cam.centerX;
    const cy = cam.centerY;
    for (let i = 0; i < 4; i++) {
      const crack = this.scene.add.graphics().setDepth(997).setScrollFactor(0);
      const side = i; // 0=top, 1=right, 2=bottom, 3=left
      const startX = side === 1 ? 1280 : side === 3 ? 0 : Math.random() * 1280;
      const startY = side === 0 ? 0 : side === 2 ? 720 : Math.random() * 720;
      const midX = startX + (cx - startX) * (0.2 + Math.random() * 0.2);
      const midY = startY + (cy - startY) * (0.2 + Math.random() * 0.2);

      crack.lineStyle(2 + Math.random() * 2, 0xff2222, 0.7);
      crack.beginPath();
      crack.moveTo(startX, startY);
      // Jagged path
      const steps = 3;
      let px = startX, py = startY;
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const tx = startX + (midX - startX) * t + (Math.random() - 0.5) * 30;
        const ty = startY + (midY - startY) * t + (Math.random() - 0.5) * 30;
        crack.lineTo(tx, ty);
        px = tx; py = ty;
      }
      crack.strokePath();

      this.scene.tweens.add({
        targets: crack,
        alpha: 0,
        duration: 400,
        delay: 50,
        onComplete: () => crack.destroy(),
      });
    }

    // Directional damage indicator (red arrow toward source)
    if (payload.source && this.player) {
      const enemies = (this.scene as Phaser.Scene).children.list;
      // Show a red directional flash on the vignette side
      const indicator = this.scene.add.circle(cx, cy, 300, 0xff0000, 0)
        .setStrokeStyle(8, 0xff0000, 0.5)
        .setScrollFactor(0).setDepth(996);
      this.scene.tweens.add({
        targets: indicator,
        alpha: 0,
        duration: 300,
        onUpdate: () => indicator.setStrokeStyle(8, 0xff0000, indicator.alpha * 0.5),
        onComplete: () => indicator.destroy(),
      });
    }
  }

  private spawnDamageNumber(x: number, y: number, damage: number, isCrit: boolean, color?: number): void {
    const hexColor = isCrit ? '#ffdd44' : (color ? `#${color.toString(16).padStart(6, '0')}` : '#ffffff');
    const fontSize = isCrit ? '32px' : '14px';

    const text = this.scene.add.text(
      x + (Math.random() - 0.5) * 20,
      y - 10,
      isCrit ? `💥${damage}!` : `${damage}`,
      {
        fontSize,
        color: hexColor,
        fontFamily: 'monospace',
        fontStyle: isCrit ? 'bold' : 'normal',
        stroke: '#000000',
        strokeThickness: isCrit ? 5 : 3,
      }
    ).setOrigin(0.5).setDepth(160);

    if (isCrit) {
      text.setScale(2.5);
      this.scene.tweens.add({
        targets: text,
        scaleX: 1.4,
        scaleY: 1.4,
        duration: 300,
        ease: 'Back.easeOut',
        onComplete: () => {
          this.scene.tweens.add({
            targets: text,
            scaleX: 1.1,
            scaleY: 1.1,
            duration: 150,
          });
        },
      });
    }

    this.damageNumbers.push({
      text,
      timer: isCrit ? 1200 : 800,
      vy: isCrit ? -2.5 : -1.5 - Math.random() * 0.5,
    });
  }

  private spawnHitSpark(x: number, y: number, color: number, count = 5, size = 2): void {
    const particles: Phaser.GameObjects.Arc[] = [];
    const vx: number[] = [];
    const vy: number[] = [];

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 4;
      const p = this.scene.add.circle(x, y, size + Math.random() * size, color, 0.9)
        .setDepth(155);
      particles.push(p);
      vx.push(Math.cos(angle) * speed);
      vy.push(Math.sin(angle) * speed);
    }

    this.hitSparks.push({ particles, timer: 350, vx, vy });
  }

  private spawnCritBurst(x: number, y: number, color: number): void {
    // Ring expansion effect
    const ring = this.scene.add.circle(x, y, 5, color, 0).setDepth(156);
    ring.setStrokeStyle(3, color, 0.8);
    this.scene.tweens.add({
      targets: ring,
      radius: 60,
      alpha: 0,
      duration: 400,
      ease: 'Quad.easeOut',
      onUpdate: () => {
        ring.setStrokeStyle(3, color, ring.alpha);
      },
      onComplete: () => ring.destroy(),
    });

    // Extra sparks
    this.spawnHitSpark(x, y, 0xffdd44, 10, 3);
    this.spawnHitSpark(x, y, color, 8, 2);
  }

  private spawnKillBurst(x: number, y: number, color: number): void {
    const count = 14;
    const particles: Phaser.GameObjects.Arc[] = [];
    const vx: number[] = [];
    const vy: number[] = [];

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const speed = 3 + Math.random() * 5;
      const colors = [color, 0xffdd44, 0xffffff];
      const c = colors[Math.floor(Math.random() * colors.length)];
      const p = this.scene.add.circle(x, y, 2 + Math.random() * 3, c, 0.9)
        .setDepth(155);
      particles.push(p);
      vx.push(Math.cos(angle) * speed);
      vy.push(Math.sin(angle) * speed);
    }

    this.hitSparks.push({ particles, timer: 500, vx, vy });
  }

  private spawnLevelUpBurst(x: number, y: number): void {
    const count = 28;
    const particles: Phaser.GameObjects.Arc[] = [];
    const vx: number[] = [];
    const vy: number[] = [];

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const speed = 5 + Math.random() * 7;
      const colors = [0x44ffcc, 0xffdd55, 0x88ddff, 0xcc88ff];
      const color = colors[i % colors.length];
      const p = this.scene.add.circle(x, y, 3 + Math.random() * 4, color, 0.9)
        .setDepth(155);
      particles.push(p);
      vx.push(Math.cos(angle) * speed);
      vy.push(Math.sin(angle) * speed);
    }

    this.hitSparks.push({ particles, timer: 900, vx, vy });
  }

  private showDamageVignette(): void {
    if (!this.lowHpVignette) {
      this.lowHpVignette = this.scene.add.rectangle(
        this.scene.cameras.main.centerX,
        this.scene.cameras.main.centerY,
        1280, 720, 0xff0000, 0
      ).setScrollFactor(0).setDepth(998);
    }

    this.lowHpVignette.setAlpha(0.25);
    this.scene.tweens.add({
      targets: this.lowHpVignette,
      alpha: 0,
      duration: 500,
      ease: 'Quad.easeOut',
    });
  }

  private shake(intensity: number, duration: number): void {
    this.scene.cameras.main.shake(duration, intensity / 1000);
  }

  private screenFlash(color: number, alpha: number, duration: number): void {
    const r = (color >> 16) & 0xff;
    const g = (color >> 8) & 0xff;
    const b = color & 0xff;
    this.scene.cameras.main.flash(duration, r, g, b, false);
    const overlay = this.scene.add.rectangle(
      this.scene.cameras.main.centerX, this.scene.cameras.main.centerY,
      1280, 720, color, alpha,
    ).setScrollFactor(0).setDepth(999);
    this.scene.tweens.add({
      targets: overlay,
      alpha: 0,
      duration,
      onComplete: () => overlay.destroy(),
    });
  }

  private freezeFrame(ms: number): void {
    this.scene.physics.pause();
    setTimeout(() => {
      if (this.scene.physics.world) {
        this.scene.physics.resume();
      }
    }, ms);
  }

  private showKillStreak(): void {
    if (this.streakText) {
      this.streakText.destroy();
    }

    const cam = this.scene.cameras.main;
    const x = cam.centerX;
    const y = cam.centerY - 80;

    // Tiered kill streak labels
    let label: string;
    let color: string;
    let fontSize: string;
    if (this.killStreak >= 50) {
      label = `☠️ 神话 ${this.killStreak}连杀!`;
      color = '#ff2222';
      fontSize = '40px';
    } else if (this.killStreak >= 30) {
      label = `🌟 传说 ${this.killStreak}连杀!`;
      color = '#ff8800';
      fontSize = '36px';
    } else if (this.killStreak >= 20) {
      label = `💀 无双 ${this.killStreak}连杀!`;
      color = '#ff44ff';
      fontSize = '34px';
    } else if (this.killStreak >= 15) {
      label = `⚡ 狂暴 ${this.killStreak}连杀!`;
      color = '#ffee44';
      fontSize = '32px';
    } else if (this.killStreak >= 10) {
      label = `🔥 屠杀 ${this.killStreak}连杀!`;
      color = '#ff6622';
      fontSize = '30px';
    } else {
      label = `💥 ${this.killStreak}连杀!`;
      color = '#ffdd44';
      fontSize = '28px';
    }

    this.streakText = this.scene.add.text(x, y, label, {
      fontSize,
      color,
      fontFamily: 'monospace',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 5,
    }).setOrigin(0.5).setDepth(170).setScrollFactor(0);

    this.streakText.setScale(0.3).setAlpha(0);
    this.scene.tweens.add({
      targets: this.streakText,
      scaleX: 1.4,
      scaleY: 1.4,
      alpha: 1,
      duration: 300,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.scene.tweens.add({
          targets: this.streakText,
          scaleX: 1,
          scaleY: 1,
          duration: 200,
        });
      },
    });

    // Extra burst particles for high streaks — tiered unique effects
    if (this.killStreak >= 7) {
      const burstCount = Math.min(this.killStreak, 40);
      let particleColor: number;
      let particleColors: number[];

      if (this.killStreak >= 30) {
        // Rainbow particle storm
        particleColors = [0xff2222, 0xff8800, 0xffee44, 0x44ff44, 0x4488ff, 0xaa44ff, 0xff44ff];
      } else if (this.killStreak >= 20) {
        // Purple vortex
        particleColors = [0xaa44ff, 0xcc66ff, 0xff44ff, 0x8822cc];
      } else if (this.killStreak >= 15) {
        // Lightning sparks
        particleColors = [0xffee44, 0xffffaa, 0xffdd00, 0xffffff];
      } else if (this.killStreak >= 10) {
        // Fire particles
        particleColors = [0xff6622, 0xff4400, 0xffaa33, 0xff8800];
      } else {
        // Gold ring
        particleColors = [0xffdd44, 0xffcc00, 0xffee88];
      }

      for (let i = 0; i < burstCount; i++) {
        const angle = (i / burstCount) * Math.PI * 2;
        const speed = 3 + Math.random() * 5;
        particleColor = particleColors[Math.floor(Math.random() * particleColors.length)];
        const size = this.killStreak >= 20 ? 4 + Math.random() * 4 : 3 + Math.random() * 3;
        const p = this.scene.add.circle(
          x + Math.cos(angle) * 20, y + Math.sin(angle) * 20,
          size, particleColor, 0.9,
        ).setDepth(169).setScrollFactor(0);

        if (this.killStreak >= 20) {
          // Spiral outward for high streaks
          this.scene.tweens.add({
            targets: p,
            x: p.x + Math.cos(angle + 1) * speed * 40,
            y: p.y + Math.sin(angle + 1) * speed * 40,
            alpha: 0,
            scaleX: 0.2,
            scaleY: 0.2,
            duration: 800,
            onComplete: () => p.destroy(),
          });
        } else {
          this.scene.tweens.add({
            targets: p,
            x: p.x + Math.cos(angle) * speed * 30,
            y: p.y + Math.sin(angle) * speed * 30,
            alpha: 0,
            duration: 600,
            onComplete: () => p.destroy(),
          });
        }
      }

      // Extra: expanding ring for 15+ streaks
      if (this.killStreak >= 15) {
        const ringColor = this.killStreak >= 30 ? 0xff44ff
          : this.killStreak >= 20 ? 0xaa44ff
          : 0xffee44;
        const ring = this.scene.add.circle(x, y, 10, ringColor, 0)
          .setStrokeStyle(3, ringColor, 0.7)
          .setDepth(168).setScrollFactor(0);
        this.scene.tweens.add({
          targets: ring,
          radius: 120,
          alpha: 0,
          duration: 500,
          ease: 'Quad.easeOut',
          onUpdate: () => ring.setStrokeStyle(3, ringColor, ring.alpha * 0.7),
          onComplete: () => ring.destroy(),
        });
      }
    }
  }

  update(delta: number): void {
    // Damage numbers
    for (let i = this.damageNumbers.length - 1; i >= 0; i--) {
      const dn = this.damageNumbers[i];
      dn.timer -= delta;
      dn.text.y += dn.vy;
      if (dn.timer < 300) {
        dn.text.setAlpha(dn.timer / 300);
      }
      if (dn.timer <= 0) {
        dn.text.destroy();
        this.damageNumbers.splice(i, 1);
      }
    }

    // Hit sparks
    for (let i = this.hitSparks.length - 1; i >= 0; i--) {
      const hs = this.hitSparks[i];
      hs.timer -= delta;
      const alpha = Math.max(0, hs.timer / 500);
      for (let j = 0; j < hs.particles.length; j++) {
        hs.particles[j].x += hs.vx[j];
        hs.particles[j].y += hs.vy[j];
        hs.particles[j].setAlpha(alpha);
        hs.vx[j] *= 0.95;
        hs.vy[j] *= 0.95;
      }
      if (hs.timer <= 0) {
        for (const p of hs.particles) p.destroy();
        this.hitSparks.splice(i, 1);
      }
    }

    // Kill streak decay
    if (this.killStreakTimer > 0) {
      this.killStreakTimer -= delta;
      if (this.killStreakTimer <= 0) {
        this.killStreak = 0;
        if (this.streakText) {
          this.scene.tweens.add({
            targets: this.streakText,
            alpha: 0,
            y: (this.streakText.y ?? 0) - 30,
            duration: 300,
            onComplete: () => { this.streakText?.destroy(); this.streakText = null; },
          });
        }
      }
    }

    // Blue zone VFX
    this.updateSpecialZoneVfx(delta);
  }

  private updateSpecialZoneVfx(delta: number): void {
    if (!this.mapCollision || !this.player) return;

    const wasInZone = this.inSpecialZone;
    this.inSpecialZone = this.mapCollision.isInSpecialZone(this.player.x, this.player.y);

    // Zone enter/exit
    if (this.inSpecialZone && !wasInZone) {
      // Create ground glow
      this.zoneGlow = this.scene.add.circle(this.player.x, this.player.y, 80, 0x4488ff, 0.12)
        .setDepth(5);
      this.scene.tweens.add({
        targets: this.zoneGlow,
        alpha: 0.2,
        duration: 500,
        ease: 'Sine.easeInOut',
      });
    } else if (!this.inSpecialZone && wasInZone) {
      if (this.zoneGlow) {
        const glow = this.zoneGlow;
        this.scene.tweens.add({
          targets: glow,
          alpha: 0,
          duration: 300,
          onComplete: () => glow.destroy(),
        });
        this.zoneGlow = null;
      }
    }

    // Floating particles while in zone
    if (this.inSpecialZone && this.player) {
      // Follow player
      if (this.zoneGlow) {
        this.zoneGlow.setPosition(this.player.x, this.player.y);
        const pulse = 0.9 + Math.sin(Date.now() * 0.003) * 0.1;
        this.zoneGlow.setScale(pulse);
      }

      this.zoneParticleTimer += delta;
      if (this.zoneParticleTimer >= 150) {
        this.zoneParticleTimer = 0;
        const angle = Math.random() * Math.PI * 2;
        const dist = 30 + Math.random() * 60;
        const px = this.player.x + Math.cos(angle) * dist;
        const py = this.player.y + Math.sin(angle) * dist;
        const colors = [0x4488ff, 0x66aaff, 0x88ccff, 0xaaddff];
        const color = colors[Math.floor(Math.random() * colors.length)];
        const p = this.scene.add.circle(px, py, 1.5 + Math.random() * 2, color, 0.6)
          .setDepth(6);
        this.scene.tweens.add({
          targets: p,
          y: py - 20 - Math.random() * 15,
          alpha: 0,
          scaleX: 0.3,
          scaleY: 0.3,
          duration: 800 + Math.random() * 400,
          onComplete: () => p.destroy(),
        });
      }
    }
  }

  destroy(): void {
    for (const dn of this.damageNumbers) dn.text.destroy();
    for (const hs of this.hitSparks) {
      for (const p of hs.particles) p.destroy();
    }
    this.streakText?.destroy();
    this.lowHpVignette?.destroy();
    this.zoneGlow?.destroy();
    this.damageNumbers = [];
    this.hitSparks = [];
  }
}
