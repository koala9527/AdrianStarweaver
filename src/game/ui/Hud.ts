import { Player } from '../entities/Player';
import { LevelUpSystem } from '../systems/LevelUpSystem';
import { SpellSystem } from '../systems/SpellSystem';
import { GameTimer } from '../core/GameTimer';
import { EventBus } from '../core/EventBus';
import { GameEvents } from '../types';
import { SPELL_VFX } from '../data/spellVfx';

export class Hud extends Phaser.GameObjects.Container {
  private player: Player;
  private levelUpSystem: LevelUpSystem;
  private spellSystem: SpellSystem;
  private gameTimer: GameTimer;

  // Health bar
  private healthBarBg!: Phaser.GameObjects.Rectangle;
  private healthBarFill!: Phaser.GameObjects.Rectangle;
  private healthBarGlow!: Phaser.GameObjects.Rectangle;
  private shieldBarFill!: Phaser.GameObjects.Rectangle;
  private healthText!: Phaser.GameObjects.Text;
  private healthIcon!: Phaser.GameObjects.Text;

  // XP bar
  private xpBarBg!: Phaser.GameObjects.Rectangle;
  private xpBarFill!: Phaser.GameObjects.Rectangle;
  private xpBarGlow!: Phaser.GameObjects.Rectangle;
  private xpTargetFill = 0;

  // Level badge
  private levelBadgeBg!: Phaser.GameObjects.Rectangle;
  private levelBadgeRing!: Phaser.GameObjects.Rectangle;
  private levelText!: Phaser.GameObjects.Text;

  // Timer
  private timerBg!: Phaser.GameObjects.Rectangle;
  private timerText!: Phaser.GameObjects.Text;
  private timerIcon!: Phaser.GameObjects.Text;

  // Kill counter
  private killText!: Phaser.GameObjects.Text;
  private killCount = 0;

  // Spell icons
  private spellIcons: Phaser.GameObjects.Container[] = [];
  private spellIconSpellIds: string[] = [];

  private static readonly HEALTH_BAR_W = 200;
  private static readonly HEALTH_BAR_H = 16;
  private static readonly XP_BAR_W = 1280;
  private static readonly XP_BAR_H = 8;

  constructor(
    scene: Phaser.Scene,
    player: Player,
    levelUpSystem: LevelUpSystem,
    spellSystem: SpellSystem,
    gameTimer: GameTimer,
    eventBus: EventBus,
  ) {
    super(scene, 0, 0);
    this.player = player;
    this.levelUpSystem = levelUpSystem;
    this.spellSystem = spellSystem;
    this.gameTimer = gameTimer;

    scene.add.existing(this);
    this.setScrollFactor(0);
    this.setDepth(100);

    this.createHealthBar();
    this.createXpBar();
    this.createLevelBadge();
    this.createTimer();
    this.createKillCounter(eventBus);

    eventBus.on(GameEvents.LEVEL_UP, this.onLevelUp, this);
    eventBus.on(GameEvents.XP_GAINED, this.onXpGained, this);
  }

  private createHealthBar(): void {
    const x = 52, y = 16;

    // Heart icon
    this.healthIcon = this.scene.add.text(16, y + 8, '❤', {
      fontSize: '18px',
      fontFamily: 'monospace',
    }).setOrigin(0.5);
    this.add(this.healthIcon);

    // Dark panel behind bar
    const panel = this.scene.add.rectangle(x - 4, y - 2, Hud.HEALTH_BAR_W + 8, Hud.HEALTH_BAR_H + 4, 0x0a0a1a, 0.85)
      .setOrigin(0, 0).setStrokeStyle(1, 0x334466, 0.6);
    this.add(panel);

    this.healthBarBg = this.scene.add.rectangle(x, y, Hud.HEALTH_BAR_W, Hud.HEALTH_BAR_H, 0x1a0a0a)
      .setOrigin(0, 0);
    this.healthBarFill = this.scene.add.rectangle(x, y, Hud.HEALTH_BAR_W, Hud.HEALTH_BAR_H, 0x44cc55)
      .setOrigin(0, 0);
    // Glow highlight on top of fill
    this.healthBarGlow = this.scene.add.rectangle(x, y, Hud.HEALTH_BAR_W, 3, 0xffffff, 0.15)
      .setOrigin(0, 0);
    this.shieldBarFill = this.scene.add.rectangle(x, y, 0, Hud.HEALTH_BAR_H, 0x4488ff, 0.7)
      .setOrigin(0, 0);

    this.healthText = this.scene.add.text(x + Hud.HEALTH_BAR_W / 2, y + Hud.HEALTH_BAR_H / 2, '', {
      fontSize: '10px',
      color: '#ffffff',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5);

    this.add([this.healthBarBg, this.healthBarFill, this.healthBarGlow, this.shieldBarFill, this.healthText]);
  }

  private createXpBar(): void {
    const y = 712;
    this.xpBarBg = this.scene.add.rectangle(0, y, Hud.XP_BAR_W, Hud.XP_BAR_H, 0x0a0a1a)
      .setOrigin(0, 0);
    this.xpBarFill = this.scene.add.rectangle(0, y, 0, Hud.XP_BAR_H, 0x44ffcc)
      .setOrigin(0, 0);
    this.xpBarGlow = this.scene.add.rectangle(0, y, 0, 2, 0xffffff, 0.2)
      .setOrigin(0, 0);
    this.add([this.xpBarBg, this.xpBarFill, this.xpBarGlow]);
  }

  private createLevelBadge(): void {
    const cx = 28, cy = 698;
    // Outer ring
    this.levelBadgeRing = this.scene.add.rectangle(cx, cy, 44, 22, 0x44ffcc, 0.15)
      .setOrigin(0.5).setStrokeStyle(2, 0x44ffcc, 0.6);
    // Inner bg
    this.levelBadgeBg = this.scene.add.rectangle(cx, cy, 40, 18, 0x0a1a2a, 0.9)
      .setOrigin(0.5);
    this.levelText = this.scene.add.text(cx, cy, 'Lv1', {
      fontSize: '12px',
      color: '#44ffcc',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5);
    this.add([this.levelBadgeRing, this.levelBadgeBg, this.levelText]);
  }

  private createTimer(): void {
    const cx = 640, y = 50;
    // Timer panel — positioned below quest banner area
    this.timerBg = this.scene.add.rectangle(cx, y, 100, 30, 0x0a0a1a, 0.8)
      .setOrigin(0.5).setStrokeStyle(1, 0x334466, 0.5);
    this.timerIcon = this.scene.add.text(cx - 36, y, '⏱', {
      fontSize: '14px',
      fontFamily: 'monospace',
    }).setOrigin(0.5);
    this.timerText = this.scene.add.text(cx + 4, y, '0:00', {
      fontSize: '16px',
      color: '#ddddff',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5);
    this.add([this.timerBg, this.timerIcon, this.timerText]);
  }

  private createKillCounter(eventBus: EventBus): void {
    const panel = this.scene.add.rectangle(1230, 18, 80, 24, 0x0a0a1a, 0.7)
      .setOrigin(0.5, 0).setStrokeStyle(1, 0x334466, 0.4);
    this.killText = this.scene.add.text(1230, 22, '☠ 0', {
      fontSize: '13px',
      color: '#cc8866',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5, 0);
    this.add([panel, this.killText]);

    eventBus.on(GameEvents.ENEMY_KILL, () => {
      this.killCount++;
      this.killText.setText(`☠ ${this.killCount}`);
      // Pop animation
      this.scene.tweens.add({
        targets: this.killText,
        scaleX: 1.3,
        scaleY: 1.3,
        duration: 80,
        yoyo: true,
      });
    });
  }

  private onLevelUp(): void {
    this.levelText.setText(`Lv${this.player.playerState.level}`);
    // Ring flash
    this.scene.tweens.add({
      targets: this.levelBadgeRing,
      scaleX: 1.6,
      scaleY: 1.6,
      alpha: 0,
      duration: 300,
      ease: 'Quad.easeOut',
      onComplete: () => {
        this.levelBadgeRing.setScale(1).setAlpha(1);
      },
    });
    this.scene.tweens.add({
      targets: this.levelText,
      scaleX: 1.5,
      scaleY: 1.5,
      duration: 150,
      yoyo: true,
      ease: 'Back.easeOut',
    });
  }

  private onXpGained(): void {
    const xp = this.levelUpSystem.getCurrentXp();
    const expToNext = this.levelUpSystem.getExpToNext();
    this.xpTargetFill = expToNext > 0 ? xp / expToNext : 0;
  }

  update(): void {
    const ps = this.player.playerState;

    // Health bar
    const hpRatio = ps.maxHp > 0 ? ps.hp / ps.maxHp : 0;
    const fillW = Hud.HEALTH_BAR_W * Math.max(0, Math.min(1, hpRatio));
    this.healthBarFill.width = fillW;
    this.healthBarGlow.width = fillW;

    if (hpRatio > 0.5) this.healthBarFill.setFillStyle(0x44cc55);
    else if (hpRatio > 0.25) this.healthBarFill.setFillStyle(0xddcc44);
    else this.healthBarFill.setFillStyle(0xdd4444);

    // Pulse heart when low HP
    if (hpRatio < 0.3) {
      const pulse = 1 + Math.sin(Date.now() * 0.008) * 0.15;
      this.healthIcon.setScale(pulse);
    } else {
      this.healthIcon.setScale(1);
    }

    this.healthText.setText(`${Math.ceil(ps.hp)}/${ps.maxHp}`);

    // Shield
    const shieldRatio = ps.maxHp > 0 ? ps.shield / ps.maxHp : 0;
    const shieldW = Hud.HEALTH_BAR_W * Math.max(0, Math.min(1, shieldRatio));
    // Clamp so shield doesn't overflow past bar end
    const maxShieldW = Math.max(0, Hud.HEALTH_BAR_W - fillW);
    this.shieldBarFill.width = Math.min(shieldW, maxShieldW);
    this.shieldBarFill.x = 52 + fillW;
    this.shieldBarFill.setVisible(this.shieldBarFill.width > 0.5);

    // XP bar (lerp)
    const currentFill = this.xpBarFill.width / Hud.XP_BAR_W;
    const targetFill = ps.level >= 30 ? 1 : this.xpTargetFill;
    const newFill = currentFill + (targetFill - currentFill) * 0.15;
    const xpW = Hud.XP_BAR_W * Math.max(0, Math.min(1, newFill));
    this.xpBarFill.width = xpW;
    this.xpBarGlow.width = xpW;

    // Timer
    const elapsed = this.gameTimer.getElapsed();
    const minutes = Math.floor(elapsed / 60);
    const seconds = Math.floor(elapsed % 60);
    this.timerText.setText(`${minutes}:${seconds.toString().padStart(2, '0')}`);

    if (elapsed >= 270) {
      const flash = Math.sin(elapsed * 4) > 0;
      this.timerText.setColor(flash ? '#ff4444' : '#ddddff');
      this.timerBg.setStrokeStyle(1, flash ? 0xff4444 : 0x334466, 0.5);
    }

    // Spell icons
    this.updateSpellIcons();
  }

  private updateSpellIcons(): void {
    const slots = this.player.playerState.spellSlots;

    // Create new icons as spells are unlocked
    while (this.spellIcons.length < slots.length) {
      const idx = this.spellIcons.length;
      const spellId = slots[idx].spellId;
      const container = this.createSpellIcon(idx, spellId);
      this.spellIcons.push(container);
      this.spellIconSpellIds.push(spellId);
      this.add(container);

      // Entrance animation for new spell
      container.setScale(0).setAlpha(0);
      this.scene.tweens.add({
        targets: container,
        scaleX: 1,
        scaleY: 1,
        alpha: 1,
        duration: 300,
        ease: 'Back.easeOut',
        delay: 100,
      });
    }

    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const container = this.spellIcons[i];
      // index: 0=bg, 1=icon, 2=cooldownOverlay, 3=levelBadge
      const cooldownOverlay = container.getAt(2) as Phaser.GameObjects.Rectangle;
      const levelBadge = container.getAt(3) as Phaser.GameObjects.Text;

      const effectiveCooldown = this.spellSystem.getEffectiveCooldown(slot);
      const ratio = effectiveCooldown > 0 ? slot.cooldownRemaining / effectiveCooldown : 0;
      cooldownOverlay.height = 38 * Math.max(0, Math.min(1, ratio));
      cooldownOverlay.y = -19 + (38 - cooldownOverlay.height);

      levelBadge.setText(`${slot.level}`);
    }
  }

  private createSpellIcon(index: number, spellId: string): Phaser.GameObjects.Container {
    const baseX = 76 + index * 48;
    const baseY = 696;
    const container = this.scene.add.container(baseX, baseY);

    const vfx = SPELL_VFX[spellId] ?? SPELL_VFX.arcane_missile;
    const borderColor = vfx.iconColor;
    const hexColor = `#${borderColor.toString(16).padStart(6, '0')}`;

    // Background with spell-colored border
    const bg = this.scene.add.rectangle(0, 0, 38, 38, 0x0a0a1a, 0.9)
      .setOrigin(0.5).setStrokeStyle(2, borderColor, 0.8);

    // Spell icon emoji
    const icon = this.scene.add.text(0, -2, vfx.icon, {
      fontSize: '18px',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Cooldown overlay
    const cooldownOverlay = this.scene.add.rectangle(0, -19, 38, 0, 0x000000, 0.65)
      .setOrigin(0.5, 0);

    // Level badge bottom-right
    const levelBadge = this.scene.add.text(15, 15, '1', {
      fontSize: '9px',
      color: hexColor,
      fontFamily: 'monospace',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(1, 1);

    container.add([bg, icon, cooldownOverlay, levelBadge]);
    return container;
  }
}
