export class BootScene extends Phaser.Scene {
  private loadingBar!: Phaser.GameObjects.Graphics;
  private loadingText!: Phaser.GameObjects.Text;
  private progressText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'boot' });
  }

  preload(): void {
    this.createLoadingScreen();

    // Loading progress events
    this.load.on('progress', (value: number) => {
      this.loadingBar.clear();
      this.loadingBar.fillStyle(0x4488ff, 1);
      this.loadingBar.fillRect(340, 370, 600 * value, 20);
      this.progressText.setText(`${Math.floor(value * 100)}%`);
    });

    this.load.on('complete', () => {
      this.loadingBar.destroy();
      this.loadingText.destroy();
      this.progressText.destroy();
    });

    // Audio
    this.load.audio('bgm', 'audio/bgm.mp3');
    this.load.audio('hit', 'audio/hit.wav');
    this.load.audio('sfx_arcane_missile', 'audio/arcane_missile.wav');
    this.load.audio('sfx_fire_nova', 'audio/fire_nova.wav');
    this.load.audio('sfx_ice_shard', 'audio/ice_shard.wav');
    this.load.audio('sfx_lightning_chain', 'audio/lightning_chain.wav');
    this.load.audio('sfx_void_field', 'audio/void_field.wav');
    this.load.audio('sfx_arcane_familiar', 'audio/arcane_familiar.wav');

    // SVG sprites — player scaled to ~60px
    this.load.svg('player', 'sprites/player.svg', { width: 60, height: 60 });
    this.load.svg('slime', 'sprites/slime.svg', { width: 40, height: 40 });
    this.load.svg('skeleton', 'sprites/skeleton.svg', { width: 40, height: 48 });
    this.load.svg('wraith', 'sprites/wraith.svg', { width: 40, height: 48 });
    this.load.svg('boss', 'sprites/boss.svg', { width: 64, height: 64 });
    this.load.svg('vine_spirit', 'sprites/vine_spirit.svg', { width: 40, height: 48 });
    this.load.svg('crystal_wisp', 'sprites/crystal_wisp.svg', { width: 36, height: 36 });
    this.load.svg('projectile', 'sprites/projectile.svg', { width: 16, height: 16 });
    this.load.svg('xp_orb_small', 'sprites/xp_orb_small.svg', { width: 12, height: 12 });
    this.load.svg('xp_orb_large', 'sprites/xp_orb_large.svg', { width: 18, height: 18 });
    this.load.svg('health_orb', 'sprites/health_orb.svg', { width: 14, height: 14 });

    // Menu background
    this.load.image('menu_bg', 'map/index.jpg');

    // Map tiles (4x4 grid, each 1024x1024)
    for (let row = 1; row <= 4; row++) {
      for (let col = 1; col <= 4; col++) {
        this.load.image(`map_${row}_${col}`, `map/tiles/${row}-${col}.jpg`);
        this.load.image(`mask_${row}_${col}`, `map/mask/${row}-${col}.jpg`);
      }
    }
  }

  private createLoadingScreen(): void {
    const cx = this.cameras.main.centerX;
    const cy = this.cameras.main.centerY;

    // Background
    this.add.rectangle(cx, cy, 1280, 720, 0x0a0a1a);

    // Title
    this.add.text(cx, cy - 100, '艾德里安·星织', {
      fontSize: '42px',
      color: '#eeeeff',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(cx, cy - 50, 'ADRIAN STARWEAVER', {
      fontSize: '12px',
      color: '#8899aa',
      fontFamily: 'monospace',
      letterSpacing: 3,
    }).setOrigin(0.5);

    // Loading text
    this.loadingText = this.add.text(cx, cy + 20, '加载中...', {
      fontSize: '16px',
      color: '#aabbcc',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Progress bar background
    this.add.rectangle(cx, cy + 80, 600, 20, 0x222233).setStrokeStyle(1, 0x334466);

    // Progress bar fill
    this.loadingBar = this.add.graphics();

    // Progress percentage
    this.progressText = this.add.text(cx, cy + 120, '0%', {
      fontSize: '14px',
      color: '#667788',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Animated dots
    let dotCount = 0;
    this.time.addEvent({
      delay: 500,
      callback: () => {
        dotCount = (dotCount + 1) % 4;
        this.loadingText.setText('加载中' + '.'.repeat(dotCount));
      },
      loop: true,
    });

    // Spinning loader icon
    const spinner = this.add.graphics();
    spinner.lineStyle(3, 0x4488ff, 1);
    spinner.arc(cx, cy - 150, 20, 0, Math.PI * 1.5, false);
    this.tweens.add({
      targets: spinner,
      angle: 360,
      duration: 1000,
      repeat: -1,
      ease: 'Linear',
    });
  }

  create(): void {
    this.scene.start('menu');
  }
}
