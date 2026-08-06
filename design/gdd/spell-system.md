# Spell System

> **Status**: Designed
> **Author**: user + Claude
> **Last Updated**: 2026-03-28
> **Implements Pillar**: 构筑优先于操作 (Build over Execution) — spells cast automatically, player builds power through choices not execution

## Overview

The Spell System is the core gameplay system of咒语旅团. It manages the player's spell slots (1–4), handles automatic spell casting on cooldown, selects targets based on each spell's targeting mode, spawns projectiles/area effects via the Object Pool, and applies upgrade modifications to spell behavior. The player never presses a button to cast — spells fire automatically when their cooldown is ready and a valid target exists. This system is where build choices become visible: a fire mage's screen fills with flame novas and burning trails, while a lightning mage sees arcing chains across enemy clusters. The Spell System reads spell configurations from data files, making it fully data-driven and extensible.

## Player Fantasy

The player should feel like an increasingly powerful sorcerer whose magic grows from a single modest spell into a screen-filling arsenal of destruction. Early game: one spell, modest damage, manageable. Mid game: three spells firing in rhythm, elements combining, enemies melting. Late game: four spells in perfect sync, chain reactions cascading, the screen alive with magical carnage. The fantasy is: "I built this — every spell, every upgrade, every synergy was my choice, and now I'm unstoppable."

## Detailed Design

### Core Rules

1. **Spell Slots**: The player starts with 1 spell slot and can unlock up to 4 via level-up choices. Each slot holds one equipped spell with its current upgrade state.
   ```ts
   interface SpellSlotState {
     spellId: string;
     level: number;           // upgrade level (1 = base)
     element: ElementType | null;
     cooldownRemaining: number;
     modifiers: SpellModifier[];  // applied upgrades
   }
   ```

2. **Spell Configuration** (from guide.md §7.3):
   ```ts
   interface SpellConfig {
     id: string;
     name: string;
     rarity: 'common' | 'rare' | 'epic';
     tags: string[];
     element: ElementType | null;
     castMode: 'auto' | 'interval' | 'trigger';
     targetMode: 'nearest' | 'random' | 'area' | 'surround';
     baseDamage: number;
     cooldown: number;          // seconds
     projectileSpeed?: number;
     projectileCount?: number;
     duration?: number;         // for area effects
     radius?: number;           // for area/surround
     pierce?: number;           // projectiles pass through N enemies
     chain?: number;            // bounces to N additional targets
     statusEffect?: { type: StatusType; chance: number; };
     upgrades: string[];        // ordered upgrade IDs
   }
   ```

3. **Cast Modes**:
   - `auto`: Casts as soon as cooldown is ready AND a valid target exists
   - `interval`: Casts on a fixed timer regardless of targets (e.g., 火焰新星 pulses around player)
   - `trigger`: Casts in response to an event (e.g., "on kill, cast X") — used by upgraded spells

4. **Target Modes**:
   - `nearest`: Targets the closest enemy to the player
   - `random`: Targets a random enemy within range
   - `area`: Places effect at the densest enemy cluster within range
   - `surround`: Emanates from the player in all directions (no target needed)

5. **Cast Loop** (runs every frame for each equipped spell):
   ```
   for each spellSlot:
     cooldownRemaining -= delta × (1 + player.cooldownRate)
     if cooldownRemaining <= 0:
       target = selectTarget(spell.targetMode)
       if target exists OR spell.targetMode == 'surround' OR spell.castMode == 'interval':
         cast(spell, target)
         cooldownRemaining = spell.cooldown
         emit SPELL_CAST event
   ```

6. **Spell Implementations** (6 spells from guide.md §7.4):

   | Spell | Element | Cast Mode | Target Mode | Behavior |
   |-------|---------|-----------|-------------|----------|
   | 奥术飞弹 (Arcane Missile) | Arcane | auto | nearest | Spawns homing projectile(s) that track target |
   | 火焰新星 (Flame Nova) | Fire | interval | surround | Burst of flame around player, damages all in radius |
   | 寒冰棱镜 (Ice Prism) | Ice | auto | nearest | Straight-line piercing projectile |
   | 闪电链 (Chain Lightning) | Lightning | auto | nearest | Hits target, chains to N nearby enemies |
   | 虚空法阵 (Void Circle) | Arcane | auto | area | Persistent damage zone at target location |
   | 秘能使魔 (Arcane Familiar) | Arcane | interval | nearest | Summon that orbits player and auto-attacks |

7. **Projectile Spawning**: When a spell casts, the Spell System acquires a projectile/effect from the Object Pool, configures it with the spell's stats (damage, speed, element, pierce, etc.), and adds it to the appropriate physics group. The projectile handles its own movement and lifetime; the Combat System handles what happens on hit.

8. **Spell Modifiers**: Upgrades modify spell behavior by adding `SpellModifier` entries:
   ```ts
   interface SpellModifier {
     field: string;       // e.g., 'baseDamage', 'projectileCount', 'cooldown', 'radius'
     operation: 'add' | 'mul' | 'set';
     value: number;
   }
   ```
   Modifiers are applied in order: `set` first, then `add`, then `mul`. This ensures predictable stacking.

9. **Effective Stat Calculation**:
   ```
   effectiveValue = baseValue
   for each modifier where operation == 'set': effectiveValue = modifier.value
   for each modifier where operation == 'add': effectiveValue += modifier.value
   for each modifier where operation == 'mul': effectiveValue *= modifier.value
   ```

10. **Homing Projectiles** (奥术飞弹): Each frame, the projectile adjusts its velocity toward the target. If the target dies, it retargets the nearest enemy. If no enemies exist, it continues in a straight line until off-screen or lifetime expires.

11. **Piercing Projectiles** (寒冰棱镜): On hit, decrement pierce counter. If pierce > 0, continue through the enemy. If pierce == 0, release to pool. Track hit enemies to prevent double-hitting the same enemy in one pass.

12. **Chain Hits** (闪电链): On hit, find the nearest enemy within chain range that hasn't been hit by this chain. Apply `chainDamageRatio` damage. Repeat for `chain` count. Each chain emits a separate `SPELL_HIT` event.

13. **Area Effects** (虚空法阵): Spawns a static zone that persists for `duration` seconds. Enemies inside take damage every `areaDamageInterval` (0.5s). The zone tracks which enemies it has ticked this interval to prevent double-damage.

14. **Summons** (秘能使魔): Spawns a familiar entity that orbits the player at a fixed radius. The familiar auto-attacks the nearest enemy at its own fire rate. Familiar inherits a percentage of player's `power` stat. Multiple familiars spread evenly around the orbit.

### States and Transitions

Each spell slot has its own cycle:

| State | Entry Condition | Exit Condition | Behavior |
|-------|----------------|----------------|----------|
| **Cooling** | Spell just cast | `cooldownRemaining <= 0` | Cooldown ticks down each frame |
| **Ready** | Cooldown complete | Valid target found (or surround/interval) | Waiting for target |
| **Casting** | Target acquired | Projectile/effect spawned (instant) | Spawn entity, emit SPELL_CAST, enter Cooling |

Casting is instantaneous (single frame) — there is no cast time or wind-up animation. The transition is: Ready → Casting → Cooling → Ready.

**Summon special case** (秘能使魔): The familiar persists indefinitely once summoned. The spell slot enters a `Summoned` state where cooldown represents the familiar's attack rate, not a re-summon timer. Upgrading the familiar modifies the existing summon rather than creating a new one.

### Interactions with Other Systems

| System | Direction | Interface |
|--------|-----------|-----------|
| Player Controller | Reads from | Player position (spawn origin), `power`, `critChance`, `critDamage`, `cooldownRate`, `spellSlots` |
| Object Pool | Acquires from | `projectilePool.acquire()`, `areaEffectPool.acquire()`, `summonPool.acquire()` |
| Collision System | Registers with | Spawned projectiles added to `playerProjectileGroup`; area effects to `areaEffectGroup` |
| Combat System | Delegates to | On projectile hit (via Collision System callback), Combat System calculates damage |
| Element System | Reads from | Spell's element tag propagated to projectile for status effect eligibility |
| Build System | Modified by | Upgrade cards add `SpellModifier` entries to spell slots; new spells added to empty slots |
| Event Bus | Emits | `SPELL_CAST { spellId, element, position, targets }` on every cast |
| Status Effect System | Triggers via | Projectile hit → Combat System → status chance roll → Status Effect System |
| Enemy System | Reads from | Target selection queries active enemies by position |

## Formulas

### Effective Cooldown
```
effectiveCooldown = baseCooldown × (1 - player.cooldownRate)
```
| Variable | Type | Range | Description |
|----------|------|-------|-------------|
| baseCooldown | float | 0.3–5.0s | From spell config + modifiers |
| cooldownRate | float | 0–0.5 | Player stat (50% cap to prevent machine-gun) |

### Spell Damage (per projectile/tick)
```
spellDamage = effectiveBaseDamage × player.power × skillMultiplier
```
| Variable | Type | Range | Description |
|----------|------|-------|-------------|
| effectiveBaseDamage | float | 5–80 | Base damage after modifiers (set→add→mul) |
| player.power | float | 1.0–5.0 | 法强 multiplier from Player Controller |
| skillMultiplier | float | 0.5–2.0 | Per-spell scaling factor (e.g., area spells hit more targets so lower per-hit) |

### Homing Turn Rate
```
angleToTarget = atan2(target.y - proj.y, target.x - proj.x)
angleDiff = normalizeAngle(angleToTarget - proj.angle)
proj.angle += clamp(angleDiff, -turnRate × delta, turnRate × delta)
```
| Variable | Type | Range | Description |
|----------|------|-------|-------------|
| turnRate | rad/s | 3.0–8.0 | How fast homing projectiles turn (higher = tighter tracking) |

### Chain Damage Falloff
```
chainDamage[n] = originalDamage × chainDamageRatio^n
```
| Variable | Type | Range | Description |
|----------|------|-------|-------------|
| chainDamageRatio | float | 0.5–0.8 | Damage retained per bounce |
| n | int | 1–chain count | Bounce index (0 = primary hit at full damage) |

### Area Effect DPS
```
areaDPS = (effectiveBaseDamage × player.power) / areaDamageInterval
totalAreaDamage = areaDPS × duration × avgEnemiesInZone
```
| Variable | Type | Range | Description |
|----------|------|-------|-------------|
| areaDamageInterval | float | 0.5s | Tick rate for zone damage |
| duration | float | 2.0–6.0s | Zone lifetime |

### Familiar DPS
```
familiarDPS = familiarBaseDamage × (player.power × familiarPowerRatio) / familiarAttackInterval
```
| Variable | Type | Range | Description |
|----------|------|-------|-------------|
| familiarPowerRatio | float | 0.3–0.6 | Percentage of player power inherited |
| familiarAttackInterval | float | 0.8–1.5s | Familiar fire rate |

## Edge Cases

| Scenario | Expected Behavior | Rationale |
|----------|------------------|-----------|
| No enemies on screen, spell ready | `auto` mode: waits. `interval`/`surround` mode: still casts (火焰新星 pulses even with no enemies) | Surround/interval are position-based, not target-based |
| Target dies between cast and projectile arrival | Homing: retargets nearest. Straight-line: continues to original position. Area: still placed. | No wasted casts — projectiles are resilient |
| All spell slots full, new spell offered | Upgrade Pool should not offer new spells when slots are full (only upgrades to existing) | Prevents confusing "can't equip" scenario |
| Spell cooldown reduced below 0.1s | Clamped to 0.1s minimum | Prevents infinite cast loops |
| Multiple projectiles from one cast (projectileCount > 1) | Spread evenly in a fan pattern (±15° per additional projectile from center) | Looks good, covers area |
| Pierce projectile hits same enemy twice | Prevented — each projectile tracks a `hitSet` of enemy IDs | No double-dipping |
| Chain lightning with only 1 enemy | Primary hit applies, no chain (chain count unused) | Graceful degradation |
| Chain target is behind a wall/obstacle | No line-of-sight check — chains freely (Arcade Physics has no raycasting) | Simplicity over realism for H5 |
| Area effect placed at map edge | Zone clamped to map bounds | No off-map zones |
| Familiar count exceeds summon pool cap | Oldest familiar released, new one spawned | Pool cap enforced |
| Spell upgrade applied mid-cooldown | Modifiers update immediately; current cooldown is NOT reset | Prevents exploit of upgrading to reset cooldown |
| Game paused while projectiles in flight | Projectiles freeze (Phaser time scale pauses physics) | Consistent pause behavior |

## Dependencies

| System | Direction | Nature of Dependency |
|--------|-----------|---------------------|
| Player Controller | Upstream | Hard — reads position, stats, spell slots |
| Object Pool | Upstream | Hard — acquires projectiles, area effects, summons |
| Collision System | Upstream | Hard — registers spawned entities in physics groups |
| Element System | Upstream | Hard — reads element tags for projectile configuration |
| Event Bus | Upstream | Hard — emits SPELL_CAST, subscribes to UPGRADE_CHOSEN |

**Depended on by:**

| System | Nature |
|--------|--------|
| Combat System | Hard — processes spell hits for damage calculation |
| Build System | Hard — applies spell modifiers and new spell acquisitions |
| Upgrade Pool System | Hard — reads equipped spells to generate relevant upgrade cards |
| HUD | Hard — reads spell slot state for icon display and cooldown indicators |
| VFX / Particle System | Soft — reads spell element for visual effects |

## Tuning Knobs

| Parameter | Current Value | Safe Range | Effect of Increase | Effect of Decrease |
|-----------|--------------|------------|-------------------|-------------------|
| `MAX_SPELL_SLOTS` | 4 | 3–6 | More build variety | Tighter choices |
| `COOLDOWN_RATE_CAP` | 0.5 | 0.3–0.7 | Faster max fire rate | Slower cap |
| `MIN_COOLDOWN` | 0.1s | 0.05–0.3s | Faster minimum fire rate | Prevents spam |
| `HOMING_TURN_RATE` | 5.0 rad/s | 3.0–8.0 | Tighter tracking | Easier to dodge (for enemies) |
| `HOMING_LIFETIME` | 3.0s | 2.0–5.0s | Longer pursuit | Faster expiry |
| `CHAIN_DAMAGE_RATIO` | 0.7 | 0.5–0.9 | Chains hit harder | Steeper falloff |
| `CHAIN_RANGE` | 120 | 80–200 | Wider chain reach | Tighter clustering needed |
| `AREA_DAMAGE_INTERVAL` | 0.5s | 0.25–1.0s | More frequent ticks | Less frequent |
| `FAMILIAR_POWER_RATIO` | 0.4 | 0.2–0.6 | Stronger familiars | Weaker familiars |
| `FAMILIAR_ORBIT_RADIUS` | 60 | 40–100 | Wider orbit | Tighter orbit |
| `PROJECTILE_FAN_ANGLE` | 15° | 5–30° | Wider spread | Tighter grouping |
| `PROJECTILE_LIFETIME` | 2.0s | 1.0–4.0s | Longer range | Shorter range |

**Per-spell tuning** is in `data/spells.ts` — each spell's `baseDamage`, `cooldown`, `projectileCount`, `pierce`, `chain`, `radius`, `duration` are all configurable.

## Visual/Audio Requirements

| Event | Visual Feedback | Audio Feedback | Priority |
|-------|----------------|---------------|----------|
| Spell cast | Element-colored projectile/effect spawned | Cast SFX per spell | MVP (visual), Alpha (audio) |
| Projectile hit | Impact flash (element color) | Hit SFX | MVP (visual), Alpha (audio) |
| Chain lightning arc | Lightning bolt VFX between chain targets | Zap SFX | Vertical Slice |
| Area effect active | Pulsing ground circle (element color) | Ambient hum | Vertical Slice |
| Familiar orbit | Small sprite orbiting player | None | MVP |
| Cooldown ready | HUD icon flash/glow | None | MVP |

## UI Requirements

| Information | Display Location | Update Frequency | Condition |
|-------------|-----------------|-----------------|-----------|
| Spell icons | HUD bottom bar | On spell acquire/change | Always during run |
| Cooldown overlay | Over spell icon (radial sweep) | Every frame | During cooldown |
| Spell level indicator | Small number on spell icon | On upgrade | Always |

## Acceptance Criteria

- [ ] Spells auto-cast when cooldown is ready and target conditions are met
- [ ] Cooldown reduction applies correctly (capped at 50%)
- [ ] All 6 spells function per their defined behavior
- [ ] 奥术飞弹: homing tracks target, retargets on kill
- [ ] 火焰新星: pulses on interval around player, damages all in radius
- [ ] 寒冰棱镜: straight-line pierce, tracks hit enemies, no double-hit
- [ ] 闪电链: chains to N targets with damage falloff
- [ ] 虚空法阵: persistent zone, ticks damage at interval, placed at densest cluster
- [ ] 秘能使魔: orbits player, auto-attacks, inherits power ratio
- [ ] Spell modifiers apply in correct order (set → add → mul)
- [ ] New spells equip to empty slots correctly
- [ ] Spell slots cap at MAX_SPELL_SLOTS
- [ ] Projectiles acquired from and released to Object Pool correctly
- [ ] SPELL_CAST event fires on every cast with correct payload
- [ ] Surround/interval spells cast even with no enemies
- [ ] Game pause freezes all projectiles and cooldowns
- [ ] All spell parameters are data-driven (configurable in spells.ts)
- [ ] Performance: spell update loop for 4 spells < 0.5ms per frame

## Open Questions

None — the Spell System design is fully specified.
