import { Quest } from '../systems/QuestSystem';

export class QuestBanner extends Phaser.GameObjects.Container {
  private bannerBg!: Phaser.GameObjects.Rectangle;
  private iconText!: Phaser.GameObjects.Text;
  private nameText!: Phaser.GameObjects.Text;
  private descText!: Phaser.GameObjects.Text;
  private progressBg!: Phaser.GameObjects.Rectangle;
  private progressFill!: Phaser.GameObjects.Rectangle;
  private progressText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;

  private currentProgress = 0;
  private currentTarget = 1;
  private displayProgress = 0;
  private questActive = false;
  private hideTimer = 0;

  private static readonly BAR_W = 260;
  private static readonly BAR_H = 6;

  constructor(scene: Phaser.Scene) {
    super(scene, 640, -60);
    scene.add.existing(this);
    this.setScrollFactor(0);
    this.setDepth(180);

    // Banner background
    this.bannerBg = scene.add.rectangle(0, 0, 360, 56, 0x0a0a1a, 0.85)
      .setOrigin(0.5).setStrokeStyle(1, 0x334466, 0.5);
    this.add(this.bannerBg);

    // Accent line top
    const accent = scene.add.rectangle(0, -28, 360, 2, 0xffcc44, 0.6).setOrigin(0.5, 0);
    this.add(accent);

    // Icon
    this.iconText = scene.add.text(-160, -10, '', {
      fontSize: '20px',
      fontFamily: 'monospace',
    }).setOrigin(0.5);
    this.add(this.iconText);

    // Quest name
    this.nameText = scene.add.text(-130, -16, '', {
      fontSize: '13px',
      color: '#ffdd55',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0, 0);
    this.add(this.nameText);

    // Description
    this.descText = scene.add.text(-130, 2, '', {
      fontSize: '10px',
      color: '#8899aa',
      fontFamily: 'monospace',
    }).setOrigin(0, 0);
    this.add(this.descText);

    // Progress bar
    this.progressBg = scene.add.rectangle(-130, 18, QuestBanner.BAR_W, QuestBanner.BAR_H, 0x1a1a2a)
      .setOrigin(0, 0.5);
    this.progressFill = scene.add.rectangle(-130, 18, 0, QuestBanner.BAR_H, 0xffcc44)
      .setOrigin(0, 0.5);
    this.add([this.progressBg, this.progressFill]);

    // Progress text
    this.progressText = scene.add.text(140, 18, '', {
      fontSize: '10px',
      color: '#aabbcc',
      fontFamily: 'monospace',
    }).setOrigin(1, 0.5);
    this.add(this.progressText);

    // Timer
    this.timerText = scene.add.text(165, -10, '', {
      fontSize: '11px',
      color: '#ff8844',
      fontFamily: 'monospace',
    }).setOrigin(1, 0.5);
    this.add(this.timerText);

    // Status text (for complete/failed)
    this.statusText = scene.add.text(0, 0, '', {
      fontSize: '18px',
      color: '#44ff88',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5).setVisible(false);
    this.add(this.statusText);
  }

  showQuest(quest: Quest): void {
    this.questActive = true;
    this.hideTimer = 0;
    this.currentProgress = 0;
    this.currentTarget = quest.target;
    this.displayProgress = 0;

    this.iconText.setText(quest.icon);
    this.nameText.setText(quest.name);
    this.descText.setText(quest.description);
    this.progressText.setText(`0/${quest.target}`);
    this.progressFill.width = 0;
    this.timerText.setText('');
    this.statusText.setVisible(false);
    this.bannerBg.setFillStyle(0x0a0a1a, 0.85);

    // Show all quest elements
    this.iconText.setVisible(true);
    this.nameText.setVisible(true);
    this.descText.setVisible(true);
    this.progressBg.setVisible(true);
    this.progressFill.setVisible(true);
    this.progressText.setVisible(true);
    this.timerText.setVisible(true);

    // Slide in
    this.scene.tweens.add({
      targets: this,
      y: 36,
      duration: 400,
      ease: 'Back.easeOut',
    });
  }

  updateProgress(progress: number, target: number): void {
    this.currentProgress = progress;
    this.currentTarget = target;
    this.progressText.setText(`${progress}/${target}`);
  }

  updateTimer(remaining: number): void {
    if (remaining > 0) {
      const s = Math.ceil(remaining);
      this.timerText.setText(`${s}s`);
      if (remaining < 10) {
        this.timerText.setColor('#ff4444');
      } else {
        this.timerText.setColor('#ff8844');
      }
    } else {
      this.timerText.setText('');
    }
  }

  showComplete(): void {
    this.questActive = false;

    // Flash green
    this.bannerBg.setFillStyle(0x113322, 0.9);
    this.statusText.setText('✦ 任务完成！').setColor('#44ff88').setVisible(true);

    // Hide quest details
    this.iconText.setVisible(false);
    this.nameText.setVisible(false);
    this.descText.setVisible(false);
    this.progressBg.setVisible(false);
    this.progressFill.setVisible(false);
    this.progressText.setVisible(false);
    this.timerText.setVisible(false);

    this.statusText.setScale(0.5).setAlpha(0);
    this.scene.tweens.add({
      targets: this.statusText,
      scaleX: 1.1,
      scaleY: 1.1,
      alpha: 1,
      duration: 300,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.scene.tweens.add({
          targets: this.statusText,
          scaleX: 1,
          scaleY: 1,
          duration: 100,
        });
      },
    });

    this.hideTimer = 2500;
  }

  showFailed(): void {
    this.questActive = false;

    this.bannerBg.setFillStyle(0x331111, 0.9);
    this.statusText.setText('✗ 任务失败').setColor('#ff5555').setVisible(true);

    this.iconText.setVisible(false);
    this.nameText.setVisible(false);
    this.descText.setVisible(false);
    this.progressBg.setVisible(false);
    this.progressFill.setVisible(false);
    this.progressText.setVisible(false);
    this.timerText.setVisible(false);

    this.statusText.setScale(0.5).setAlpha(0);
    this.scene.tweens.add({
      targets: this.statusText,
      scaleX: 1,
      scaleY: 1,
      alpha: 1,
      duration: 300,
    });

    this.hideTimer = 2000;
  }

  update(): void {
    // Lerp progress bar
    const targetW = this.currentTarget > 0
      ? QuestBanner.BAR_W * Math.min(1, this.currentProgress / this.currentTarget)
      : 0;
    this.displayProgress += (targetW - this.displayProgress) * 0.15;
    this.progressFill.width = this.displayProgress;

    // Auto-hide after complete/failed
    if (this.hideTimer > 0) {
      this.hideTimer -= 16.67;
      if (this.hideTimer <= 0) {
        this.slideOut();
      }
    }
  }

  private slideOut(): void {
    this.scene.tweens.add({
      targets: this,
      y: -60,
      duration: 300,
      ease: 'Quad.easeIn',
    });
  }
}
