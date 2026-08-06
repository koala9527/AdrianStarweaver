# Element System

> **Status**: Designed
> **Author**: user + Claude
> **Last Updated**: 2026-03-28
> **Implements Pillar**: 构筑优先于操作 (Build over Execution) — elements create build identity and synergy paths

## Overview

The Element System defines the four magical elements (Fire, Ice, Lightning, Arcane) and manages how they tag spells, interact with status effects, and create cross-element synergies. Every spell has an optional element tag. Elements are not just cosmetic — they determine which status effects can be applied, which upgrade cards appear, and which relic triggers activate. The Element System is the backbone of build identity: a "fire build" and an "ice build" feel fundamentally different because of how elements cascade through combat, upgrades, and relics.

## Player Fantasy

The player should feel like a specialist mage who has chosen a magical school — or a hybrid who combines elements for devastating combos. Fire players see the screen burn. Ice players freeze and shatter mobs. Lightning players watch chain reactions arc across the battlefield. The fantasy is: "my element choice defines my playstyle, and when I combine elements, something special happens."

## Detailed Design

### Core Rules

1. Four elements exist (from guide.md §7.5C):

   | Element | Color | Status Effect | Theme |
   |---------|-------|--------------|-------|
   | **Fire** 🔥 | Orange/Red | Burn (DoT) | Sustained damage, explosions |
   | **Ice** ❄️ | Blue/White | Freeze (CC) | Slow, shatter, area control |
   | **Lightning** ⚡ | Yellow/Purple | Shock (chain) | Chain reactions, crit synergy |
   | **Arcane** ✨ | Purple/Pink | — (pure damage) | Penetration, duplication, echo |

2. Every spell has an `element` field: `'fire' | 'ice' | 'lightning' | 'arcane' | null`. Null means the spell is untyped (rare — only base 奥术飞弹 before infusion).

3. Element tags flow through the system:
   - **Spell → Projectile**: A fire spell creates fire-tagged projectiles
   - **Projectile → Hit**: A fire-tagged hit can apply Burn via Status Effect System
   - **Hit → Relic trigger**: Relics can subscribe to element-specific hits (e.g., "on fire hit, explode")

4. **Element Infusion** (from guide.md §7.5C): Upgrade cards can infuse an element onto a previously untyped or differently-typed spell. When infused:
   - The spell gains the new element tag
   - Its projectiles change color to match
   - It can now trigger that element's status effect
   - It qualifies for that element's synergy bonuses

5. **Element Affinity Tracking**: The Element System tracks the player's element distribution:
   ```ts
   interface ElementAffinity {
     fire: number;    // count of fire-tagged spells + fire upgrades taken
     ice: number;
     lightning: number;
     arcane: number;
   }
   ```
   This is used by the Upgrade Pool System to bias card generation toward the player's dominant element (guide.md §8.3 rule 5).

6. **Cross-Element Reactions**: When two different element effects are active on the same enemy, a reaction may trigger:

   | Element A | Element B | Reaction | Effect |
   |-----------|-----------|----------|--------|
   | Fire | Ice | **Melt** | Removes freeze, deals burst damage (2× fire damage) |
   | Ice | Lightning | **Shatter** | Frozen enemy takes 3× lightning damage, freeze consumed |
   | Fire | Lightning | **Overload** | AoE explosion around target, applies shock to nearby |
   | Arcane | Any | **Echo** | Repeats the other element's status effect once more |

7. Reactions are checked by the Status Effect System when a new status is applied to a target that already has a different element's status. The Element System provides the reaction lookup table; the Status Effect System executes it.

8. The Element System does NOT deal damage directly. It provides:
   - Element tag data for spells and projectiles
   - Affinity tracking for the Upgrade Pool System
   - Reaction rules for the Status Effect System
   - Element-based queries for Relic triggers (e.g., "is this hit fire-tagged?")

### States and Transitions

The Element System is stateless in terms of its own operation. It maintains the player's `ElementAffinity` counters, which are updated when:
- A spell is acquired (affinity for that spell's element +1)
- An element infusion upgrade is applied (+1 to new element)
- A spell is removed or replaced (affinity adjusted)

No state machine — affinity is a running tally.

### Interactions with Other Systems

| System | Direction | Interface |
|--------|-----------|-----------|
| Spell System | Reads from | Each spell's `element` field determines projectile element tag |
| Status Effect System | Reads from | Reaction table lookup when applying new status to target with existing status |
| Combat System | Reads from | Element tag on hit payload for damage type identification |
| Build System | Modified by | Updates affinity when upgrades/infusions are applied |
| Upgrade Pool System | Reads from | `getAffinity()` to bias card generation toward dominant element |
| Relic System | Reads from | Element tag on events to trigger element-specific relic effects |
| Event Bus | Subscribes | Listens to `UPGRADE_CHOSEN` to update affinity; listens to `STATUS_APPLY` for reaction checks |

## Formulas

### Element Affinity Score
```
affinityScore[element] = spellCount[element] + infusionCount[element] + relicBonus[element]
dominantElement = element with highest affinityScore
```

| Variable | Type | Range | Description |
|----------|------|-------|-------------|
| spellCount | int | 0–4 | Number of equipped spells with this element |
| infusionCount | int | 0–10 | Number of element infusion upgrades taken |
| relicBonus | int | 0–3 | Bonus from element-boosting relics |

### Cross-Element Reaction Damage

| Reaction | Formula | Expected Range |
|----------|---------|---------------|
| Melt (Fire+Ice) | `fireDamage × 2.0` | 20–200 |
| Shatter (Ice+Lightning) | `lightningDamage × 3.0` | 30–300 |
| Overload (Fire+Lightning) | `(fireDamage + lightningDamage) × 0.5` as AoE | 15–150 per target |
| Echo (Arcane+Any) | Repeats the other status effect (same damage/duration) | Varies |

## Edge Cases

| Scenario | Expected Behavior | Rationale |
|----------|------------------|-----------|
| Spell has no element (null) | No status effect applied, no reaction possible, no element affinity change | Untyped spells are element-neutral |
| Same element applied twice to same target | Status effect refreshes duration, no reaction | Reactions require two DIFFERENT elements |
| Three elements on same target | Reaction triggers for the newest pair (new + most recent existing). Only one reaction per status application. | Prevents chain-reaction loops from a single hit |
| Element infusion changes a spell's element | Old element affinity decremented, new element affinity incremented. Existing projectiles in flight keep old element. | Clean transition, no retroactive changes |
| All 4 spells are the same element | Affinity heavily weighted, Upgrade Pool strongly biases that element. No reactions possible (mono-element build). | Valid build path — "pure fire" is a strategy |
| Arcane + Arcane | No reaction (Echo requires Arcane + a different element) | Arcane reacting with itself would be meaningless |

## Dependencies

| System | Direction | Nature of Dependency |
|--------|-----------|---------------------|
| Event Bus | Upstream | Hard — subscribes to events for affinity tracking and reaction checks |

**Depended on by:**

| System | Nature |
|--------|--------|
| Spell System | Hard — reads element tags for projectile creation |
| Status Effect System | Hard — reads reaction table |
| Combat System | Soft — reads element tag on hits for identification |
| Upgrade Pool System | Hard — reads affinity for card generation bias |
| Relic System | Soft — reads element tags for trigger conditions |
| Build System | Hard — updates affinity on upgrade application |

## Tuning Knobs

| Parameter | Current Value | Safe Range | Effect of Increase | Effect of Decrease |
|-----------|--------------|------------|-------------------|-------------------|
| `MELT_MULTIPLIER` | 2.0 | 1.5–3.0 | Fire+Ice combo more rewarding | Less incentive to mix fire/ice |
| `SHATTER_MULTIPLIER` | 3.0 | 2.0–4.0 | Ice+Lightning combo very powerful | Less burst from shatter |
| `OVERLOAD_AOE_MULTIPLIER` | 0.5 | 0.3–0.8 | Bigger AoE damage from fire+lightning | Weaker AoE |
| `OVERLOAD_AOE_RADIUS` | 80 | 50–120 | Wider explosion | Tighter explosion |
| `AFFINITY_BIAS_THRESHOLD` | 3 | 2–5 | Upgrade Pool biases earlier | Need more investment before bias kicks in |
| `ECHO_REPEAT_COUNT` | 1 | 1–2 | Arcane combos stronger | Arcane combos weaker |

## Visual/Audio Requirements

| Event | Visual Feedback | Audio Feedback | Priority |
|-------|----------------|---------------|----------|
| Melt reaction | Steam burst VFX (orange+blue) | Sizzle SFX | Vertical Slice |
| Shatter reaction | Ice fragment explosion VFX | Glass break SFX | Vertical Slice |
| Overload reaction | Electric explosion VFX (orange+yellow) | Thunder crack SFX | Vertical Slice |
| Echo reaction | Purple ripple VFX | Arcane hum SFX | Vertical Slice |
| Element infusion applied | Spell icon color change + flash | Upgrade chime | MVP |

## UI Requirements

| Information | Display Location | Update Frequency | Condition |
|-------------|-----------------|-----------------|-----------|
| Spell element icon | HUD spell slot | On spell acquire/infusion | Always |
| Element affinity summary | Build panel (optional) | On upgrade chosen | When panel open |
| Reaction trigger | Floating text "Melt!" / "Shatter!" | On reaction | During combat |

## Acceptance Criteria

- [ ] Four elements defined with correct color and status effect associations
- [ ] Spells carry element tags that propagate to projectiles and hit events
- [ ] Element infusion upgrades correctly change a spell's element tag
- [ ] Element affinity tracks correctly as spells and infusions are acquired
- [ ] Cross-element reactions trigger when two different element statuses are on the same target
- [ ] Melt, Shatter, Overload, and Echo produce correct damage/effects per formula
- [ ] Only one reaction per status application (no chain loops)
- [ ] Arcane + Arcane does not trigger Echo
- [ ] Upgrade Pool System receives correct affinity data for card bias
- [ ] Reaction multipliers are configurable via data (not hardcoded)
- [ ] Visual distinction between elements is clear (color-coded)

## Open Questions

None — the Element System design is fully specified.
