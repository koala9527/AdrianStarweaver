import { RunResultData } from '../types';

export class ResultScene extends Phaser.Scene {
  private selectedIndex = 0;
  private buttons: Phaser.GameObjects.Text[] = [];
  private highlight!: Phaser.GameObjects.Rectangle;
  private particles: { obj: Phaser.GameObjects.Arc; vx: number; vy: number }[] = [];

  constructor() {
    super({ key: 'result' });
  }

  create(data: RunResultData): void {
    const cx = this.cameras.main.centerX;
    const cy = this.cameras.main.centerY;
    this.selectedIndex = 0;
    this.buttons = [];
    this.particles = [];

    // Background
    this.add.rectangle(cx, cy, 1280, 720, 0x080812);

    // Ambient particles
    for (let i = 0; i < 20; i++) {
      const x = Math.random() * 1280;
      const y = Math.random() * 720;
      const r = 1 + Math.random() * 2;
      const color = data.survived ? 0x44ccaa : 0xcc4444;
      const dot = this.add.circle(x, y, r, color, 0.1 + Math.random() * 0.15);
      this.particles.push({
        obj: dot,
        vx: (Math.random() - 0.5) * 0.3,
        vy: -0.1 - Math.random() * 0.2,
      });
    }

    // Result title
    const title = data.survived ? '胜 利' : '阵 亡';
    const titleColor = data.survived ? '#44ffaa' : '#ff5555';
    const subtitleColor = data.survived ? '#88ddbb' : '#cc8888';

    this.add.text(cx, cy - 160, title, {
      fontSize: '56px',
      color: titleColor,
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    const subtitle = data.survived ? 'VICTORY' : 'DEFEATED';
    this.add.text(cx, cy - 100, subtitle, {
      fontSize: '14px',
      color: subtitleColor,
      fontFamily: 'monospace',
      letterSpacing: 8,
    }).setOrigin(0.5);

    // Divider
    this.add.rectangle(cx, cy - 70, 400, 1, 0x334466, 0.4);

    // Stats
    const minutes = Math.floor((data.time || 0) / 60);
    const seconds = Math.floor((data.time || 0) % 60);
    const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;

    const stats = [
      { label: '存活时间', value: timeStr },
      { label: '等级', value: `${data.level || 1}` },
      { label: '击杀数', value: `${data.kills || 0}` },
    ];

    stats.forEach((stat, i) => {
      const y = cy - 40 + i * 42;
      this.add.text(cx - 100, y, stat.label, {
        fontSize: '16px',
        color: '#667799',
        fontFamily: 'monospace',
      }).setOrigin(0, 0.5);

      this.add.text(cx + 100, y, stat.value, {
        fontSize: '20px',
        color: '#ddddff',
        fontFamily: 'monospace',
        fontStyle: 'bold',
      }).setOrigin(1, 0.5);
    });

    // Divider
    this.add.rectangle(cx, cy + 100, 400, 1, 0x334466, 0.4);

    // Buttons
    const btnConfigs = [
      { label: '再来一局', action: () => this.scene.start('run') },
      { label: '返回主菜单', action: () => this.scene.start('menu') },
    ];

    this.highlight = this.add.rectangle(cx, 0, 240, 40, 0x4466aa, 0.15)
      .setStrokeStyle(1, 0x4488cc, 0.4);

    for (let i = 0; i < btnConfigs.length; i++) {
      const y = cy + 140 + i * 50;
      const btn = this.add.text(cx, y, btnConfigs[i].label, {
        fontSize: '22px',
        color: '#aabbdd',
        fontFamily: 'monospace',
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });

      // Touch/click support
      btn.on('pointerdown', () => {
        this.selectedIndex = i;
        this.updateSelection();
        this.confirmSelection(btnConfigs);
      });

      this.buttons.push(btn);
    }

    this.updateSelection();

    // Hint
    this.add.text(cx, cy + 280, 'W / S 选择    Space 确认', {
      fontSize: '11px',
      color: '#445566',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Keyboard
    const kb = this.input.keyboard!;
    const keyW = kb.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    const keyS = kb.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    const keySpace = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    const keyEnter = kb.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);

    keyW.on('down', () => {
      this.selectedIndex = (this.selectedIndex - 1 + this.buttons.length) % this.buttons.length;
      this.updateSelection();
    });
    keyS.on('down', () => {
      this.selectedIndex = (this.selectedIndex + 1) % this.buttons.length;
      this.updateSelection();
    });
    keySpace.on('down', () => this.confirmSelection(btnConfigs));
    keyEnter.on('down', () => this.confirmSelection(btnConfigs));
  }

  private updateSelection(): void {
    for (let i = 0; i < this.buttons.length; i++) {
      if (i === this.selectedIndex) {
        this.buttons[i].setColor('#ffffff');
        this.highlight.y = this.buttons[i].y;
        this.highlight.setVisible(true);
        this.tweens.add({
          targets: this.buttons[i],
          scaleX: 1.06,
          scaleY: 1.06,
          duration: 100,
          ease: 'Quad.easeOut',
        });
      } else {
        this.buttons[i].setColor('#667799');
        this.tweens.add({
          targets: this.buttons[i],
          scaleX: 1,
          scaleY: 1,
          duration: 100,
        });
      }
    }
  }

  private confirmSelection(configs: { action: () => void }[]): void {
    const btn = this.buttons[this.selectedIndex];
    this.tweens.add({
      targets: btn,
      scaleX: 1.3,
      scaleY: 1.3,
      duration: 100,
      yoyo: true,
      onComplete: () => configs[this.selectedIndex].action(),
    });
  }

  update(): void {
    for (const p of this.particles) {
      p.obj.x += p.vx;
      p.obj.y += p.vy;
      if (p.obj.y < 0) { p.obj.y = 720; p.obj.x = Math.random() * 1280; }
      if (p.obj.x < 0) p.obj.x = 1280;
      if (p.obj.x > 1280) p.obj.x = 0;
    }
  }
}
