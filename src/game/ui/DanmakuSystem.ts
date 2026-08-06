import { EventBus } from '../core/EventBus';
import {
  GameEvents,
  EnemyKillPayload,
  LevelUpPayload,
  SpellHitPayload,
} from '../types';

interface DanmakuItem {
  text: Phaser.GameObjects.Text;
  speed: number;
  timer: number;
}

export class DanmakuSystem {
  private scene: Phaser.Scene;
  private items: DanmakuItem[] = [];
  private killCount = 0;
  private static readonly MAX_ITEMS = 15;
  private static readonly AREA_X_MIN = 880;
  private static readonly AREA_X_MAX = 1260;
  private static readonly AREA_Y_MIN = 80;
  private static readonly AREA_Y_MAX = 600;

  constructor(scene: Phaser.Scene, eventBus: EventBus) {
    this.scene = scene;

    eventBus.on(GameEvents.ENEMY_KILL, this.onEnemyKill, this);
    eventBus.on(GameEvents.LEVEL_UP, this.onLevelUp, this);
    eventBus.on(GameEvents.SPELL_HIT, this.onSpellHit, this);
    eventBus.on(GameEvents.UPGRADE_CHOSEN, this.onUpgrade, this);
    eventBus.on(GameEvents.RELIC_ACQUIRED, this.onRelic, this);
  }

  private onEnemyKill(payload: EnemyKillPayload): void {
    this.killCount++;
    if (this.killCount % 10 === 0) {
      this.push(`☠ 已击杀 ${this.killCount} 只怪物`, '#cc8866');
    }
    // Random flavor text on kills
    if (Math.random() < 0.08) {
      const lines = ['干得漂亮!', '一击必杀!', '太强了!', '无人能挡!', '魔法之力!'];
      this.push(lines[Math.floor(Math.random() * lines.length)], '#ffdd88');
    }
  }

  private onLevelUp(payload: LevelUpPayload): void {
    this.push(`⬆ 升级! Lv${payload.newLevel}`, '#44ffcc');
  }

  private onSpellHit(payload: SpellHitPayload): void {
    if (payload.isCrit && Math.random() < 0.3) {
      this.push(`💥 暴击! ${payload.damage} 伤害!`, '#ffdd44');
    }
  }

  private onUpgrade(): void {
    this.push('✨ 获得新强化!', '#88ccff');
  }

  private onRelic(): void {
    this.push('🏆 获得遗物!', '#ffaa44');
  }

  push(message: string, color = '#ffffff'): void {
    if (this.items.length >= DanmakuSystem.MAX_ITEMS) return;

    const x = DanmakuSystem.AREA_X_MAX;
    const y = DanmakuSystem.AREA_Y_MIN +
      Math.random() * (DanmakuSystem.AREA_Y_MAX - DanmakuSystem.AREA_Y_MIN);

    const text = this.scene.add.text(x, y, message, {
      fontSize: '13px',
      color,
      fontFamily: 'monospace',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(95)
      .setAlpha(0.55);

    const speed = 0.06 + Math.random() * 0.03;
    const duration = 4000 + Math.random() * 1500;

    this.items.push({ text, speed, timer: duration });
  }

  update(delta: number): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];
      item.timer -= delta;
      item.text.x -= item.speed * delta;

      // Fade out in last 800ms
      if (item.timer < 800) {
        item.text.setAlpha((item.timer / 800) * 0.55);
      }

      if (item.timer <= 0 || item.text.x < DanmakuSystem.AREA_X_MIN - 200) {
        item.text.destroy();
        this.items.splice(i, 1);
      }
    }
  }

  destroy(): void {
    for (const item of this.items) item.text.destroy();
    this.items = [];
  }
}
