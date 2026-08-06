import { BuildSystem } from './BuildSystem';
import { SpellSystem } from './SpellSystem';
import { SpawnDirector } from './SpawnDirector';
import { UpgradeCard, UpgradeCategory, Rarity, BuildState, PlayerState } from '../types';
import { UPGRADE_CARDS } from '../data/upgrades';

const CATEGORY_WEIGHTS: Record<UpgradeCategory, number> = {
  spell_upgrade: 0.45,
  new_spell: 0.20,
  global_stat: 0.20,
  element: 0.0,
  relic: 0.0,
  survival: 0.05,
};

const BASE_RARITY_MULT: Record<Rarity, number> = {
  common: 1.0,
  rare: 0.5,
  epic: 0.2,
};

const RARITY_LEVEL_SCALING = 0.02;
const SYNERGY_TAG_BONUS = 2;
const STALE_PENALTY = -5;

export class UpgradePoolSystem {
  private buildSystem: BuildSystem;
  private spellSystem: SpellSystem;
  private spawnDirector: SpawnDirector;
  private recentOffered: string[][] = []; // last 2 sets of offered card IDs

  constructor(buildSystem: BuildSystem, spellSystem: SpellSystem, spawnDirector: SpawnDirector) {
    this.buildSystem = buildSystem;
    this.spellSystem = spellSystem;
    this.spawnDirector = spawnDirector;
  }

  generateCandidates(playerState: PlayerState): UpgradeCard[] {
    const buildState = this.buildSystem.getBuildState();
    const pool = this.buildCandidatePool(buildState, playerState);

    if (pool.length === 0) return this.getFallbackCards();

    const scored = pool.map(card => ({
      card,
      score: this.scoreCard(card, buildState, playerState),
    }));

    const selected: UpgradeCard[] = [];
    const remaining = [...scored];

    for (let i = 0; i < 3 && remaining.length > 0; i++) {
      const totalScore = remaining.reduce((sum, s) => sum + s.score, 0);
      if (totalScore <= 0) {
        if (remaining.length > 0) {
          const idx = Math.floor(Math.random() * remaining.length);
          selected.push(remaining[idx].card);
          remaining.splice(idx, 1);
        }
        continue;
      }

      let roll = Math.random() * totalScore;
      let picked = 0;
      for (let j = 0; j < remaining.length; j++) {
        roll -= remaining[j].score;
        if (roll <= 0) {
          picked = j;
          break;
        }
      }
      selected.push(remaining[picked].card);
      remaining.splice(picked, 1);
    }

    // Category diversity: if all 3 same category, replace lowest with different
    if (selected.length === 3 && selected[0].category === selected[1].category && selected[1].category === selected[2].category) {
      const diffCategory = remaining.find(s => s.card.category !== selected[0].category);
      if (diffCategory) {
        selected[2] = diffCategory.card;
      }
    }

    // Track offered for anti-stale
    this.recentOffered.push(selected.map(c => c.id));
    if (this.recentOffered.length > 2) this.recentOffered.shift();

    return selected;
  }

  private buildCandidatePool(buildState: BuildState, playerState: PlayerState): UpgradeCard[] {
    const equippedSpellIds = playerState.spellSlots.map(s => s.spellId);
    const chosenIds = buildState.upgradeHistory;

    return UPGRADE_CARDS.filter(card => {
      // Filter spell upgrades to equipped spells only
      if (card.category === 'spell_upgrade' && card.tags) {
        const targetSpell = card.tags.find(t => t.startsWith('spell:'));
        if (targetSpell) {
          const spellId = targetSpell.replace('spell:', '');
          if (!equippedSpellIds.includes(spellId)) return false;
        }
      }

      // No new spells if slots full
      if (card.category === 'new_spell' && playerState.spellSlots.length >= 4) return false;

      // Check excludes
      if (card.excludes) {
        for (const ex of card.excludes) {
          if (chosenIds.includes(ex)) return false;
        }
      }

      // Check requires
      if (card.requires) {
        for (const req of card.requires) {
          if (req.type === 'has_spell' && typeof req.value === 'string') {
            if (!equippedSpellIds.includes(req.value)) return false;
          }
          if (req.type === 'min_level' && typeof req.value === 'number') {
            if (playerState.level < req.value) return false;
          }
          if (req.type === 'has_tag' && typeof req.value === 'string') {
            if (!buildState.tags.includes(req.value)) return false;
          }
        }
      }

      // Cards chosen 2+ times are excluded (except spell upgrades which track via modifiers)
      const timesChosen = chosenIds.filter(id => id === card.id).length;
      if (timesChosen >= 2) return false;

      return true;
    });
  }

  private scoreCard(card: UpgradeCard, buildState: BuildState, playerState: PlayerState): number {
    const categoryWeight = CATEGORY_WEIGHTS[card.category] || 0.1;

    // Survival boost at low HP
    let survivalWeight = categoryWeight;
    if (card.category === 'survival' && playerState.hp < playerState.maxHp * 0.3) {
      survivalWeight = 0.15;
    }

    const rarityMult = BASE_RARITY_MULT[card.rarity] + (playerState.level - 1) * RARITY_LEVEL_SCALING;
    let baseScore = card.weight * survivalWeight * rarityMult;

    // Synergy bonus
    const cardTags = card.tags ?? [];
    const sharedTags = cardTags.filter(t => buildState.tags.includes(t) && !t.startsWith('spell:'));
    baseScore += sharedTags.length * SYNERGY_TAG_BONUS;

    // Anti-stale penalty
    const recentIds = this.recentOffered.flat();
    if (recentIds.includes(card.id) && !buildState.upgradeHistory.includes(card.id)) {
      baseScore += STALE_PENALTY;
    }

    return Math.max(0.1, baseScore);
  }

  private getFallbackCards(): UpgradeCard[] {
    const globals = UPGRADE_CARDS.filter(c => c.category === 'global_stat');
    const result: UpgradeCard[] = [];
    const shuffled = [...globals].sort(() => Math.random() - 0.5);
    for (let i = 0; i < 3 && i < shuffled.length; i++) {
      result.push(shuffled[i]);
    }
    return result;
  }

  destroy(): void {
    // Stateless
  }
}
