import { EventBus } from '../core/EventBus';
import { GameTimer } from '../core/GameTimer';
import { UpgradePoolSystem } from './UpgradePoolSystem';
import { SpellSystem } from './SpellSystem';
import { Player } from '../entities/Player';
import { GameEvents, XpGainedPayload, LevelUpPayload, UpgradeChosenPayload, UpgradeCard } from '../types';
import { SPELL_UNLOCK_ORDER } from '../data/spells';

export class LevelUpSystem {
  private eventBus: EventBus;
  private gameTimer: GameTimer;
  private upgradePool: UpgradePoolSystem;
  private spellSystem: SpellSystem;
  private player: Player;

  private currentXp = 0;
  private pendingLevelUps = 0;
  private isLevelingUp = false;
  private spellUnlockIndex = 0;

  // Callback for UI — set by RunScene
  onShowCards: ((cards: UpgradeCard[], level: number) => void) | null = null;
  // Callback for spell unlock notification
  onSpellUnlocked: ((spellName: string) => void) | null = null;

  constructor(
    eventBus: EventBus,
    gameTimer: GameTimer,
    upgradePool: UpgradePoolSystem,
    spellSystem: SpellSystem,
    player: Player,
  ) {
    this.eventBus = eventBus;
    this.gameTimer = gameTimer;
    this.upgradePool = upgradePool;
    this.spellSystem = spellSystem;
    this.player = player;

    this.eventBus.on(GameEvents.XP_GAINED, this.onXpGained, this);
  }

  private onXpGained(payload: XpGainedPayload): void {
    this.currentXp += payload.amount;
    this.checkLevelUp();
  }

  private checkLevelUp(): void {
    const expToNext = this.player.playerState.expToNext;

    while (this.currentXp >= expToNext && this.player.playerState.level < 30) {
      this.currentXp -= this.player.playerState.expToNext;
      this.player.playerState.level++;
      this.player.playerState.expToNext = this.calculateExpToNext(this.player.playerState.level);
      this.pendingLevelUps++;
    }

    if (this.pendingLevelUps > 0 && !this.isLevelingUp) {
      this.startLevelUp();
    }
  }

  private startLevelUp(): void {
    this.isLevelingUp = true;
    this.gameTimer.pause();
    this.showNextLevelUp();
  }

  private showNextLevelUp(): void {
    if (this.pendingLevelUps <= 0) {
      this.finishLevelUp();
      return;
    }

    // Auto-equip new spell if available
    if (this.spellUnlockIndex < SPELL_UNLOCK_ORDER.length) {
      const spellId = SPELL_UNLOCK_ORDER[this.spellUnlockIndex];
      this.spellSystem.equipSpell(spellId);
      this.spellUnlockIndex++;

      if (this.onSpellUnlocked) {
        const config = this.spellSystem.getSpellConfig(spellId);
        this.onSpellUnlocked(config?.name ?? spellId);
      }

      this.eventBus.emit(GameEvents.LEVEL_UP, {
        newLevel: this.player.playerState.level,
      } satisfies LevelUpPayload);

      this.pendingLevelUps--;

      // Brief pause then continue to card selection or next level
      if (this.pendingLevelUps > 0) {
        this.showNextLevelUp();
      } else {
        this.finishLevelUp();
      }
      return;
    }

    // Show upgrade cards
    const cards = this.upgradePool.generateCandidates(this.player.playerState);
    if (this.onShowCards) {
      this.onShowCards(cards, this.player.playerState.level);
    }
  }

  selectCard(card: UpgradeCard): void {
    this.eventBus.emit(GameEvents.UPGRADE_CHOSEN, {
      upgradeCard: card,
    } satisfies UpgradeChosenPayload);

    this.eventBus.emit(GameEvents.LEVEL_UP, {
      newLevel: this.player.playerState.level,
    } satisfies LevelUpPayload);

    this.pendingLevelUps--;

    if (this.pendingLevelUps > 0) {
      this.showNextLevelUp();
    } else {
      this.finishLevelUp();
    }
  }

  private finishLevelUp(): void {
    this.isLevelingUp = false;
    this.gameTimer.resume();
  }

  private calculateExpToNext(level: number): number {
    // Fast progression: level up every few kills
    return Math.floor(4 * (1 + (level - 1) * 0.2));
  }

  getCurrentXp(): number {
    return this.currentXp;
  }

  getExpToNext(): number {
    return this.player.playerState.expToNext;
  }

  isInLevelUp(): boolean {
    return this.isLevelingUp;
  }

  destroy(): void {
    this.eventBus.off(GameEvents.XP_GAINED, this.onXpGained, this);
  }
}
