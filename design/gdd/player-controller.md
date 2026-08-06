# Player Controller

> **Status**: Designed
> **Author**: user + Claude
> **Last Updated**: 2026-03-28
> **Implements Pillar**: 构筑优先于操作 (Build over Execution) — player input is movement only; all combat is automatic

## Overview

The Player Controller manages the player character — the见习咒术师 (Apprentice Sorcerer). It reads the movement direction from the Input System, applies velocity to the player sprite, enforces map boundaries, manages the player's stat block (HP, move speed, power, crit, etc.), and serves as the central data container that other systems read from. The player does NOT attack, pick up items, or interact — those are handled automatically by the Spell System, Loot System, and other systems that reference the player's position and stats. The Player Controller owns the "what the player is" data; other systems own "what happens to the player."

## Player Fantasy

The player should feel like a nimble mage weaving through danger. Movement is responsive and precise — when surrounded by enemies, the player can thread through gaps with confidence. The mage feels light but not floaty, fast but not twitchy. The fantasy is: "I'm always one step ahead of the horde because my movement is perfect."

## Detailed Design

### Core Rules

1. The Player Controller is a Phaser `Sprite` subclass with an Arcade Physics body.
2. Each frame, it reads `inputSystem.getDirection()` and sets velocity:
   ```
   body.setVelocity(direction.x * moveSpeed, direction.y * moveSpeed)
   ```
3. The player sprite has a circular physics body (radius ~12px) for smooth collision with enemies and map boundaries.
4. The player is constrained to the map via `body.setCollideWorldBounds(true)` (world bounds match map bounds).
5. The Player Controller owns the `PlayerState` data structure (from guide.md §14.2):
   ```ts
   interface PlayerState {
     hp: number;
     maxHp: number;
     moveSpeed: number;
     power: number;          // spell damage multiplier (法强)
     critChance: number;     // 0.0 – 1.0
     critDamage: number;     // multiplier, e.g., 1.5 = 150%
     cooldownRate: number;   // 0.0 – 1.0 (0= no reduction, 0.5 = 50% faster)
     pickupRadius: number;
     shield: number;
     hpRegen: number;        // HP per second
     spellSlots: SpellSlotState[];  // max 4
     relics: string[];
     tags: string[];         // element affinities, build tags
     level: number;
     expToNext: number;
   }
   ```
6. Base stats (from guide.md §6.2):
   | Stat | Base Value |
   |------|-----------|
   | maxHp | 100 |
   | moveSpeed | 220 |
   | power | 1.0 |
   | cooldownRate | 0 |
   | pickupRadius | 80 |
   | critChance | 0.05 |
   | critDamage | 1.5 |
   | shield | 0 |
   | hpRegen | 0.5 |
   | spellSlots | 1 (max 4) |

7. The Player Controller applies HP regeneration each second: `hp = min(hp + hpRegen, maxHp)`.
8. The Player Controller does NOT handle:
   - Taking damage (owned by Combat System)
   - Casting spells (owned by Spell System)
   - Collecting pickups (owned by Loot & Pickup System)
   - Leveling up (owned by XP & Level-Up System)
   - These systems modify `PlayerState` directly or via the Build System.
9. When the game is paused (level-up panel), the Player Controller skips its update — velocity is set to 0, no regen ticks.
10. The player sprite faces the movement direction (flip sprite horizontally based on `direction.x`). No rotation — top-down 2D sprite.

### States and Transitions

| State | Entry Condition | Exit Condition | Behavior |
|-------|----------------|----------------|----------|
| **Alive** | Run starts | HP reaches 0 | Normal movement, regen, all systems active |
| **Invulnerable** | After taking damage | 200ms timer expires | Flashing sprite, cannot take damage (i-frames) |
| **Dead** | HP reaches 0 | Scene transition | Movement stops, death animation plays, `RUN_END` triggered |
| **Paused** | Level-up panel opens | Panel closes | Velocity = 0, regen paused, sprite frozen |

Invulnerable is an overlay on Alive — the player can still move during i-frames.

### Interactions with Other Systems

| System | Direction | Interface |
|--------|-----------|-----------|
| Input System | Reads from | `getDirection()` every frame for movement |
| Combat System | Modified by | Calls `takeDamage(amount)` which reduces HP, triggers i-frames |
| Spell System | Reads from | Reads `position`, `power`, `critChance`, `critDamage`, `cooldownRate`, `spellSlots` |
| Loot & Pickup System | Reads from | Reads `position` and `pickupRadius` for auto-collection |
| Build System | Modifies | Applies stat changes from upgrades/relics to `PlayerState` |
| XP & Level-Up System | Modifies | Increments `level`, resets `exp`, modifies `expToNext` |
| HUD | Reads from | Reads `hp`, `maxHp`, `level`, `exp`, `expToNext`, `shield` |
| Camera System | Reads from | Follows player sprite position |
| Collision System | Interacts | Player body collides with map bounds and overlaps with enemies/pickups |
| Event Bus | Emits | `PLAYER_DAMAGED` (via Combat System), death triggers `RUN_END` |

## Formulas

### Movement
```
velocityX = direction.x * moveSpeed
velocityY = direction.y * moveSpeed
```
| Variable | Type | Range | Description |
|----------|------|-------|-------------|
| direction.x/y | float | -1.0 to 1.0 | Normalized input from Input System |
| moveSpeed | float | 110–440 | Base 220, modified by upgrades/relics |

### HP Regeneration
```
hp = min(hp + hpRegen * deltaSeconds, maxHp)
```
Applied once per second (accumulated via timer, not per-frame).

| Variable | Type | Range | Description |
|----------|------|-------|-------------|
| hpRegen | float | 0–5.0 | Base 0.5/s, increased by upgrades |
| maxHp | int | 50–500 | Base 100, increased by upgrades |

### Damage Intake (called by Combat System)
```
actualDamage = incomingDamage - shield
if (actualDamage < 1) actualDamage = 1   // minimum 1 damage
hp = hp - actualDamage
shield = max(0, shield - incomingDamage)
```
| Variable | Type | Range | Description |
|----------|------|-------|-------------|
| incomingDamage | float | 1–999 | Raw damage from enemy/hazard |
| shield | float | 0–100 | Absorbs damage before HP |

### Experience Curve

Owned by the XP & Level-Up System (see xp-levelup-system.md). The `expToNext` field in PlayerState is written by the XP & Level-Up System after each level-up. Player Controller stores the value but does not calculate it.

## Edge Cases

| Scenario | Expected Behavior | Rationale |
|----------|------------------|-----------|
| HP drops below 0 | Clamped to 0, death triggered | No negative HP display |
| Damage received during i-frames | Ignored entirely | i-frames are absolute protection |
| Multiple damage sources in same frame | First hit triggers i-frames, subsequent hits in same frame still apply (pre-i-frame). Next frame onward, i-frames block. | Prevents single-frame multi-hit from being completely negated |
| Shield absorbs more than damage | Shield reduced by damage amount, HP untouched. Shield does not go negative. | Shield is a buffer, not a reflector |
| moveSpeed reduced to 0 or below | Clamped to minimum 50 | Player must always be able to move (no perma-root) |
| HP regen while at full HP | No-op, no overhealing | Clean behavior |
| Level exceeds 30 | XP still collected but no level-up triggers. Stats can still be modified by other means. | Soft cap — shouldn't happen in 12-min run |
| Player pushed outside map bounds by physics | `setCollideWorldBounds(true)` prevents this | Phaser handles it |

## Dependencies

| System | Direction | Nature of Dependency |
|--------|-----------|---------------------|
| Input System | Upstream | Hard — reads direction every frame |
| Scene Manager | Upstream | Hard — exists within RunScene |

**Depended on by:**

| System | Nature |
|--------|--------|
| Spell System | Hard — reads position, stats, spell slots |
| Enemy System | Hard — enemies target player position |
| Combat System | Hard — applies damage to player |
| Loot & Pickup System | Hard — reads position and pickup radius |
| Build System | Hard — modifies player stats |
| XP & Level-Up System | Hard — increments level, writes expToNext |
| HUD | Hard — reads HP, level, XP for display |
| Camera System | Hard — follows player position |
| Collision System | Hard — player body participates in collisions |

## Tuning Knobs

| Parameter | Current Value | Safe Range | Effect of Increase | Effect of Decrease |
|-----------|--------------|------------|-------------------|-------------------|
| `BASE_MAX_HP` | 100 | 50–200 | More forgiving, longer survival | Harder, more punishing |
| `BASE_MOVE_SPEED` | 220 | 150–300 | Easier dodging, less tension | Harder to dodge, more pressure |
| `MIN_MOVE_SPEED` | 50 | 30–100 | Slow debuffs less punishing | Slow debuffs more dangerous |
| `BASE_POWER` | 1.0 | 0.5–2.0 | Stronger start, faster early clear | Weaker start, slower ramp |
| `BASE_CRIT_CHANCE` | 0.05 | 0.01–0.15 | More early crits | Crits feel rarer |
| `BASE_CRIT_DAMAGE` | 1.5 | 1.2–2.0 | Crits hit harder | Crits less impactful |
| `BASE_PICKUP_RADIUS` | 80 | 40–150 | Easier XP collection | Must walk closer to pickups |
| `BASE_HP_REGEN` | 0.5 | 0–2.0 | More forgiving | Must rely on healing upgrades |
| `I_FRAME_DURATION` | 200ms | 100–500ms | More forgiving after hit | Punishes getting hit harder |
| `EXP_BASE` | 10 | 5–20 | Slower leveling | Faster leveling |
| `EXP_GROWTH_RATE` | 0.4 | 0.2–0.8 | Steeper XP curve, slower late levels | Flatter curve, more consistent |
| `MAX_SPELL_SLOTS` | 4 | 3–6 | More build variety | Tighter build choices |

## Visual/Audio Requirements

| Event | Visual Feedback | Audio Feedback | Priority |
|-------|----------------|---------------|----------|
| Movement | Sprite animation (walk cycle) | Soft footstep loop (Alpha) | MVP (anim), Alpha (audio) |
| Damage taken | Sprite flash white, brief red tint | Hit SFX | MVP |
| Death | Death animation, fade out | Death SFX | MVP |
| i-frames | Sprite alpha flicker (0.3 ↔ 1.0) | None | MVP |

## UI Requirements

N/A — Player stats are displayed by the HUD system, not the Player Controller.

## Acceptance Criteria

- [ ] Player moves in 8 directions with normalized diagonal speed
- [ ] Player cannot move outside map boundaries
- [ ] Base stats match guide.md §6.2 values
- [ ] HP regeneration ticks correctly at configured rate
- [ ] Damage reduces HP (shield absorbs first), minimum 1 damage
- [ ] i-frames activate after taking damage, blocking subsequent hits for 200ms
- [ ] Player sprite flashes during i-frames
- [ ] Death triggers when HP reaches 0 — movement stops, `RUN_END` emitted
- [ ] Movement stops during pause (level-up panel)
- [ ] HP regen pauses during pause
- [ ] `PlayerState` is readable by all dependent systems
- [ ] `PlayerState` is modifiable by Build System and XP & Level-Up System
- [ ] moveSpeed cannot drop below minimum (50)
- [ ] Experience curve matches formula: level 2 at 10 XP, scaling at 40% per level
- [ ] Performance: Player Controller update < 0.1ms per frame

## Open Questions

None — the Player Controller design is fully specified.
