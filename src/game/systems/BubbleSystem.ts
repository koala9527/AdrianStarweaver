import { Enemy } from '../entities/Enemy';
import { Player } from '../entities/Player';
import { EventBus } from '../core/EventBus';
import { GameTimer } from '../core/GameTimer';
import { MapCollision } from '../core/MapCollision';
import { BubbleTextGenerator, BubbleSituation } from '../services/BubbleTextGenerator';
import { GameEvents, EnemyKillPayload, EnemyDamagedPayload, PlayerDamagedPayload, LevelUpPayload } from '../types';
import { GAME_CONFIG } from '../config/gameConfig';

interface ActiveBubble {
  text: Phaser.GameObjects.Text;
  bg: Phaser.GameObjects.Rectangle;
  target: Phaser.GameObjects.Sprite;
  timer: number;
  offsetY: number;
  isPlayer: boolean;
}

export class BubbleSystem {
  private scene: Phaser.Scene;
  private generator: BubbleTextGenerator;
  private gameTimer: GameTimer;
  private player: Player | null = null;
  private activeBubbles: ActiveBubble[] = [];
  private enemyBubbleCount = new Map<Enemy, number>();
  private lastBubbleTime = 0;
  private playerBubbleTimer = 0;
  private lastPlayerHp = 0;
  private killsSinceLastBubble = 0;
  private mapCollision: MapCollision | null = null;
  private wasInSpecialZone = false;

  private static readonly BUBBLE_DURATION = 3200;
  private static readonly MIN_INTERVAL = 600;
  private static readonly MAX_ACTIVE = 6;
  private static readonly PLAYER_BUBBLE_COOLDOWN = 5000;

  private static readonly ZONE_LINES = [
    '💎这里残留着星辰之力的痕迹...',
    '🔮符文锁链在共鸣，这片区域不简单',
    '✨星核碎片...就在附近',
    '💫紫藤的侵蚀在这里被某种力量阻挡了',
    '🌟能感受到织法者留下的结界',
    '💠水晶的光芒...像是在指引方向',
  ];

  // Player AI lines — will be replaced by DeepSeek if available
  private playerLines: Record<string, string[]> = {
    start: ['✨星织之力，觉醒吧', '💪右臂的锁链在灼烧...出发', '🔮净化这片大陆！', '⚔️守夜人，再次踏上征途'],
    levelup: ['💫星辰之力在涌入！', '🔥锁链的束缚...松动了一些', '✨织法的感觉回来了！', '💪离净化更近一步'],
    lowHp: ['😰锁链在崩裂...撑住！', '💔黑暗魔法在反噬...', '😣不能在这里倒下...', '😤莫甘...我不会输给你'],
    killStreak: ['😎这就是星织之力！', '🔥紫藤的走狗，统统净化！', '💥挡在路上的，全部清除', '✨为了艾瑟拉！'],
    hurt: ['😖符文在灼烧...！', '😣黑暗在侵蚀...', '⚠️右臂失控了一瞬...', '😠区区紫藤怪物...'],
    idle: ['🤔紫藤的气息变弱了...', '😌暂时安全...保持警惕', '👀莫甘到底在哪...', '💭星核石板的碎片...'],
    newSpell: ['🌟新的织法术式！', '😄星辰赐予的力量！', '📖织法者的传承...', '✨这股力量，能对抗黑暗'],
    victory: ['🎉紫藤被净化了！', '🏆守夜人的使命完成！', '😆艾瑟拉...得救了', '✌️星织之力，永不熄灭'],
    danger: ['😱紫藤怪物太多了！', '🆘被包围了...锁链快撑不住！', '💨必须突围！', '😤全力释放星织之力！'],
  };
  private aiPlayerLinesLoaded = false;

  constructor(
    scene: Phaser.Scene,
    eventBus: EventBus,
    gameTimer: GameTimer,
    generator: BubbleTextGenerator,
    player: Player,
  ) {
    this.scene = scene;
    this.gameTimer = gameTimer;
    this.generator = generator;
    this.player = player;
    this.lastPlayerHp = player.playerState.hp;

    eventBus.on(GameEvents.ENEMY_DAMAGED, this.onEnemyDamaged, this);
    eventBus.on(GameEvents.ENEMY_KILL, this.onEnemyKill, this);
    eventBus.on(GameEvents.PLAYER_DAMAGED, this.onPlayerDamaged, this);
    eventBus.on(GameEvents.LEVEL_UP, this.onLevelUp, this);
    eventBus.on(GameEvents.UPGRADE_CHOSEN, this.onUpgradeChosen, this);

    // Player start bubble
    this.showPlayerBubble('start');

    // Load AI player lines
    this.loadAiPlayerLines();
  }

  private async loadAiPlayerLines(): Promise<void> {
    const cfg = GAME_CONFIG.ai;
    if (!cfg.enabled || this.aiPlayerLinesLoaded) return;

    try {
      const resp = await fetch(cfg.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation: 'player_lines' }),
      });

      if (!resp.ok) return;
      const data = await resp.json();
      const content: string = data.content ?? '';
      const match = content.match(/\{[\s\S]*\}/);
      if (!match) return;

      const parsed = JSON.parse(match[0]);
      for (const key of Object.keys(this.playerLines)) {
        if (Array.isArray(parsed[key]) && parsed[key].length > 0) {
          this.playerLines[key] = [
            ...this.playerLines[key],
            ...parsed[key].filter((s: unknown) => typeof s === 'string' && s.length > 0),
          ];
        }
      }
      this.aiPlayerLinesLoaded = true;
    } catch {
      // Fallback lines already loaded
    }
  }

  setPlayer(player: Player): void {
    this.player = player;
    this.lastPlayerHp = player.playerState.hp;
  }

  setMapCollision(mc: MapCollision): void {
    this.mapCollision = mc;
  }

  onEnemySpawned(enemy: Enemy): void {
    this.enemyBubbleCount.set(enemy, 0);
    this.tryShowEnemyBubble(enemy, 'spawn', 0.5);
  }

  private onEnemyDamaged(payload: EnemyDamagedPayload): void {
    const enemy = payload.enemy as unknown as Enemy;
    if (!enemy?.active) return;
    this.tryShowEnemyBubble(enemy, 'hurt', 0.15);
  }

  private onEnemyKill(payload: EnemyKillPayload): void {
    const enemy = payload.enemy as unknown as Enemy;
    if (!enemy) return;
    this.showEnemyBubble(enemy, 'death');
    this.enemyBubbleCount.delete(enemy);

    // Player kill streak bubbles
    this.killsSinceLastBubble++;
    if (this.killsSinceLastBubble >= 5) {
      this.killsSinceLastBubble = 0;
      this.showPlayerBubble('killStreak');
    }
  }

  private onPlayerDamaged(_payload: PlayerDamagedPayload): void {
    if (!this.player) return;
    this.showPlayerBubble('hurt');

    // Low HP warning
    const hpRatio = this.player.playerState.hp / this.player.playerState.maxHp;
    if (hpRatio < 0.3) {
      this.showPlayerBubble('lowHp');
    }
  }

  private onLevelUp(_payload: LevelUpPayload): void {
    this.showPlayerBubble('levelup');
  }

  private onUpgradeChosen(): void {
    if (Math.random() < 0.5) {
      this.showPlayerBubble('newSpell');
    }
  }

  private showPlayerBubble(situation: string): void {
    if (!this.player) return;
    if (this.playerBubbleTimer > 0) return;

    const lines = this.playerLines[situation] ?? this.playerLines.idle;
    const line = lines[Math.floor(Math.random() * lines.length)];

    this.spawnBubble(this.player, line, true, -20, 0x4488ff);
    this.playerBubbleTimer = BubbleSystem.PLAYER_BUBBLE_COOLDOWN;
  }

  private tryShowEnemyBubble(enemy: Enemy, situation: BubbleSituation, chance: number): void {
    if (this.activeBubbles.length >= BubbleSystem.MAX_ACTIVE) return;

    const now = Date.now();
    if (now - this.lastBubbleTime < BubbleSystem.MIN_INTERVAL) return;

    const count = this.enemyBubbleCount.get(enemy) ?? 0;
    const roll = count === 0 ? 1 : Math.random();
    if (roll > chance) return;

    this.showEnemyBubble(enemy, situation);
  }

  private showEnemyBubble(enemy: Enemy, situation: BubbleSituation): void {
    const enemyType = enemy.config?.id ?? 'slime';
    const line = this.generator.getLine(enemyType, situation);
    this.spawnBubble(enemy, line, false, -24, 0x444444);
  }

  private spawnBubble(
    target: Phaser.GameObjects.Sprite,
    line: string,
    isPlayer: boolean,
    offsetY: number,
    borderColor: number,
  ): void {
    const x = target.x;
    const y = target.y + offsetY;

    const textColor = isPlayer ? '#ddeeff' : '#eeeedd';
    const fontSize = isPlayer ? '12px' : '11px';
    const strokeColor = isPlayer ? '#2244aa' : '#333333';

    const textObj = this.scene.add.text(x, y - 12, line, {
      fontSize,
      color: textColor,
      fontFamily: 'monospace',
      fontStyle: isPlayer ? 'bold' : 'normal',
      stroke: '#000000',
      strokeThickness: 3,
      padding: { x: 2, y: 1 },
    }).setOrigin(0.5, 1).setDepth(151);

    // Rounded background panel
    const tw = textObj.width + 16;
    const th = textObj.height + 10;
    const bgGfx = this.scene.add.graphics().setDepth(150);
    bgGfx.fillStyle(isPlayer ? 0x1a2a50 : 0x1a1a1a, isPlayer ? 0.85 : 0.75);
    bgGfx.fillRoundedRect(x - tw / 2, y - 12 - th, tw, th, 6);
    bgGfx.lineStyle(1.5, isPlayer ? 0x4488cc : 0x666655, 0.6);
    bgGfx.strokeRoundedRect(x - tw / 2, y - 12 - th, tw, th, 6);
    // Triangle pointer
    bgGfx.fillStyle(isPlayer ? 0x1a2a50 : 0x1a1a1a, isPlayer ? 0.85 : 0.75);
    bgGfx.fillTriangle(x - 4, y - 12, x + 4, y - 12, x, y - 6);

    // Pop-in animation
    textObj.setAlpha(0).setScale(0.5);
    bgGfx.setAlpha(0).setScale(0.5);
    const targetY = y - 20;
    this.scene.tweens.add({
      targets: [textObj, bgGfx],
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      duration: 220,
      ease: 'Back.easeOut',
    });
    this.scene.tweens.add({
      targets: textObj,
      y: targetY,
      duration: 220,
      ease: 'Back.easeOut',
    });

    this.activeBubbles.push({
      text: textObj,
      bg: bgGfx as unknown as Phaser.GameObjects.Rectangle,
      target,
      timer: BubbleSystem.BUBBLE_DURATION,
      offsetY,
      isPlayer,
    });
    this.lastBubbleTime = Date.now();

    if (!isPlayer) {
      const enemy = target as Enemy;
      const count = this.enemyBubbleCount.get(enemy) ?? 0;
      this.enemyBubbleCount.set(enemy, count + 1);
    }
  }

  update(delta: number): void {
    if (this.gameTimer.isPaused()) return;

    // Player bubble cooldown
    if (this.playerBubbleTimer > 0) {
      this.playerBubbleTimer -= delta;
    }

    // Player state-based bubbles
    this.checkPlayerState();

    // Random enemy bubbles
    this.tryRandomBubble();

    // Update active bubbles
    for (let i = this.activeBubbles.length - 1; i >= 0; i--) {
      const b = this.activeBubbles[i];
      b.timer -= delta;

      if (b.target.active) {
        b.text.x = b.target.x;
        b.text.y = b.target.y + b.offsetY;
        b.bg.x = b.target.x;
        b.bg.y = b.target.y + b.offsetY - 2;
      }

      if (b.timer <= 500) {
        b.text.setAlpha(b.timer / 500);
        b.bg.setAlpha(b.timer / 500);
      }

      if (b.timer <= 0 || (!b.isPlayer && !b.target.active)) {
        b.text.destroy();
        b.bg.destroy();
        this.activeBubbles.splice(i, 1);
      }
    }
  }

  private checkPlayerState(): void {
    if (!this.player) return;

    // Blue zone dialogue
    if (this.mapCollision) {
      const inZone = this.mapCollision.isInSpecialZone(this.player.x, this.player.y);
      if (inZone && !this.wasInSpecialZone) {
        const line = BubbleSystem.ZONE_LINES[Math.floor(Math.random() * BubbleSystem.ZONE_LINES.length)];
        this.playerBubbleTimer = 0; // Override cooldown for zone entry
        this.spawnBubble(this.player, line, true, -20, 0x4488ff);
        this.playerBubbleTimer = BubbleSystem.PLAYER_BUBBLE_COOLDOWN;
      }
      this.wasInSpecialZone = inZone;
    }

    // Danger: many enemies nearby
    if (Math.random() < 0.001) {
      const enemies = this.scene.physics.overlapCirc(this.player.x, this.player.y, 150);
      if (enemies.length > 8) {
        this.showPlayerBubble('danger');
      } else if (enemies.length === 0) {
        this.showPlayerBubble('idle');
      }
    }
  }

  private tryRandomBubble(): void {
    if (this.activeBubbles.length >= BubbleSystem.MAX_ACTIVE) return;
    if (Math.random() > 0.002) return;

    const candidates: Enemy[] = [];
    for (const [enemy, count] of this.enemyBubbleCount) {
      if (enemy.active && count < 2) {
        candidates.push(enemy);
      }
    }
    if (candidates.length === 0) return;

    const enemy = candidates[Math.floor(Math.random() * candidates.length)];
    const situations: BubbleSituation[] = ['chase', 'idle', 'taunt'];
    const sit = situations[Math.floor(Math.random() * situations.length)];
    this.showEnemyBubble(enemy, sit);
  }

  destroy(): void {
    for (const b of this.activeBubbles) {
      b.text.destroy();
      b.bg.destroy();
    }
    this.activeBubbles = [];
    this.enemyBubbleCount.clear();
  }
}
