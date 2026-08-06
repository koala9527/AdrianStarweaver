import { EventBus } from '../core/EventBus';
import { Player } from '../entities/Player';
import { SpellSystem } from './SpellSystem';
import {
  GameEvents, UpgradeChosenPayload, UpgradeCard, ApplyInstruction,
  BuildState, ElementAffinity, ElementType, GlobalMod, SpellModifier,
} from '../types';

export class BuildSystem {
  private eventBus: EventBus;
  private player: Player;
  private spellSystem: SpellSystem;
  private buildState: BuildState;

  constructor(eventBus: EventBus, player: Player, spellSystem: SpellSystem) {
    this.eventBus = eventBus;
    this.player = player;
    this.spellSystem = spellSystem;

    this.buildState = {
      spells: this.player.playerState.spellSlots,
      relics: [],
      globalModifiers: [],
      elementAffinity: {
        [ElementType.FIRE]: 0,
        [ElementType.ICE]: 0,
        [ElementType.LIGHTNING]: 0,
        [ElementType.ARCANE]: 0,
      },
      upgradeHistory: [],
      tags: [],
    };

    this.eventBus.on(GameEvents.UPGRADE_CHOSEN, this.onUpgradeChosen, this);
  }

  private onUpgradeChosen(payload: UpgradeChosenPayload): void {
    const card = payload.upgradeCard;
    this.buildState.upgradeHistory.push(card.id);

    for (const instruction of card.apply) {
      this.executeInstruction(instruction);
    }

    // Add card tags to build
    if (card.tags) {
      for (const tag of card.tags) {
        if (!this.buildState.tags.includes(tag)) {
          this.buildState.tags.push(tag);
        }
      }
    }

    // Handle new spell
    if (card.category === 'new_spell' && card.apply.length === 0) {
      // If the card has a targetId, equip that spell
      const spellId = card.id.replace('new_spell_', '');
      this.spellSystem.equipSpell(spellId);
    }
  }

  private executeInstruction(inst: ApplyInstruction): void {
    if (inst.target === 'player') {
      this.applyPlayerMod(inst);
    } else if (inst.target === 'spell') {
      this.applySpellMod(inst);
    } else if (inst.target === 'tag') {
      if (inst.operation === 'append_tag' && typeof inst.value === 'string') {
        if (!this.buildState.tags.includes(inst.value)) {
          this.buildState.tags.push(inst.value);
        }
      }
    }
  }

  private applyPlayerMod(inst: ApplyInstruction): void {
    const ps = this.player.playerState as unknown as Record<string, unknown>;
    const current = ps[inst.field];
    if (typeof current !== 'number' || typeof inst.value !== 'number') return;

    let newValue = current;
    if (inst.operation === 'add') newValue = current + inst.value;
    else if (inst.operation === 'mul') newValue = current * inst.value;
    else if (inst.operation === 'set') newValue = inst.value;

    // Clamp known fields
    if (inst.field === 'moveSpeed') newValue = Math.max(50, newValue);
    if (inst.field === 'critChance') newValue = Math.max(0, Math.min(1, newValue));
    if (inst.field === 'hp') newValue = Math.min(this.player.playerState.maxHp, newValue);

    ps[inst.field] = newValue;

    // Track as global modifier
    if (inst.operation === 'add' || inst.operation === 'mul') {
      this.buildState.globalModifiers.push({
        field: inst.field,
        operation: inst.operation,
        value: inst.value,
      });
    }
  }

  private applySpellMod(inst: ApplyInstruction): void {
    if (typeof inst.value !== 'number') return;

    // Wildcard: apply to all equipped spells
    if (inst.targetId === '*') {
      for (const slot of this.player.playerState.spellSlots) {
        slot.modifiers.push({
          field: inst.field,
          operation: inst.operation as 'add' | 'mul' | 'set',
          value: inst.value,
        });
      }
      return;
    }

    const slot = this.player.playerState.spellSlots.find(s => s.spellId === inst.targetId);
    if (!slot) return;

    slot.modifiers.push({
      field: inst.field,
      operation: inst.operation as 'add' | 'mul' | 'set',
      value: inst.value,
    });
  }

  getBuildState(): BuildState {
    return this.buildState;
  }

  destroy(): void {
    this.eventBus.off(GameEvents.UPGRADE_CHOSEN, this.onUpgradeChosen, this);
  }
}
