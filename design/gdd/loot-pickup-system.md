# Loot & Pickup System

> **Status**: Designed
> **Author**: user + Claude
> **Last Updated**: 2026-03-28
> **Implements Pillar**: 构筑优先于操作 (Build over Execution) — pickups are automatic, player just needs to be near them

## Overview

The Loot & Pickup System handles everything enemies drop and the player collects: XP orbs, health pickups, and event rewards. When an enemy dies, this system spawns appropriate drops at the death position. Pickups are automatically collected when the player moves within their `pickupRadius` — no button press required. Pickups within radius are magnetically pulled toward the player for a satisfying vacuum effect. The system uses the Object Pool for all pickup entities to maintain H5 performance.

## Player Fantasy

The player should feel a constant stream of rewards raining from defeated enemies. XP orbs scatter from kills and get sucked toward the player in a satisfying magnetic sweep. The fantasy is: "every kill feeds my growth" — the visual of orbs flying toward the player reinforces the power loop.

## Detailed Design

### Core Rules

1. Pickup types:

   | Type | Visual | Value | Source | Frequency |
   |------|--------|-------|--------|-----------|
   | XP Orb (small) | Green gem | 1 XP | Normal enemy kill | Every kill |
   | XP Orb (large) | Blue gem | 5 XP | Elite kill, event reward | Rare |
   | Health Orb | Red orb | 10% maxHp | Random drop (5% chance on kill) | Uncommon |

2. **Drop Spawning**: On `ENEMY_KILL` event:
   - Spawn `xpDropCount` XP orbs at enemy death position with slight random scatter (±20 units)
   - Roll for health orb (5% base chance, increased when player HP < 30%)
   - XP orb count: normal enemies drop 1, elites drop 5, boss drops 20

3. **Pickup Collection** (runs every frame):
   ```
   for each active pickup:
     distance = distanceTo(player.position, pickup.position)
     if distance < player.pickupRadius:
       // Magnetic pull
       direction = normalize(player.position - pickup.position)
       pickup.velocity = direction × pullSpeed
       pullSpeed increases as pickup gets closer (acceleration)
     if distance < collectRadius (16 units):
       collect(pickup)
       release to pool
   ```

4. **Magnetic Pull**: Pickups within `pickupRadius` accelerate toward the player. Pull speed starts at 200 and increases to 600 as the pickup gets closer. This creates the satisfying "vacuum" effect.

5. **Collection**: When a pickup reaches `collectRadius` (16 units from player center):
   - XP Orb: emit `XP_GAINED { amount, source: 'orb' }` on Event Bus
   - Health Orb: heal player by value, emit `PLAYER_HEAL { amount, source: 'orb' }`
   - Emit `PICKUP_COLLECTED { pickupType, value, position }` for audio/VFX

6. **Pickup Lifetime**: Uncollected pickups persist for 30 seconds, then fade out and release to pool. This prevents infinite pickup accumulation on screen.

7. **Scatter Pattern**: XP orbs spawn with a brief outward burst (random direction, speed 80, decelerating to 0 over 0.3s) before becoming collectible. This creates a visual "pop" on enemy death.

8. **Pickup Pooling**: All pickups are acquired from `pickupPool`. On release, pickups are reset (position, velocity, type, lifetime timer).

### States and Transitions

Per-pickup lifecycle:

| State | Entry | Exit | Behavior |
|-------|-------|------|----------|
| **Scattering** | Spawned from enemy death | 0.3s timer expires | Burst outward, not collectible |
| **Idle** | Scatter complete | Player enters pickupRadius or lifetime expires | Stationary, waiting |
| **Pulled** | Player within pickupRadius | Reaches collectRadius | Accelerating toward player |
| **Collected** | Within collectRadius | Immediate | Apply value, emit event, release to pool |
| **Expired** | Lifetime (30s) reached | Immediate | Fade out, release to pool |

### Interactions with Other Systems

| System | Direction | Interface |
|--------|-----------|-----------|
| Event Bus | Subscribes/Emits | Subscribes to `ENEMY_KILL` for drop spawning; emits `XP_GAINED`, `PLAYER_HEAL`, `PICKUP_COLLECTED` |
| Object Pool | Acquires from | `pickupPool.acquire()` for all pickup entities |
| Collision System | Registered with | Pickups in `pickupGroup` (fallback contact collection) |
| Player Controller | Reads from | Player position and `pickupRadius` for magnetic pull |
| XP & Level-Up System | Triggers | `XP_GAINED` event feeds into XP accumulation |

## Formulas

### Magnetic Pull Speed
```
pullSpeed = basePullSpeed + (1 - distance / pickupRadius) × pullAcceleration
```
| Variable | Type | Range | Description |
|----------|------|-------|-------------|
| basePullSpeed | float | 200 | Starting pull speed |
| pullAcceleration | float | 400 | Additional speed at close range |
| distance | float | 0–pickupRadius | Current distance to player |
| pickupRadius | float | 80–200 | Player's pickup radius stat |

At edge of radius: speed = 200. At half radius: speed = 400. Near player: speed = 600.

### Health Drop Chance
```
healthDropChance = baseHealthChance × (player.hp < player.maxHp × 0.3 ? 2.0 : 1.0)
```
| Variable | Type | Range | Description |
|----------|------|-------|-------------|
| baseHealthChance | float | 0.05 | 5% base chance per kill |
| Low HP multiplier | float | 2.0 | Doubles when below 30% HP |

### XP Drop Count
```
xpOrbCount = enemy.category == 'normal' ? 1 : enemy.category == 'elite' ? 5 : 20
```

## Edge Cases

| Scenario | Expected Behavior | Rationale |
|----------|------------------|-----------|
| 100+ pickups on screen | Pool cap enforced — oldest expired first | Performance protection |
| Player walks through pickup during scatter phase | Not collected — pickups are not collectible during 0.3s scatter | Prevents instant-collect before visual pop |
| Player pickupRadius increased mid-pull | Already-pulling pickups continue; new pickups in expanded range start pulling | Smooth transition |
| Pickup spawned at map edge | Scatter clamped to map bounds | No off-map pickups |
| Player at full HP collects health orb | Overheal wasted — HP clamped to maxHp | No overhealing |
| Enemy killed during pause | Not possible — combat frozen during pause | Consistent pause |
| Multiple enemies die at same position | All drops scatter from same point with random offsets | Looks like a loot explosion |

## Dependencies

| System | Direction | Nature of Dependency |
|--------|-----------|---------------------|
| Object Pool | Upstream | Hard — pickups are pooled |
| Collision System | Upstream | Hard — pickups in physics group |
| Player Controller | Upstream | Hard — reads position and pickupRadius |
| Event Bus | Upstream | Hard — subscribes to ENEMY_KILL, emits pickup events |

**Depended on by:**

| System | Nature |
|--------|--------|
| XP & Level-Up System | Hard — receives XP_GAINED events |
| HUD | Soft — may show XP gain feedback |
| Audio System | Soft — subscribes to PICKUP_COLLECTED for SFX |

## Tuning Knobs

| Parameter | Current Value | Safe Range | Effect of Increase | Effect of Decrease |
|-----------|--------------|------------|-------------------|-------------------|
| `BASE_PULL_SPEED` | 200 | 100–400 | Faster vacuum | Slower, more deliberate collection |
| `PULL_ACCELERATION` | 400 | 200–600 | Snappier close-range pull | Gentler pull |
| `COLLECT_RADIUS` | 16 | 8–32 | Easier collection | Must be closer |
| `SCATTER_DURATION` | 0.3s | 0.1–0.5s | Longer pop animation | Quicker availability |
| `SCATTER_SPEED` | 80 | 40–150 | Wider scatter | Tighter cluster |
| `PICKUP_LIFETIME` | 30s | 15–60s | Pickups persist longer | Faster cleanup |
| `HEALTH_DROP_CHANCE` | 0.05 | 0.02–0.10 | More healing | Less healing |
| `HEALTH_DROP_LOW_HP_MULT` | 2.0 | 1.5–3.0 | More mercy healing | Less mercy |
| `HEALTH_ORB_VALUE` | 0.10 (10% maxHp) | 0.05–0.20 | Bigger heals | Smaller heals |

## Visual/Audio Requirements

| Event | Visual Feedback | Audio Feedback | Priority |
|-------|----------------|---------------|----------|
| XP orb spawn | Green/blue gem with scatter burst | None | MVP |
| Health orb spawn | Red orb with glow | None | MVP |
| Pickup collected | Brief flash at collection point | Collect chime (pitch varies by type) | MVP (visual), Alpha (audio) |
| Magnetic pull | Pickup moves toward player (no trail needed) | None | MVP |
| Pickup expire | Fade out over 0.5s | None | MVP |

## UI Requirements

| Information | Display Location | Update Frequency | Condition |
|-------------|-----------------|-----------------|-----------|
| XP gained | Brief floating "+X XP" text | On collection | Optional (Vertical Slice) |

## Acceptance Criteria

- [ ] XP orbs spawn on enemy kill with correct count per enemy category
- [ ] Health orbs drop at correct probability (doubled when low HP)
- [ ] Pickups scatter outward on spawn, not collectible during scatter
- [ ] Magnetic pull activates when player is within pickupRadius
- [ ] Pull speed accelerates as pickup approaches player
- [ ] Collection triggers at collectRadius with correct value applied
- [ ] XP_GAINED and PICKUP_COLLECTED events fire on Event Bus
- [ ] Pickups expire after lifetime and release to pool
- [ ] All pickups use Object Pool (no runtime allocation)
- [ ] Performance: pickup update for 200 pickups < 1ms per frame

## Open Questions

None — the Loot & Pickup System design is fully specified.
