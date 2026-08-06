import { UpgradeCard, PlayerState } from '../types';
import { AiAdvisor, AiAdvice } from '../services/AiAdvisor';
import { VirtualJoystick } from './VirtualJoystick';

export class LevelUpPanel extends Phaser.GameObjects.Container {
  private overlay!: Phaser.GameObjects.Rectangle;
  private cards: Phaser.GameObjects.Container[] = [];
  private levelText!: Phaser.GameObjects.Text;
  private subtitleText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private inputLocked = false;
  private currentCards: UpgradeCard[] = [];
  private selectedIndex = 0;
  private statsContainer: Phaser.GameObjects.Container | null = null;

  onCardSelected: ((card: UpgradeCard) => void) | null = null;

  private static readonly CARD_W = 210;
  private static readonly CARD_H = 300;
  private static readonly CARD_GAP = 24;

  private keyA!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private keyW!: Phaser.Input.Keyboard.Key;
  private keySpace!: Phaser.Input.Keyboard.Key;
  private keyEnter!: Phaser.Input.Keyboard.Key;

  private pendingSelectIndex = -1;
  private pendingSelectTimer = 0;
  private static readonly SELECT_DELAY = 300;

  // Touch support
  private joystickRef: VirtualJoystick | null = null;
  private cardPositions: { x: number; y: number }[] = [];

  // AI advisor
  private aiAdvisor: AiAdvisor;
  private aiAdviceText!: Phaser.GameObjects.Text;
  private aiThinkingText!: Phaser.GameObjects.Text;
  private aiRecommendBadges: Phaser.GameObjects.Container[] = [];
  private playerStateRef: PlayerState | null = null;
  private gameElapsed = 0;

  // Highlight
  private highlightGlow!: Phaser.GameObjects.Rectangle;

  // Particle-like decorations
  private particles: { obj: Phaser.GameObjects.Arc; vx: number; vy: number }[] = [];

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0);
    scene.add.existing(this);
    this.setScrollFactor(0);
    this.setDepth(200);
    this.setVisible(false);

    this.aiAdvisor = new AiAdvisor();

    // Dark overlay with gradient feel (layered)
    this.overlay = scene.add.rectangle(640, 360, 1280, 720, 0x050510, 0.82)
      .setOrigin(0.5);
    this.add(this.overlay);

    // Decorative top/bottom lines
    const topLine = scene.add.rectangle(640, 80, 600, 1, 0x4466aa, 0.3).setOrigin(0.5);
    const botLine = scene.add.rectangle(640, 600, 600, 1, 0x4466aa, 0.3).setOrigin(0.5);
    this.add([topLine, botLine]);

    // Title
    this.levelText = scene.add.text(640, 95, '', {
      fontSize: '36px',
      color: '#ffdd55',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.add(this.levelText);

    this.subtitleText = scene.add.text(640, 130, '选择一张卡牌强化', {
      fontSize: '13px',
      color: '#8888aa',
      fontFamily: 'monospace',
    }).setOrigin(0.5);
    this.add(this.subtitleText);

    // Hint
    this.hintText = scene.add.text(640, 575, '◀ A    D ▶    W / Space 确认', {
      fontSize: '13px',
      color: '#555577',
      fontFamily: 'monospace',
    }).setOrigin(0.5);
    this.add(this.hintText);

    // AI advice area — 魔导师
    this.aiThinkingText = scene.add.text(640, 610, '🔮 魔导师思考中...', {
      fontSize: '12px',
      color: '#8866aa',
      fontFamily: 'monospace',
    }).setOrigin(0.5).setVisible(false);
    this.add(this.aiThinkingText);

    this.aiAdviceText = scene.add.text(640, 610, '', {
      fontSize: '13px',
      color: '#cc99ff',
      fontFamily: 'monospace',
      wordWrap: { width: 500 },
      align: 'center',
    }).setOrigin(0.5, 0).setVisible(false);
    this.add(this.aiAdviceText);

    // Highlight glow
    this.highlightGlow = scene.add.rectangle(0, 0,
      LevelUpPanel.CARD_W + 16, LevelUpPanel.CARD_H + 16, 0xffdd55, 0.08)
      .setOrigin(0.5)
      .setStrokeStyle(2, 0xffdd55, 0.5)
      .setVisible(false);
    this.add(this.highlightGlow);

    // Create ambient particles
    this.createAmbientParticles();

    const kb = scene.input.keyboard!;
    this.keyA = kb.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyD = kb.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.keyW = kb.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.keySpace = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.keyEnter = kb.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);

    // Scene-level pointer handler for reliable touch support
    scene.input.on('pointerdown', this.onScenePointerDown, this);
  }

  /** Set reference to joystick so we can disable it while panel is open */
  setJoystick(joystick: VirtualJoystick): void {
    this.joystickRef = joystick;
  }

  private onScenePointerDown(pointer: Phaser.Input.Pointer): void {
    if (!this.visible || this.inputLocked || this.cardPositions.length === 0) return;

    const W = LevelUpPanel.CARD_W;
    const H = LevelUpPanel.CARD_H;

    for (let i = 0; i < this.cardPositions.length; i++) {
      const pos = this.cardPositions[i];
      const halfW = W / 2;
      const halfH = H / 2;

      if (
        pointer.x >= pos.x - halfW && pointer.x <= pos.x + halfW &&
        pointer.y >= pos.y - halfH && pointer.y <= pos.y + halfH
      ) {
        this.selectedIndex = i;
        this.updateHighlight();
        this.confirmSelection();
        return;
      }
    }
  }

  private createAmbientParticles(): void {
    for (let i = 0; i < 20; i++) {
      const x = Math.random() * 1280;
      const y = Math.random() * 720;
      const r = 1 + Math.random() * 2;
      const dot = this.scene.add.circle(x, y, r, 0x4466cc, 0.15 + Math.random() * 0.15);
      this.add(dot);
      this.particles.push({
        obj: dot,
        vx: (Math.random() - 0.5) * 0.3,
        vy: -0.2 - Math.random() * 0.3,
      });
    }
  }

  setGameState(playerState: PlayerState, elapsed: number): void {
    this.playerStateRef = playerState;
    this.gameElapsed = elapsed;
  }

  private createStatsSidebar(): void {
    if (this.statsContainer) {
      this.statsContainer.destroy();
    }

    if (!this.playerStateRef) return;

    const ps = this.playerStateRef;
    this.statsContainer = this.scene.add.container(60, 160);

    // Panel background
    const panelBg = this.scene.add.rectangle(0, 0, 150, 340, 0x0a0a1a, 0.85)
      .setOrigin(0, 0).setStrokeStyle(1, 0x334466, 0.5);
    this.statsContainer.add(panelBg);

    // Title
    const title = this.scene.add.text(75, 10, '— 主角属性 —', {
      fontSize: '11px',
      color: '#8888aa',
      fontFamily: 'monospace',
    }).setOrigin(0.5, 0);
    this.statsContainer.add(title);

    const stats = [
      { label: '❤ 生命', value: `${Math.ceil(ps.hp)}/${ps.maxHp}`, color: '#44cc55' },
      { label: '🛡 护盾', value: `${ps.shield}`, color: '#4488ff' },
      { label: '⚔ 力量', value: `${ps.power.toFixed(2)}`, color: '#ffcc44' },
      { label: '💨 移速', value: `${Math.floor(ps.moveSpeed)}`, color: '#88ddff' },
      { label: '💥 暴击率', value: `${(ps.critChance * 100).toFixed(0)}%`, color: '#ff8844' },
      { label: '💥 暴击伤害', value: `${(ps.critDamage * 100).toFixed(0)}%`, color: '#ff8844' },
      { label: '⏱ 冷却率', value: `${ps.cooldownRate.toFixed(2)}`, color: '#aa88ff' },
      { label: '🧲 拾取', value: `${ps.pickupRadius}`, color: '#44ffcc' },
      { label: '💚 回复', value: `${ps.hpRegen.toFixed(1)}/s`, color: '#66cc66' },
      { label: '📖 等级', value: `${ps.level}`, color: '#ffdd55' },
    ];

    stats.forEach((s, i) => {
      const y = 32 + i * 28;
      this.scene.add.text(10, y, s.label, {
        fontSize: '10px',
        color: '#667788',
        fontFamily: 'monospace',
      }).setOrigin(0, 0);
      const valText = this.scene.add.text(140, y, s.value, {
        fontSize: '10px',
        color: s.color,
        fontFamily: 'monospace',
      }).setOrigin(1, 0);
      this.statsContainer!.add([
        this.statsContainer!.getAt(this.statsContainer!.length - 1) as Phaser.GameObjects.GameObject,
      ]);
      this.statsContainer!.add(valText);
    });

    // Rebuild: add all stat texts properly
    this.statsContainer.removeAll(false);
    this.statsContainer.add(panelBg);
    this.statsContainer.add(title);

    stats.forEach((s, i) => {
      const y = 32 + i * 28;
      const label = this.scene.add.text(10, y, s.label, {
        fontSize: '10px',
        color: '#667788',
        fontFamily: 'monospace',
      });
      const val = this.scene.add.text(140, y, s.value, {
        fontSize: '10px',
        color: s.color,
        fontFamily: 'monospace',
      }).setOrigin(1, 0);
      this.statsContainer!.add([label, val]);
    });

    // Spells section
    if (ps.spellSlots.length > 0) {
      const spellY = 32 + stats.length * 28 + 8;
      const spellTitle = this.scene.add.text(75, spellY, '— 法术栏 —', {
        fontSize: '10px',
        color: '#8888aa',
        fontFamily: 'monospace',
      }).setOrigin(0.5, 0);
      this.statsContainer.add(spellTitle);

      ps.spellSlots.forEach((slot, i) => {
        const sy = spellY + 18 + i * 16;
        const spellText = this.scene.add.text(10, sy, `${slot.spellId}`, {
          fontSize: '9px',
          color: '#aaaacc',
          fontFamily: 'monospace',
        });
        this.statsContainer!.add(spellText);
      });
    }

    this.add(this.statsContainer);
  }

  show(cards: UpgradeCard[], level: number): void {
    this.currentCards = cards;
    this.setVisible(true);
    this.inputLocked = true;
    this.selectedIndex = 0;
    this.levelText.setText(`⚡ Level ${level} ⚡`);

    // Disable joystick while panel is open
    if (this.joystickRef) {
      this.joystickRef.setInputEnabled(false);
    }

    // Clear old
    for (const card of this.cards) card.destroy();
    this.cards = [];
    this.cardPositions = [];
    for (const badge of this.aiRecommendBadges) badge.destroy();
    this.aiRecommendBadges = [];

    // Reset AI text
    this.aiAdviceText.setVisible(false);
    this.aiThinkingText.setVisible(true);

    const totalW = cards.length * LevelUpPanel.CARD_W + (cards.length - 1) * LevelUpPanel.CARD_GAP;
    const startX = 640 - totalW / 2 + LevelUpPanel.CARD_W / 2;

    for (let i = 0; i < cards.length; i++) {
      const cardContainer = this.createCard(cards[i]);
      const targetX = startX + i * (LevelUpPanel.CARD_W + LevelUpPanel.CARD_GAP);
      cardContainer.x = targetX;
      cardContainer.y = 360;

      // Store card center positions for touch hit-testing
      this.cardPositions.push({ x: targetX, y: 360 });

      // Entrance animation
      cardContainer.setScale(0.4);
      cardContainer.setAlpha(0);
      cardContainer.y = 620;

      this.scene.tweens.add({
        targets: cardContainer,
        y: 360,
        scaleX: 1,
        scaleY: 1,
        alpha: 1,
        duration: 400,
        delay: i * 100,
        ease: 'Back.easeOut',
        onComplete: () => {
          if (i === cards.length - 1) {
            this.inputLocked = false;
            this.updateHighlight();
          }
        },
      });

      this.cards.push(cardContainer);
      this.add(cardContainer);
    }

    this.bringToTop(this.hintText);
    this.bringToTop(this.aiThinkingText);
    this.bringToTop(this.aiAdviceText);

    // Player stats sidebar
    this.createStatsSidebar();

    // Request AI advice
    this.requestAiAdvice(cards);
  }

  private async requestAiAdvice(cards: UpgradeCard[]): Promise<void> {
    if (!this.playerStateRef) {
      this.aiThinkingText.setVisible(false);
      return;
    }

    const advice = await this.aiAdvisor.getAdvice(cards, this.playerStateRef, this.gameElapsed);
    // Panel might have been hidden while waiting
    if (!this.visible) return;

    this.aiThinkingText.setVisible(false);

    if (advice) {
      this.showAiAdvice(advice);
    } else {
      this.aiAdviceText.setText('🔮 魔导师暂时无法连接').setVisible(true);
    }
  }

  private showAiAdvice(advice: AiAdvice): void {
    this.aiAdviceText
      .setText(`🔮 魔导师: ${advice.reason}`)
      .setVisible(true);

    // Add recommend badge on the suggested card
    if (advice.recommendedIndex < this.cards.length) {
      const card = this.cards[advice.recommendedIndex];
      const badge = this.scene.add.container(card.x, card.y - LevelUpPanel.CARD_H / 2 - 14);

      const badgeBg = this.scene.add.rectangle(0, 0, 80, 18, 0x442266, 0.9)
        .setOrigin(0.5).setStrokeStyle(1, 0xaa66ff, 0.6);
      const badgeText = this.scene.add.text(0, 0, '✦ 魔导师', {
        fontSize: '10px',
        color: '#cc99ff',
        fontFamily: 'monospace',
      }).setOrigin(0.5);

      badge.add([badgeBg, badgeText]);
      this.add(badge);
      this.aiRecommendBadges.push(badge);

      // Pulse animation
      this.scene.tweens.add({
        targets: badge,
        scaleX: 1.1,
        scaleY: 1.1,
        duration: 600,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
  }

  private createCard(card: UpgradeCard): Phaser.GameObjects.Container {
    const container = this.scene.add.container(0, 0);
    const W = LevelUpPanel.CARD_W;
    const H = LevelUpPanel.CARD_H;

    // Rarity colors
    const isEpic = card.rarity === 'epic';
    const isRare = card.rarity === 'rare';
    const borderColor = isEpic ? 0xcc77ff : isRare ? 0x5599ff : 0x445566;
    const bgColor = isEpic ? 0x150d22 : isRare ? 0x0d1525 : 0x111118;
    const glowColor = isEpic ? 0x9944cc : isRare ? 0x3366aa : 0x334455;

    // Outer glow
    const glow = this.scene.add.rectangle(0, 0, W + 6, H + 6, glowColor, 0.15)
      .setOrigin(0.5);
    container.add(glow);

    // Card body
    const bg = this.scene.add.rectangle(0, 0, W, H, bgColor)
      .setOrigin(0.5)
      .setStrokeStyle(2, borderColor, 0.8);
    container.add(bg);

    // Top accent bar
    const accentBar = this.scene.add.rectangle(0, -H / 2 + 2, W - 2, 4, borderColor, 0.6)
      .setOrigin(0.5, 0);
    container.add(accentBar);

    // Rarity gem
    const rarityLabel = isEpic ? '◆ EPIC' : isRare ? '◇ RARE' : '○ COMMON';
    const rarityColor = isEpic ? '#cc88ff' : isRare ? '#77aaff' : '#667788';
    const rarityText = this.scene.add.text(0, -H / 2 + 16, rarityLabel, {
      fontSize: '9px',
      color: rarityColor,
      fontFamily: 'monospace',
      letterSpacing: 3,
    }).setOrigin(0.5);
    container.add(rarityText);

    // Card name
    const nameText = this.scene.add.text(0, -H / 2 + 50, card.name, {
      fontSize: '16px',
      color: '#eeeeff',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      wordWrap: { width: W - 30 },
      align: 'center',
    }).setOrigin(0.5);
    container.add(nameText);

    // Category icon area
    const catColor = card.category === 'spell_upgrade' ? 0x44ccff
      : card.category === 'global_stat' ? 0xffcc44
      : card.category === 'survival' ? 0xff6644
      : card.category === 'new_spell' ? 0x66ff88
      : 0x888888;

    // Diamond-shaped icon
    const iconG = this.scene.add.graphics();
    iconG.fillStyle(catColor, 0.8);
    iconG.fillPoints([
      new Phaser.Geom.Point(0, -18),
      new Phaser.Geom.Point(18, 0),
      new Phaser.Geom.Point(0, 18),
      new Phaser.Geom.Point(-18, 0),
    ], true);
    iconG.lineStyle(1, 0xffffff, 0.3);
    iconG.strokePoints([
      new Phaser.Geom.Point(0, -18),
      new Phaser.Geom.Point(18, 0),
      new Phaser.Geom.Point(0, 18),
      new Phaser.Geom.Point(-18, 0),
    ], true);
    iconG.x = 0;
    iconG.y = -H / 2 + 100;
    container.add(iconG);

    // Category label
    const catLabel = card.category === 'spell_upgrade' ? '法术'
      : card.category === 'global_stat' ? '属性'
      : card.category === 'survival' ? '生存'
      : card.category === 'new_spell' ? '新法术'
      : '其他';
    const catText = this.scene.add.text(0, -H / 2 + 100, catLabel, {
      fontSize: '10px',
      color: '#ffffff',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    container.add(catText);

    // Divider
    const divG = this.scene.add.graphics();
    divG.lineStyle(1, borderColor, 0.3);
    divG.lineBetween(-W / 2 + 20, -H / 2 + 130, W / 2 - 20, -H / 2 + 130);
    container.add(divG);

    // Description
    const descText = this.scene.add.text(0, -H / 2 + 145, card.description, {
      fontSize: '12px',
      color: '#9999bb',
      fontFamily: 'monospace',
      wordWrap: { width: W - 32 },
      align: 'center',
      lineSpacing: 5,
    }).setOrigin(0.5, 0);
    container.add(descText);

    // Tags at bottom
    if (card.tags && card.tags.length > 0) {
      const visibleTags = card.tags.filter(t => !t.startsWith('spell:')).slice(0, 3);
      if (visibleTags.length > 0) {
        const tagStr = visibleTags.map(t => `#${t}`).join('  ');
        const tagText = this.scene.add.text(0, H / 2 - 24, tagStr, {
          fontSize: '9px',
          color: '#445566',
          fontFamily: 'monospace',
        }).setOrigin(0.5);
        container.add(tagText);
      }
    }

    return container;
  }

  private updateHighlight(): void {
    if (this.cards.length === 0) return;

    const target = this.cards[this.selectedIndex];
    this.highlightGlow.setVisible(true);

    // Smooth move highlight
    this.scene.tweens.add({
      targets: this.highlightGlow,
      x: target.x,
      y: target.y,
      duration: 100,
      ease: 'Quad.easeOut',
    });

    for (let i = 0; i < this.cards.length; i++) {
      const isSelected = i === this.selectedIndex;
      this.scene.tweens.add({
        targets: this.cards[i],
        scaleX: isSelected ? 1.06 : 0.92,
        scaleY: isSelected ? 1.06 : 0.92,
        alpha: isSelected ? 1 : 0.5,
        duration: 150,
        ease: 'Quad.easeOut',
      });
    }
  }

  private confirmSelection(): void {
    this.selectCard(this.selectedIndex);
  }

  private selectCard(index: number): void {
    if (this.inputLocked || index >= this.currentCards.length) return;
    this.inputLocked = true;
    this.highlightGlow.setVisible(false);
    this.aiAdvisor.abort();

    const chosen = this.cards[index];

    // Flash effect on chosen
    this.scene.tweens.add({
      targets: chosen,
      scaleX: 1.25,
      scaleY: 1.25,
      alpha: 1,
      duration: 200,
      ease: 'Quad.easeOut',
    });

    // Fade out others
    for (let i = 0; i < this.cards.length; i++) {
      if (i !== index) {
        this.scene.tweens.add({
          targets: this.cards[i],
          alpha: 0,
          scaleX: 0.7,
          scaleY: 0.7,
          y: this.cards[i].y + 40,
          duration: 200,
        });
      }
    }

    // Hide AI badges
    for (const badge of this.aiRecommendBadges) {
      this.scene.tweens.add({ targets: badge, alpha: 0, duration: 150 });
    }

    this.pendingSelectIndex = index;
    this.pendingSelectTimer = LevelUpPanel.SELECT_DELAY;
  }

  update(): void {
    // Animate ambient particles
    for (const p of this.particles) {
      p.obj.x += p.vx;
      p.obj.y += p.vy;
      if (p.obj.y < 0) { p.obj.y = 720; p.obj.x = Math.random() * 1280; }
      if (p.obj.x < 0) p.obj.x = 1280;
      if (p.obj.x > 1280) p.obj.x = 0;
    }

    // Handle pending card selection
    if (this.pendingSelectIndex >= 0) {
      this.pendingSelectTimer -= 16.67;
      if (this.pendingSelectTimer <= 0) {
        const index = this.pendingSelectIndex;
        this.pendingSelectIndex = -1;
        this.setVisible(false);
        this.highlightGlow.setVisible(false);
        this.cardPositions = [];

        // Re-enable joystick
        if (this.joystickRef) {
          this.joystickRef.setInputEnabled(true);
        }

        if (this.onCardSelected) {
          this.onCardSelected(this.currentCards[index]);
        }
      }
      return;
    }

    if (!this.visible || this.inputLocked) return;

    // WASD navigation
    if (Phaser.Input.Keyboard.JustDown(this.keyA)) {
      this.selectedIndex = (this.selectedIndex - 1 + this.currentCards.length) % this.currentCards.length;
      this.updateHighlight();
    } else if (Phaser.Input.Keyboard.JustDown(this.keyD)) {
      this.selectedIndex = (this.selectedIndex + 1) % this.currentCards.length;
      this.updateHighlight();
    }

    // Confirm
    if (Phaser.Input.Keyboard.JustDown(this.keyW)
      || Phaser.Input.Keyboard.JustDown(this.keySpace)
      || Phaser.Input.Keyboard.JustDown(this.keyEnter)) {
      this.confirmSelection();
    }
  }

  hide(): void {
    this.setVisible(false);
    this.highlightGlow.setVisible(false);
    this.cardPositions = [];
    this.aiAdvisor.abort();

    // Re-enable joystick
    if (this.joystickRef) {
      this.joystickRef.setInputEnabled(true);
    }
  }
}
