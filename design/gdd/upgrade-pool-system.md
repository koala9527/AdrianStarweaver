# Upgrade Pool System

> **Status**: Designed
> **Author**: user + Claude
> **Last Updated**: 2026-03-28
> **Implements Pillar**: 构筑优先于操作 (Build over Execution) — smart card generation ensures meaningful build choices every level-up

## Overview

The Upgrade Pool System generates the 3 candidate cards presented to the player on each level-up. It is NOT random — it uses a weighted scoring algorithm (guide.md §8.2–8.4, §14.5) that considers the player's current build, element affinity, equipped spells, owned relics, and current HP to produce contextually relevant choices. The goal is that every level-up feels like a meaningful decision, not a garbage hand of irrelevant options. The system reads from the Build System and produces candidate arrays for the Level-Up Panel to display.

## Player Fantasy

Every level-up should feel like opening a treasure chest tailored to the player's build. The player should think "all three of these are tempting" more often than "none of these help me." When the player is building fire, fire upgrades should appear more often. When HP is low, a survival option should show up. The fantasy is: "the game understands my build and offers me choices that matter."

## Detailed Design

### Core Rules

1. The Upgrade Pool System is called by the XP & Level-Up System when the player levels up. It returns exactly 3 `UpgradeCard` objects.

2. **Upgrade Card Structure** (from guide.md §15.2):
   ```ts
   interface UpgradeCard {
     id: string;
     name: string;
     description: string;
     category: 'new_spell' | 'spell_upgrade' | 'global_stat' | 'element' | 'relic' | 'survival';
     rarity: 'common' | 'rare' | 'epic';
     element?: ElementType | null; // element association for UI tinting (null if untyped)
     weight: number;           // base weight in pool
     requires?: Requirement[]; // conditions to appear
     excludes?: string[];      // IDs that prevent this card
     tags?: string[];          // for synergy matching
     apply: ApplyInstruction[];
   }
   ```

3. **Category Weights** (from guide.md §8.2):

   | Category | Base Weight | Dynamic Adjustment |
   |----------|-----------|-------------------|
   | spell_upgrade | 45% | Only for equipped spells |
   | new_spell | 20% | Increases if spell slots available; 0% if full |
   | global_stat | 20% | Stable |
   | relic | 10% | 0% if at max relics |
   | survival | 5% | Increases to 15% when HP < 30% |

4. **Card Generation Algorithm** (from guide.md §14.5):
   ```
   1. Build candidate pool: all cards whose `requires` are met and `excludes` are not present
   2. Filter out: cards for spells not equipped, duplicate relics, cards already chosen 2+ times
   3. Score each candidate:
      a. Start with card.weight × categoryWeight
      b. Synergy bonus: +2 per shared tag with current build
      c. Element bonus: +3 if card matches dominant element (affinity ≥ threshold)
      d. Relic synergy: +3 if card interacts with an owned relic
      e. Anti-stale: -5 if same card was offered in last 2 level-ups (not chosen)
      f. Survival bonus: +3 for survival cards when HP < 30%
      g. AOE bonus: +2 for AOE upgrades when player lacks clearing power (KPM below expected)
   4. Normalize scores to probabilities
   5. Draw 3 cards without replacement, weighted by score
   6. Ensure category diversity: if all 3 are same category, replace the lowest-scored one with the highest-scored card from a different category
   ```

5. **Rarity Distribution**: Rarity affects how often a card appears in the pool:
   - Common: weight × 1.0
   - Rare: weight × 0.5
   - Epic: weight × 0.2
   - As player level increases, rare/epic multipliers increase slightly:
     ```
     rarityMult = baseRarityMult + (playerLevel - 1) × 0.02
     ```

6. **Repeat Prevention**: Track the last 2 sets of offered cards. Cards that were offered but NOT chosen get a -5 penalty. Cards that WERE chosen are removed from the pool (spell upgrades can be chosen multiple times up to their max level).

7. **Spell Upgrade Leveling**: Each spell has an ordered list of upgrades. The pool only offers the next upgrade in sequence for each spell (not random upgrades out of order).

### States and Transitions

The Upgrade Pool System is stateless — it is a pure function: `generateCandidates(buildState, playerState) → UpgradeCard[3]`. It maintains a small history buffer (last 2 offered sets) for anti-stale logic.

### Interactions with Other Systems

| System | Direction | Interface |
|--------|-----------|-----------|
| Build System | Reads from | `getBuildState()` for equipped spells, relics, tags, affinity |
| Player Controller | Reads from | HP, level, stats for survival/context scoring |
| Spell System | Reads from | Equipped spells and their current upgrade level |
| Relic System | Reads from | Owned relics for exclusion and synergy scoring |
| XP & Level-Up System | Called by | `generateCandidates()` on level-up |
| Spawn Director | Reads from | KPM for AOE bonus scoring |
| Element System | Reads from | `getAffinity()` for element bias |

## Formulas

### Card Score
```
baseScore = card.weight × categoryWeight × rarityMultiplier
synergyBonus = sharedTagCount × 2
elementBonus = (card matches dominantElement && affinity >= threshold) ? 3 : 0
relicBonus = (card synergizes with owned relic) ? 3 : 0
stalepenalty = (card offered in last 2 rounds, not chosen) ? -5 : 0
survivalBonus = (card.category == 'survival' && player.hp < player.maxHp × 0.3) ? 3 : 0
aoeBonus = (card has 'aoe' tag && kpm < expectedKpm × 0.7) ? 2 : 0

finalScore = max(baseScore + synergyBonus + elementBonus + relicBonus + stalePenalty + survivalBonus + aoeBonus, 0.1)
```

| Variable | Type | Range | Description |
|----------|------|-------|-------------|
| card.weight | float | 1–10 | Base weight from card config |
| categoryWeight | float | 0.05–0.45 | From category weight table |
| rarityMultiplier | float | 0.2–1.2 | Rarity × level scaling |
| sharedTagCount | int | 0–5 | Tags shared between card and build |
| affinity threshold | int | 3 | Minimum affinity to trigger element bonus |

### Rarity Multiplier
```
rarityMult = baseRarityMult[rarity] + (playerLevel - 1) × 0.02
```
| Rarity | Base Mult | At Lv10 | At Lv20 |
|--------|----------|---------|---------|
| Common | 1.0 | 1.18 | 1.38 |
| Rare | 0.5 | 0.68 | 0.88 |
| Epic | 0.2 | 0.38 | 0.58 |

### Selection Probability
```
probability[i] = finalScore[i] / Σ(finalScore)
```

## Edge Cases

| Scenario | Expected Behavior | Rationale |
|----------|------------------|-----------|
| Candidate pool has fewer than 3 valid cards | Fill remaining slots with global_stat cards (always available) | Global stats are universally applicable |
| All spell slots full | new_spell category weight = 0, no new spells offered | Prevents unusable cards |
| All relics owned | relic category weight = 0 | Prevents duplicate relics |
| Player at full HP | survival category stays at 5% base weight | No emergency boost needed |
| Player HP < 30% | survival weight increases to 15% | Mercy mechanic |
| Same card offered 3 times in a row (not chosen) | Anti-stale penalty makes it very unlikely but not impossible | Penalty is -5, not exclusion |
| Player level 1 (first level-up) | No history, no stale penalty, likely gets new_spell + basic upgrades | Clean first choice |
| Spell at max upgrade level | That spell's upgrade cards excluded from pool | No wasted options |
| Dominant element tied between two | No element bonus applied (dominantElement = null on tie) | Conservative — don't bias when unclear |

## Dependencies

| System | Direction | Nature of Dependency |
|--------|-----------|---------------------|
| Build System | Upstream | Hard — reads full build state |
| Spell System | Upstream | Hard — reads spell upgrade levels |
| Relic System | Upstream | Hard — reads owned relics for exclusion/synergy |

**Depended on by:**

| System | Nature |
|--------|--------|
| XP & Level-Up System | Hard — calls generateCandidates() |
| Level-Up Panel | Hard — displays the 3 generated cards |

## Tuning Knobs

| Parameter | Current Value | Safe Range | Effect of Increase | Effect of Decrease |
|-----------|--------------|------------|-------------------|-------------------|
| `CATEGORY_WEIGHT_SPELL_UPGRADE` | 0.45 | 0.30–0.60 | More spell upgrades offered | Fewer spell upgrades |
| `CATEGORY_WEIGHT_NEW_SPELL` | 0.20 | 0.10–0.35 | More new spells offered | Fewer new spells |
| `CATEGORY_WEIGHT_GLOBAL` | 0.20 | 0.10–0.30 | More stat upgrades | Fewer stat upgrades |
| `CATEGORY_WEIGHT_RELIC` | 0.10 | 0.05–0.20 | More relics | Fewer relics |
| `CATEGORY_WEIGHT_SURVIVAL` | 0.05 | 0.02–0.10 | More survival options | Fewer survival options |
| `SURVIVAL_LOW_HP_WEIGHT` | 0.15 | 0.10–0.25 | More mercy at low HP | Less mercy |
| `SYNERGY_TAG_BONUS` | 2 | 1–4 | Stronger build coherence | More random variety |
| `ELEMENT_BONUS` | 3 | 1–5 | Stronger element focus | More element diversity |
| `STALE_PENALTY` | -5 | -3 to -10 | Less repeat offers | More repeat tolerance |
| `AFFINITY_THRESHOLD` | 3 | 2–5 | Element bias kicks in earlier | Need more investment |
| `RARITY_LEVEL_SCALING` | 0.02 | 0.01–0.04 | Rares/epics appear faster | Slower rarity progression |
| `DIVERSITY_CHECK` | true | boolean | Ensures category variety in 3 cards | Pure weighted random |

## Visual/Audio Requirements

N/A — The Upgrade Pool System is a data generator. Visual presentation is owned by the Level-Up Panel.

## UI Requirements

N/A — Card display is owned by the Level-Up Panel.

## Acceptance Criteria

- [ ] Generates exactly 3 cards per level-up
- [ ] Cards respect `requires` and `excludes` conditions
- [ ] No new_spell cards when all slots full
- [ ] No duplicate relic cards for owned relics
- [ ] Synergy scoring biases toward build-coherent choices
- [ ] Element affinity biases toward dominant element when threshold met
- [ ] Survival cards appear more often at low HP
- [ ] Anti-stale penalty reduces repeat offers
- [ ] Category diversity check prevents 3 same-category cards
- [ ] Rarity distribution shifts toward rare/epic at higher levels
- [ ] Spell upgrades offered in correct sequence order
- [ ] All weights and bonuses are configurable via data
- [ ] Performance: card generation < 1ms

## Open Questions

None — the Upgrade Pool System design is fully specified.
