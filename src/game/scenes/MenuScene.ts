export class MenuScene extends Phaser.Scene {
  private selectedIndex = 0;
  private buttons: Phaser.GameObjects.Text[] = [];
  private highlight!: Phaser.GameObjects.Rectangle;
  private particles: { obj: Phaser.GameObjects.Arc; vx: number; vy: number }[] = [];

  constructor() {
    super({ key: 'menu' });
  }

  create(): void {
    const cx = this.cameras.main.centerX;
    const cy = this.cameras.main.centerY;
    this.selectedIndex = 0;
    this.buttons = [];
    this.particles = [];

    // Background image
    const bg = this.add.image(cx, cy, 'menu_bg');
    bg.setDisplaySize(1280, 720);

    // Ambient particles
    for (let i = 0; i < 30; i++) {
      const x = Math.random() * 1280;
      const y = Math.random() * 720;
      const r = 1 + Math.random() * 2;
      const colors = [0x4466cc, 0x44ccaa, 0x8844cc, 0xcc8844];
      const dot = this.add.circle(x, y, r, colors[Math.floor(Math.random() * 4)], 0.15 + Math.random() * 0.15);
      this.particles.push({
        obj: dot,
        vx: (Math.random() - 0.5) * 0.4,
        vy: -0.15 - Math.random() * 0.3,
      });
    }

    // Title glow
    this.add.rectangle(cx, cy - 120, 400, 60, 0x4466cc, 0.05);

    // Title
    this.add.text(cx, cy - 130, '艾德里安·星织', {
      fontSize: '48px',
      color: '#eeeeff',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(cx, cy - 70, 'A D R I A N   S T A R W E A V E R', {
      fontSize: '13px',
      color: '#aabbcc',
      fontFamily: 'monospace',
      letterSpacing: 4,
    }).setOrigin(0.5);

    // Divider
    this.add.rectangle(cx, cy - 40, 300, 1, 0x334466, 0.5);

    // Menu buttons
    const btnConfigs = [
      { label: '开始游戏', action: () => this.scene.start('run') },
    ];

    this.highlight = this.add.rectangle(cx, 0, 260, 44, 0x4466aa, 0.15)
      .setStrokeStyle(1, 0x4488cc, 0.4);

    for (let i = 0; i < btnConfigs.length; i++) {
      const y = cy + 20 + i * 56;
      const btn = this.add.text(cx, y, btnConfigs[i].label, {
        fontSize: '26px',
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
    this.add.text(cx, cy + 200, 'W / S 选择    Space 确认', {
      fontSize: '12px',
      color: '#8899aa',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.add.text(cx, 680, 'v0.1  M1 Prototype', {
      fontSize: '10px',
      color: '#778899',
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
          scaleX: 1.08,
          scaleY: 1.08,
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
