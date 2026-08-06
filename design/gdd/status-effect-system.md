# Status Effect System

> **Status**: Designed
> **Author**: user + Claude
> **Last Updated**: 2026-03-28
> **Implements Pillar**: 构筑优先于操作 (Build over Execution) — status effects create passive synergies that reward build choices over mechanical skill

## Overview

The Status Effect System manages persistent effects applied to enemies (and occasionally the player): Burn, Freeze, Shock, and Vulnerability. Each effect has distinct gameplay behavior — Burn deals damage over time, Freeze immobilizes, Shock enables chain damage, and Vulnerability amplifies incoming damage. The system tracks active effects per entity, ticks them each frame, handles expiration, and checks for cross-element reactions (defined by the Element System). Status effects are the bridge between "I hit an enemy" and "my build creates cascading combos."

## Player Fantasy

Status effects make the player feel like a powerful mage whose spells leave lasting marks on the battlefield. A fire mage watches enemies burn to death after being hit. An ice mage freezes a crowd and watches them shatter. The fantasy is: "my magic doesn't just hit — it lingers, spreads, and punishes."

## Detailed Design

### Core Rules

1. Four status effects exist (from guide.md §9.3):

   | Effect | Element | Behavior | Stacks? |
   |--------|---------|----------|---------|
   | **Burn** | Fire | Deals damage over time (DoT) every 0.5s | No — refreshes duration, takes higher damage |
   | **Freeze** | Ice | Immobilizes target, prevents actions | No — refreshes duration |
   | **Shock** | Lightning | Next lightning hit on this target chains to nearby enemies | No — refreshes duration, resets chain flag |
   | **Vulnerability** | Any | Target takes increased damage from all sources | Yes — stacks up to 5, each stack adds +10% |

2. Status effect data structure:
   ```ts
   interface StatusEffect {
     type: 'burn' | 'freeze' | 'shock' | 'vulnerability';
     source: string;           // spellId that applied it
     element: ElementType;
     duration: number;         // remaining seconds
     tickTimer: number;        // for DoT effects
     damage?: number;          // for burn: damage per tick
     stacks?: number;          // for vulnerability
   }
   ```

3. Each enemy maintains an array of active status effects: `activeEffects: StatusEffect[]`.

4. **Application rules**:
   - When a status is applied to a target that already has the same status: refresh duration, keep the higher damage value (burn) or increment stacks (vulnerability).
   - When a status is applied to a target that has a DIFFERENT element's status: check the Element System's reaction table. If a reaction exists, execute it (Melt, Shatter, Overload, Echo).
   - Status application emits `STATUS_APPLY` on the Event Bus.

5. **Tick logic** (runs every frame for each entity with active effects):
   - **Burn**: Every 0.5s, deal `burnDamage` to the target. Emit `ENEMY_DAMAGED`.
   - **Freeze**: Set target velocity to 0, disable target AI. On expire, restore movement.
   - **Shock**: Passive flag — no tick behavior. Consumed when a lightning hit occurs (Combat System checks for shock, triggers chain, removes shock).
   - **Vulnerability**: Passive modifier — no tick behavior. Combat System reads stack count to multiply incoming damage.

6. **Expiration**: When `duration` reaches 0, the effect is removed. Emit `STATUS_EXPIRE` on the Event Bus. For Freeze, restore target movement/AI.

7. **Application chance**: Status effects are not guaranteed. Each spell/upgrade defines an application probability:
   - Base chance varies by spell and upgrade level (e.g., 寒冰棱镜 base freeze chance: 15%)
   - Upgrades can increase chance (e.g., "冻结概率 +10%")
   - The roll happens in the Combat System on hit; if successful, it calls `statusEffectSystem.apply(target, effect)`

8. **Cross-element reactions** (delegated from Element System):
   When `apply()` detects an existing status of a different element, it calls `elementSystem.getReaction(existingElement, newElement)` and executes:
   - **Melt**: Remove freeze, deal `fireDamage × 2.0` burst
   - **Shatter**: Deal `lightningDamage × 3.0` burst, remove freeze
   - **Overload**: AoE explosion `(fireDamage + lightningDamage) × 0.5` in 80-unit radius, apply shock to nearby
   - **Echo**: Repeat the existing status effect once more (refresh + extra tick)

### States and Transitions

Per-entity status effect lifecycle:

| State | Entry Condition | Exit Condition | Behavior |
|-------|----------------|----------------|----------|
| **None** | Default | Status applied | No effect active |
| **Active** | `apply()` called, chance roll succeeds | Duration expires or consumed | Effect ticks each frame |
| **Reacting** | Different element status applied while active | Reaction resolves (instant) | Reaction damage/effect applied, one or both statuses consumed |

### Interactions with Other Systems

| System | Direction | Interface |
|--------|-----------|-----------|
| Element System | Reads from | `getReaction(elementA, elementB)` for cross-element reaction lookup |
| Combat System | Called by | `apply(target, effect)` on successful status chance roll; reads vulnerability stacks for damage multiplier; checks shock flag for chain trigger |
| Spell System | Reads config | Spell config defines which status effect and base chance |
| Enemy System | Modifies | Sets velocity to 0 on freeze, restores on expire |
| Relic System | Triggers | Relics subscribe to `STATUS_APPLY` and `STATUS_EXPIRE` for trigger effects |
| Event Bus | Emits | `STATUS_APPLY`, `STATUS_EXPIRE` |
| Build System | Reads from | Upgrade cards can modify status chance, duration, damage |

## Formulas

### Burn Damage Per Tick
```
burnTickDamage = baseBurnDamage × playerPower × (1 + bonusBurnDamage)
```
| Variable | Type | Range | Description |
|----------|------|-------|-------------|
| baseBurnDamage | float | 3–15 | From spell/upgrade config |
| playerPower | float | 1.0–5.0 | Player's 法强 multiplier |
| bonusBurnDamage | float | 0–1.0 | From upgrades/relics |

Tick interval: 0.5s. Total burn damage = `burnTickDamage × (duration / 0.5)`

### Freeze Duration
```
freezeDuration = baseDuration × (1 + bonusDuration)
```
| Variable | Type | Range | Description |
|----------|------|-------|-------------|
| baseDuration | float | 1.0–2.0s | From spell/upgrade config |
| bonusDuration | float | 0–0.5 | From upgrades/relics |

Freeze is capped at 3.0s max to prevent perma-freeze.

### Vulnerability Damage Multiplier
```
vulnerabilityMultiplier = 1 + (stacks × 0.10)
```
| Variable | Type | Range | Description |
|----------|------|-------|-------------|
| stacks | int | 1–5 | Current vulnerability stacks |

Max multiplier: 1.5 (at 5 stacks).

### Status Application Chance
```
finalChance = baseChance + bonusChance
roll = random(0, 1)
applied = roll < finalChance
```
| Variable | Type | Range | Description |
|----------|------|-------|-------------|
| baseChance | float | 0.05–0.50 | From spell config |
| bonusChance | float | 0–0.30 | From upgrades/relics |

## Edge Cases

| Scenario | Expected Behavior | Rationale |
|----------|------------------|-----------|
| Burn applied to already-burning target | Refresh duration, keep higher damage value | No stacking — prevents exponential DoT |
| Freeze applied to already-frozen target | Refresh duration only | No duration stacking beyond cap |
| Freeze applied to boss | Duration reduced to 30% (bosses resist CC). This replaces the generic `statusResistance` from Enemy System — bosses use this hardcoded 30% reduction, not the per-enemy resistance field, to prevent double-stacking to near-immunity. | Bosses can't be perma-frozen |
| Vulnerability at 5 stacks, another applied | Refresh duration, stacks stay at 5 | Hard cap prevents infinite scaling |
| Shock consumed by lightning hit | Shock removed, chain damage triggered, no shock remains | One-shot consumption |
| Shock expires without being consumed | Simply removed, no effect | Wasted shock is valid |
| Enemy dies while burning | Burn stops, no further ticks. Death event fires normally. | Dead enemies don't tick |
| Freeze + Burn applied same frame | Process in order: first status applies, second triggers Melt reaction | Deterministic — application order matters |
| Status applied during pause | Not possible — combat is frozen during pause | Pause freezes all systems |
| Multiple reactions in one frame | Max one reaction per status application. If applying fire to a target with both ice and shock, only react with the most recent existing status. | Prevents cascade exploits |

## Dependencies

| System | Direction | Nature of Dependency |
|--------|-----------|---------------------|
| Event Bus | Upstream | Hard — emits STATUS_APPLY, STATUS_EXPIRE |
| Element System | Upstream | Hard — reads reaction table for cross-element reactions |

**Depended on by:**

| System | Nature |
|--------|--------|
| Combat System | Hard — reads vulnerability stacks, shock flag; calls apply() |
| Relic System | Soft — subscribes to status events for triggers |
| VFX / Particle System | Soft — subscribes to status events for visual indicators |

## Tuning Knobs

| Parameter | Current Value | Safe Range | Effect of Increase | Effect of Decrease |
|-----------|--------------|------------|-------------------|-------------------|
| `BURN_TICK_INTERVAL` | 0.5s | 0.25–1.0s | More frequent ticks, higher total DPS | Less frequent, lower DPS |
| `BURN_BASE_DAMAGE` | 5 | 2–15 | Stronger burn | Weaker burn |
| `FREEZE_BASE_DURATION` | 1.5s | 0.5–2.5s | Longer CC | Shorter CC |
| `FREEZE_MAX_DURATION` | 3.0s | 2.0–5.0s | Longer max freeze | Tighter cap |
| `FREEZE_BOSS_REDUCTION` | 0.3 | 0.1–0.5 | Bosses freeze longer | Bosses nearly immune |
| `SHOCK_CHAIN_RANGE` | 100 | 60–150 | Wider chain reach | Tighter chain |
| `SHOCK_CHAIN_DAMAGE_RATIO` | 0.5 | 0.3–0.8 | Chain hits harder | Chain hits weaker |
| `VULNERABILITY_PER_STACK` | 0.10 | 0.05–0.20 | Stronger debuff per stack | Weaker per stack |
| `VULNERABILITY_MAX_STACKS` | 5 | 3–8 | Higher damage ceiling | Lower ceiling |
| `VULNERABILITY_DURATION` | 4.0s | 2.0–6.0s | Longer debuff window | Shorter window |

## Visual/Audio Requirements

| Event | Visual Feedback | Audio Feedback | Priority |
|-------|----------------|---------------|----------|
| Burn active | Orange flame particles on enemy | Crackling fire loop | MVP (visual), Alpha (audio) |
| Burn tick | Brief flash on damage | None | MVP |
| Freeze active | Blue tint on enemy sprite, ice crystal overlay | None | MVP |
| Freeze shatter (on Melt/Shatter) | Ice fragment burst | Glass break SFX | Vertical Slice |
| Shock active | Yellow spark particles on enemy | Electric crackle | MVP (visual), Alpha (audio) |
| Shock chain triggered | Lightning arc VFX between targets | Zap SFX | Vertical Slice |
| Vulnerability active | Red downward arrow icon above enemy | None | MVP |

## UI Requirements

| Information | Display Location | Update Frequency | Condition |
|-------------|-----------------|-----------------|-----------|
| Status effect icons | Above enemy sprite | On apply/expire | When enemy has active effects |
| Boss status effects | Boss HP bar area | On apply/expire | During boss fight |
| Reaction text | Floating combat text "Melt!" etc. | On reaction trigger | During combat |

## Acceptance Criteria

- [ ] Burn deals correct damage per tick at 0.5s intervals
- [ ] Burn refreshes duration on reapplication, keeps higher damage
- [ ] Freeze immobilizes target for correct duration
- [ ] Freeze duration reduced on bosses by configured reduction factor
- [ ] Freeze capped at max duration
- [ ] Shock flag is consumed on next lightning hit, triggering chain
- [ ] Shock chain hits enemies within configured range
- [ ] Vulnerability stacks correctly up to max, each stack adds configured damage increase
- [ ] Cross-element reactions trigger correctly per Element System reaction table
- [ ] Only one reaction per status application
- [ ] STATUS_APPLY and STATUS_EXPIRE events fire correctly on Event Bus
- [ ] Dead enemies stop ticking status effects
- [ ] All status parameters are configurable via data (not hardcoded)
- [ ] Performance: status tick update for 150 enemies < 1ms per frame

## Open Questions

None — the Status Effect System design is fully specified.
