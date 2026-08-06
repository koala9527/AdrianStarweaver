# Enemy System

> **Status**: Designed
> **Author**: user + Claude
> **Last Updated**: 2026-03-28
> **Implements Pillar**: 构筑优先于操作 (Build over Execution) — enemies are pressure sources that test the player's build, not mechanical skill

## Overview

The Enemy System manages all enemy entities: their types, stats, AI behaviors, spawning configuration, and death handling. Enemies in咒语旅团 are not complex AI opponents — they are pressure generators. Each of the 6 normal enemy types serves exactly one tactical purpose (force movement, break formation, absorb damage, create priority targets). Enemies are acquired from the Object Pool, configured with type-specific stats and behavior, and released on death. The system provides the raw material that the Spawn Director orchestrates into waves.

## Player Fantasy

Enemies should feel like a rising tide of magical creatures that the player's build must overcome. Early enemies are trivial — the player mows them down effortlessly. As the run progresses, enemy variety and density create genuine pressure. The fantasy is: "the horde is endless, but my build is stronger." Each enemy type should be instantly recognizable by silhouette and behavior so the player can make split-second positioning decisions.

## Detailed Design

### Core Rules

1. All enemies are Phaser Sprites with Arcade Physics bodies, acquired from the Object Pool.
2. Each enemy has a type-specific configuration:
   ```ts
   interface EnemyConfig {
     id: string;
     name: string;
     category: 'normal' | 'elite' | 'boss';
     hp: number;
     moveSpeed: number;
     contactDamage: number;
     xpValue: number;
     bodyRadius: number;
     behavior: BehaviorType;
     spawnCost: number;        // budget cost for Spawn Director
     lootTable?: LootDrop[];
     statusResistance?: Partial<Record<StatusType, number>>;  // 0-1, reduces duration
   }
   ```

3. **6 Normal Enemy Types** (from guide.md §10.2):

   | Enemy | Behavior | HP | Speed | Contact Dmg | XP | Spawn Cost | Tactical Role |
   |-------|----------|-----|-------|-------------|-----|------------|---------------|
   | 小史莱姆 (Slime) | `chase` | 15 | 120 | 5 | 1 | 1 | Fodder — fast, weak, fills screen |
   | 骷髅兵 (Skeleton) | `chase` | 40 | 80 | 10 | 3 | 2 | Balanced — medium threat |
   | 盾甲怪 (Shield Brute) | `chase_slow` | 120 | 50 | 15 | 5 | 4 | Tank — absorbs damage, pushes through |
   | 远程术士 (Ranged Caster) | `ranged` | 25 | 60 | 5 | 4 | 3 | Ranged — fires projectiles, stays back |
   | 冲锋兽 (Charger) | `charge` | 50 | 40→250 | 25 | 4 | 3 | Burst — charges in a line after wind-up |
   | 分裂虫 (Splitter) | `chase` | 60 | 70 | 8 | 3 | 3 | On death, splits into 2 mini-splitters |

4. **AI Behaviors** (simple, no pathfinding):

   - `chase`: Move directly toward player position each frame. `velocity = normalize(player.pos - enemy.pos) × moveSpeed`
   - `chase_slow`: Same as chase but with lower speed. Pushes through other enemies.
   - `ranged`: Move toward player until within attack range (200 units), then stop and fire projectiles at interval. If player gets closer than 100 units, retreat.
   - `charge`: Idle for 1.5s (wind-up, visual telegraph), then dash in a straight line at 250 speed for 0.8s. After dash, pause 1.0s, then repeat cycle.
   - `split_on_death`: Uses `chase` behavior. On death, spawns 2 mini-splitters at death position (half HP, half size, same behavior, no further splitting).

5. **Enemy State Machine** (per enemy):

   | State | Behavior Types | Description |
   |-------|---------------|-------------|
   | **Active** | All | Normal behavior, moving/attacking |
   | **Frozen** | All | Velocity = 0, AI paused (from Freeze status effect) |
   | **Charging** | `charge` only | Wind-up → dash → recovery cycle |
   | **Dying** | All | Brief death animation, then release to pool |

6. **Contact Damage**: When an enemy overlaps the player (via Collision System), the Combat System applies `contactDamage` to the player. Contact damage has a per-enemy cooldown of 0.5s to prevent instant-kill stacking.

7. **Ranged Attack** (远程术士): Fires a slow projectile (speed: 150) toward the player's position at cast time. Projectile is added to `enemyProjectileGroup`. Damage: 8. Fire interval: 2.0s.

8. **Death Handling**:
   - On HP reaching 0, enemy enters Dying state
   - Combat System emits `ENEMY_KILL` on Event Bus (Enemy System does NOT emit — Combat System is the authoritative emitter for all kill/damage events)
   - Play death animation (brief flash + fade, ~200ms)
   - Release to Object Pool
   - Special: 分裂虫 spawns 2 mini-splitters before releasing

9. **Elite Enemies** (from guide.md §10.2 — Vertical Slice tier, but config defined here):

   | Elite | Behavior | HP | Speed | Special | XP | Spawn Cost |
   |-------|----------|-----|-------|---------|-----|------------|
   | 冰冠守卫 (Frost Guardian) | `chase_slow` | 500 | 60 | Aura: slows player by 20% within 150 units | 30 | 15 |
   | 雷暴祭司 (Storm Priest) | `ranged` | 350 | 50 | Periodically summons lightning strikes at player position | 30 | 15 |

10. **Boss** (from guide.md §10.2 — Vertical Slice tier):

    | Boss | HP | Mechanics |
    |------|----|-----------|
    | 混沌监察者 (Chaos Overseer) | 3000 | Phase 1: Fan barrage. Phase 2: Summon adds. Phase 3: Area explosions with ground warnings. |

    Boss details are owned by the Boss System GDD. The Enemy System only provides the base entity and stat framework.

### States and Transitions

```
[Spawned] → [Active] → [Dying] → [Released to Pool]
                ↕
            [Frozen] (from Status Effect System)
                ↕
            [Charging] (charge behavior only)
```

| State | Entry | Exit | Behavior |
|-------|-------|------|----------|
| **Spawned** | `pool.acquire()` + configure | Immediate → Active | Set position, stats, enable physics body |
| **Active** | After spawn or unfreeze | HP ≤ 0 or frozen | Execute AI behavior, take damage |
| **Frozen** | Freeze status applied | Freeze expires | Velocity = 0, AI paused, tinted blue |
| **Charging** | Charge wind-up starts | Dash completes + recovery | Wind-up telegraph → dash → pause |
| **Dying** | HP ≤ 0 | Animation complete | Death VFX, emit ENEMY_KILL, split if splitter, release |

### Interactions with Other Systems

| System | Direction | Interface |
|--------|-----------|-----------|
| Object Pool | Acquired from | `enemyPool.acquire()` returns inactive enemy sprite |
| Spawn Director | Configured by | Sets enemy type, position, and stat scaling |
| Collision System | Registered with | Enemy added to `enemyGroup` on spawn |
| Combat System | Modified by | Receives damage, applies to HP, triggers death |
| Status Effect System | Modified by | Freeze sets velocity to 0; burn ticks reduce HP |
| Player Controller | Reads from | AI targets player position |
| Loot & Pickup System | Triggers | `ENEMY_KILL` event triggers loot/XP drops |
| Event Bus | Reads from | Combat System is the authoritative emitter for `ENEMY_KILL`, `ENEMY_DAMAGED` |

## Formulas

### Enemy HP Scaling (over time)
```
scaledHp = baseHp × (1 + timeScaling × gameTimer.getElapsed() / 60)
```
| Variable | Type | Range | Description |
|----------|------|-------|-------------|
| baseHp | int | 15–120 | From enemy config |
| timeScaling | float | 0.15 | 15% more HP per minute elapsed |

At minute 10: Slime HP = 15 × (1 + 0.15 × 10) = 37.5

### Enemy Damage Scaling
```
scaledDamage = baseDamage × (1 + damageScaling × gameTimer.getElapsed() / 60)
```
| Variable | Type | Range | Description |
|----------|------|-------|-------------|
| baseDamage | int | 5–25 | From enemy config |
| damageScaling | float | 0.10 | 10% more damage per minute |

### Contact Damage Cooldown
```
canDamagePlayer = (currentTime - lastContactDamageTime) > contactDamageCooldown
```
| Variable | Type | Value | Description |
|----------|------|-------|-------------|
| contactDamageCooldown | float | 0.5s | Per-enemy cooldown between contact hits |

### XP Value Scaling
```
scaledXp = baseXp × (1 + xpScaling × floor(gameTimer.getElapsed() / 120))
```
| Variable | Type | Range | Description |
|----------|------|-------|-------------|
| baseXp | int | 1–5 | From enemy config |
| xpScaling | float | 0.25 | 25% more XP per 2-minute phase |

## Edge Cases

| Scenario | Expected Behavior | Rationale |
|----------|------------------|-----------|
| Enemy spawned off-screen | Normal — Spawn Director places enemies outside camera view, they walk in | Standard spawn pattern |
| Enemy pushed off map by collisions | `setCollideWorldBounds(true)` prevents this | Same as player |
| Splitter dies while frozen | Splits normally — mini-splitters spawn unfrozen | Freeze doesn't prevent death mechanics |
| Mini-splitter killed | Drops XP, emits ENEMY_KILL, does NOT split again | One level of splitting only |
| Charger dashes into map edge | Stops at boundary, enters recovery state | World bounds collision |
| Ranged caster has no line of sight | Fires anyway — no LOS checks in Arcade Physics | Simplicity for H5 |
| 150 enemies all chasing player | All move toward player, Enemy-Enemy collider prevents perfect stacking | May form a dense blob — acceptable for genre |
| Enemy killed by burn DoT (no spell hit) | `ENEMY_KILL` still fires with `killerSpellId` = the spell that applied the burn | Burn source is tracked |
| Elite enemy frozen | Duration reduced by `statusResistance.freeze` (e.g., 0.5 = 50% shorter) | Elites resist CC |
| Enemy HP reaches exactly 0 | Treated as dead (≤ 0 check) | No edge case at zero |

## Dependencies

| System | Direction | Nature of Dependency |
|--------|-----------|---------------------|
| Object Pool | Upstream | Hard — enemies are pooled objects |
| Collision System | Upstream | Hard — enemies need physics bodies in enemyGroup |
| Player Controller | Upstream | Hard — AI targets player position |

**Depended on by:**

| System | Nature |
|--------|--------|
| Spawn Director | Hard — spawns and configures enemies |
| Combat System | Hard — applies damage to enemies |
| Boss System | Hard — boss is a specialized enemy |
| Loot & Pickup System | Soft — listens to ENEMY_KILL for drops |

## Tuning Knobs

| Parameter | Current Value | Safe Range | Effect of Increase | Effect of Decrease |
|-----------|--------------|------------|-------------------|-------------------|
| `HP_TIME_SCALING` | 0.15/min | 0.05–0.30 | Enemies get tankier faster | Enemies stay squishy longer |
| `DAMAGE_TIME_SCALING` | 0.10/min | 0.05–0.20 | Enemies hit harder faster | Less damage pressure |
| `XP_PHASE_SCALING` | 0.25/2min | 0.10–0.50 | Faster leveling in late game | Flatter XP curve |
| `CONTACT_DAMAGE_COOLDOWN` | 0.5s | 0.3–1.0s | Less contact damage per second | More punishing contact |
| `CHARGER_WINDUP` | 1.5s | 1.0–2.5s | More reaction time | Less warning |
| `CHARGER_DASH_SPEED` | 250 | 180–350 | Harder to dodge | Easier to dodge |
| `RANGED_ATTACK_INTERVAL` | 2.0s | 1.0–3.0s | More projectile pressure | Less ranged threat |
| `RANGED_PROJECTILE_SPEED` | 150 | 100–250 | Harder to dodge | Easier to dodge |
| `SPLITTER_MINI_COUNT` | 2 | 1–3 | More split pressure | Less split threat |
| `ELITE_STATUS_RESISTANCE` | 0.5 | 0.3–0.8 | Elites resist CC more | Elites more vulnerable to CC |

Per-enemy stats are in `data/enemies.ts` — fully configurable.

## Visual/Audio Requirements

| Event | Visual Feedback | Audio Feedback | Priority |
|-------|----------------|---------------|----------|
| Enemy spawn | Fade-in from transparent | None | MVP |
| Enemy death | Flash white → fade out (200ms) | Death SFX (per type) | MVP (visual), Alpha (audio) |
| Charger wind-up | Red glow/flash, exclamation mark | Warning SFX | MVP |
| Charger dash | Motion blur/trail | Whoosh SFX | Vertical Slice |
| Ranged caster attack | Projectile spawn flash | Cast SFX | MVP (visual), Alpha (audio) |
| Splitter death | Split VFX (pop into 2) | Pop SFX | MVP |
| Elite enemy | Glowing outline / larger sprite | None | Vertical Slice |
| Frozen enemy | Blue tint overlay | None | MVP |
| Burning enemy | Orange flame particles | None | MVP |

## UI Requirements

| Information | Display Location | Update Frequency | Condition |
|-------------|-----------------|-----------------|-----------|
| Elite HP bar | Above elite sprite | Every frame | When elite is active |
| Boss HP bar | Top of screen | Every frame | During boss fight |
| Enemy count (debug) | Debug overlay | Every frame | Dev mode only |

## Acceptance Criteria

- [ ] All 6 normal enemy types spawn with correct stats and behavior
- [ ] Chase enemies move directly toward player
- [ ] Ranged casters maintain distance and fire projectiles at interval
- [ ] Chargers telegraph, dash, and recover correctly
- [ ] Splitters spawn 2 mini-splitters on death (no recursive splitting)
- [ ] Contact damage applies with per-enemy cooldown
- [ ] Enemy HP and damage scale with elapsed time per formula
- [ ] XP value scales per phase
- [ ] Frozen enemies stop moving and resume on expire
- [ ] ENEMY_KILL and ENEMY_DAMAGED events fire correctly
- [ ] Dead enemies release to Object Pool cleanly
- [ ] Elite enemies have status resistance
- [ ] All enemy stats are data-driven (configurable in enemies.ts)
- [ ] Performance: AI update for 150 enemies < 2ms per frame

## Open Questions

None — the Enemy System design is fully specified.
