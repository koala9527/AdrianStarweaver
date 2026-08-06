import Phaser from 'phaser';
import { StoryNarration } from '../data/story';

/**
 * Narration Panel - Displays story text on the right side of the camera viewport
 * Text reveals progressively (typewriter style) while the player keeps playing
 */
export class NarrationPanel extends Phaser.GameObjects.Container {
  private background!: Phaser.GameObjects.Rectangle;
  private titleText!: Phaser.GameObjects.Text;
  private textObject!: Phaser.GameObjects.Text;
  private isVisible = false;
  private hideTimer?: Phaser.Time.TimerEvent;

  // Typewriter state
  private fullText = '';
  private revealedChars = 0;
  private revealTimer = 0;
  private static readonly CHARS_PER_SECOND = 12;

  private static readonly PANEL_WIDTH = 280;
  private static readonly PANEL_X = 1280 - 280 - 10; // Right side with margin
  private static readonly PANEL_Y = 60;
  private static readonly PANEL_MAX_H = 620;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0);
    this.setScrollFactor(0);
    this.setDepth(90);
    this.createPanel();
    this.setVisible(false);
    scene.add.existing(this);
  }

  private createPanel(): void {
    const pw = NarrationPanel.PANEL_WIDTH;
    const px = NarrationPanel.PANEL_X;
    const py = NarrationPanel.PANEL_Y;
    const maxH = NarrationPanel.PANEL_MAX_H;

    // Semi-transparent background
    this.background = this.scene.add.rectangle(
      px + pw / 2,
      py + maxH / 2,
      pw,
      maxH,
      0x0a0a1e,
      0.55
    );
    this.background.setStrokeStyle(1, 0x4466cc, 0.4);
    this.add(this.background);

    // Title
    this.titleText = this.scene.add.text(
      px + pw / 2,
      py + 18,
      '— 星织纪元 —',
      {
        fontSize: '15px',
        color: '#8899cc',
        fontFamily: 'monospace',
        fontStyle: 'bold',
      }
    ).setOrigin(0.5);
    this.add(this.titleText);

    // Decorative line under title
    const line = this.scene.add.rectangle(
      px + pw / 2,
      py + 34,
      pw - 40,
      1,
      0x4466cc,
      0.3
    );
    this.add(line);

    // Story text area — word wrap within panel
    this.textObject = this.scene.add.text(
      px + 16,
      py + 44,
      '',
      {
        fontSize: '13px',
        color: '#bbccee',
        fontFamily: 'monospace',
        lineSpacing: 6,
        wordWrap: { width: pw - 32, useAdvancedWrap: true },
      }
    );
    this.add(this.textObject);
  }

  /**
   * Show narration with typewriter reveal + auto-hide after duration
   */
  public showNarration(narration: StoryNarration): void {
    if (this.isVisible) {
      this.hideNarration();
    }

    // Manually wrap CJK text — Phaser wordWrap doesn't break Chinese reliably
    this.fullText = this.wrapCJK(narration.text, NarrationPanel.PANEL_WIDTH - 32, 13);
    this.revealedChars = 0;
    this.revealTimer = 0;
    this.textObject.setText('');

    this.setVisible(true);
    this.isVisible = true;

    // Fade in
    this.setAlpha(0);
    this.scene.tweens.add({
      targets: this,
      alpha: 1,
      duration: 500,
      ease: 'Power2',
    });

    // Auto-hide after duration
    if (this.hideTimer) {
      this.hideTimer.destroy();
    }
    this.hideTimer = this.scene.time.delayedCall(narration.duration, () => {
      this.hideNarration();
    });
  }

  /**
   * Call every frame to advance typewriter
   */
  public update(): void {
    if (!this.isVisible || this.revealedChars >= this.fullText.length) return;

    this.revealTimer += this.scene.game.loop.delta;
    const msPerChar = 1000 / NarrationPanel.CHARS_PER_SECOND;

    while (this.revealTimer >= msPerChar && this.revealedChars < this.fullText.length) {
      this.revealTimer -= msPerChar;
      this.revealedChars++;
      this.textObject.setText(this.fullText.substring(0, this.revealedChars));
    }
  }

  public hideNarration(): void {
    if (!this.isVisible) return;

    this.scene.tweens.add({
      targets: this,
      alpha: 0,
      duration: 500,
      ease: 'Power2',
      onComplete: () => {
        this.setVisible(false);
        this.isVisible = false;
      },
    });

    if (this.hideTimer) {
      this.hideTimer.destroy();
      this.hideTimer = undefined;
    }
  }

  public forceHide(): void {
    if (this.hideTimer) {
      this.hideTimer.destroy();
      this.hideTimer = undefined;
    }
    this.setVisible(false);
    this.isVisible = false;
    this.setAlpha(1);
  }

  public destroy(fromScene?: boolean): void {
    if (this.hideTimer) {
      this.hideTimer.destroy();
    }
    super.destroy(fromScene);
  }

  /**
   * Manually wrap CJK text by inserting newlines.
   * Monospace font: each char ~charWidth px wide.
   */
  private wrapCJK(text: string, maxWidth: number, fontSize: number): string {
    // Monospace: approximate char width ~0.6 * fontSize for CJK, ~0.6 for ASCII
    const charW = fontSize * 0.6;
    const charsPerLine = Math.floor(maxWidth / charW);
    if (charsPerLine <= 0) return text;

    let result = '';
    let lineLen = 0;
    for (const ch of text) {
      if (ch === '\n') {
        result += ch;
        lineLen = 0;
        continue;
      }
      if (lineLen >= charsPerLine) {
        result += '\n';
        lineLen = 0;
      }
      result += ch;
      lineLen++;
    }
    return result;
  }
}
