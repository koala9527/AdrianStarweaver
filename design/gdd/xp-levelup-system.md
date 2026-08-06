# XP & Level-Up System

> **Status**: Designed
> **Author**: user + Claude
> **Last Updated**: 2026-03-28
> **Implements Pillar**: 构筑优先于操作 (Build over Execution) — level-ups are the primary build decision points

## Overview

The XP & Level-Up System accumulates experience from collected XP orbs, determines when the player levels up, pauses gameplay, requests 3 candidate cards from the Upgrade Pool System, presents them via the Level-Up Panel, processes the player's choice through the Build System, and resumes gameplay. It is the metronome of the build loop — every 20–40 seconds, the player gets a meaningful decision that shapes their run. The system also handles multi-level-ups (if enough XP is gained at once to skip levels) by queuing sequential level-up prompts.

## Player Fantasy

Level-ups are the heartbeat of excitement. The XP bar fills, the game pauses, and three glowing cards appear. The player scans their options, weighs synergies, and makes a choice that immediately changes how their build performs. The fantasy is: "every level-up makes me noticeably stronger, and I chose HOW I got stronger."

## Detailed Design

### Core Rules

1. The system subscribes to `XP_GAINED` events on the Event Bus. Each event adds `amount` to the player's current XP.

2. **Level-Up Check**: After adding XP, check if `currentXp >= expToNext`:
   ```
   while (currentXp >= expToNext):
     currentXp -= expToNext
     player.level += 1
     expToNext = calculateExpToNext(player.level)
     pendingLevelUps += 1
   ```

3. **Level-Up Flow**:
   ```
   1. pendingLevelUps > 0
   2. Pause game (Game Timer, physics, enemy AI, spell casting)
   3. Request 3 cards from Upgrade Pool System
   4. Display cards via Level-Up Panel
   5. Player selects a card
   6. Emit UPGRADE_CHOSEN event (Build System applies it)
   7. Emit LEVEL_UP event { newLevel }
   8. pendingLevelUps -= 1
   9. If pendingLevelUps > 0: repeat from step 3 (stay paused)
   10. Resume game
   ```

4. **XP Threshold Formula** (from player-controller.md):
   ```
   expToNext = floor(baseExp × (1 + (level - 1) × growthRate))
   ```
   With baseExp=10, growthRate=0.4: Lv2=10, Lv5=24, Lv10=46, Lv15=66, Lv20=86

5. **Pause Mechanism**: The system calls `gameTimer.pause()` which freezes all time-dependent systems. Physics bodies stop. Enemy AI stops. Spells stop casting. Projectiles in flight freeze. Only the Level-Up Panel UI is interactive.

6. **Resume Mechanism**: After all pending level-ups are resolved, call `gameTimer.resume()`. All systems resume from their frozen state.

7. **XP Bar**: The system exposes `currentXp` and `expToNext` for the HUD to display a progress bar.

8. **Level Cap**: Soft cap at level 30. XP continues to accumulate but no level-up triggers. In a 12-minute run, expected max level is ~20–25.

### States and Transitions

| State | Entry | Exit | Behavior |
|-------|-------|------|----------|
| **Accumulating** | Run starts | XP reaches threshold | Collecting XP, updating bar |
| **Leveling** | Threshold reached | All pending level-ups resolved | Game paused, showing cards |

### Interactions with Other Systems

| System | Direction | Interface |
|--------|-----------|-----------|
| Event Bus | Subscribes/Emits | Subscribes to `XP_GAINED`; emits `LEVEL_UP`, `UPGRADE_CHOSEN` |
| Upgrade Pool System | Calls | `generateCandidates(buildState, playerState)` → 3 cards |
| Build System | Triggers | `UPGRADE_CHOSEN` event applies the selected card |
| Game Timer | Calls | `pause()` / `resume()` for level-up flow |
| Level-Up Panel | Delegates to | Passes 3 cards for display; receives player selection callback |
| Player Controller | Modifies | Increments `level`, updates `expToNext` |
| HUD | Reads from | `currentXp`, `expToNext` for XP bar display |
| Loot & Pickup System | Receives from | `XP_GAINED` events from collected orbs |

## Formulas

### XP Threshold
```
expToNext = floor(10 × (1 + (level - 1) × 0.4))
```

| Level | XP to Next | Cumulative XP |
|-------|-----------|---------------|
| 2 | 10 | 10 |
| 5 | 24 | 62 |
| 10 | 46 | 192 |
| 15 | 66 | 472 |
| 20 | 86 | 852 |
| 25 | 106 | 1332 |

### Expected Level-Up Frequency
```
avgTimeBetweenLevelUps ≈ expToNext / (avgXpPerSecond)
```
Early game (~2 XP/s): level every 5s. Mid game (~5 XP/s): level every 9s. Late game (~8 XP/s): level every 11s.

Target: one level-up every 20–40 seconds throughout the run (guide.md §4.1).

## Edge Cases

| Scenario | Expected Behavior | Rationale |
|----------|------------------|-----------|
| Enough XP for 3 levels at once | Queue 3 sequential level-up prompts, stay paused until all resolved | Multi-level from big XP drops (elite kill) |
| Player gains XP during level-up pause | Not possible — game is paused, no kills/pickups | Consistent pause |
| Level 30 reached | XP bar shows "MAX", no more level-up prompts | Soft cap |
| XP gained exactly equals threshold | Level up triggers (>= check) | Clean boundary |
| Player closes browser during level-up | Run lost — no mid-run save | Consistent with Scene Manager design |
| Level-up triggered at same frame as run end | Level-up takes priority — resolve it, then end run | Player gets their final upgrade |

## Dependencies

| System | Direction | Nature of Dependency |
|--------|-----------|---------------------|
| Loot & Pickup System | Upstream | Hard — receives XP_GAINED events |
| Upgrade Pool System | Upstream | Hard — generates candidate cards |
| Game Timer | Upstream | Hard — calls pause()/resume() for level-up flow |
| Player Controller | Downstream | Hard — increments level, writes expToNext to PlayerState |
| Event Bus | Upstream | Hard — subscribes/emits events |

**Depended on by:**

| System | Nature |
|--------|--------|
| Level-Up Panel | Hard — receives cards to display |
| HUD | Hard — reads XP bar data |
| Build System | Soft — receives UPGRADE_CHOSEN |

## Tuning Knobs

| Parameter | Current Value | Safe Range | Effect of Increase | Effect of Decrease |
|-----------|--------------|------------|-------------------|-------------------|
| `BASE_EXP` | 10 | 5–20 | Slower early leveling | Faster early leveling |
| `EXP_GROWTH_RATE` | 0.4 | 0.2–0.8 | Steeper curve, slower late levels | Flatter, more consistent |
| `LEVEL_CAP` | 30 | 20–40 | More upgrades possible | Fewer total upgrades |

Most XP tuning is done via enemy XP values (Enemy System) and pickup values (Loot System).

## Visual/Audio Requirements

| Event | Visual Feedback | Audio Feedback | Priority |
|-------|----------------|---------------|----------|
| XP bar filling | Smooth bar animation | None | MVP |
| Level-up triggered | Screen flash, XP bar burst | Level-up fanfare SFX | MVP (visual), Alpha (audio) |
| Multi-level-up | Level counter increments between each card selection | None | MVP |

## UI Requirements

| Information | Display Location | Update Frequency | Condition |
|-------------|-----------------|-----------------|-----------|
| XP bar | HUD bottom area | Every XP_GAINED event | Always during run |
| Current level | HUD near XP bar | On level-up | Always |
| "MAX" indicator | Replaces XP bar | On reaching cap | At level 30 |

## Acceptance Criteria

- [ ] XP accumulates correctly from XP_GAINED events
- [ ] Level-up triggers when XP reaches threshold
- [ ] Multi-level-ups queue and resolve sequentially
- [ ] Game pauses during level-up (all systems frozen)
- [ ] 3 cards generated and passed to Level-Up Panel
- [ ] Player selection emits UPGRADE_CHOSEN and LEVEL_UP events
- [ ] Game resumes after all pending level-ups resolved
- [ ] XP threshold follows formula: floor(10 × (1 + (level-1) × 0.4))
- [ ] Level cap at 30 stops level-up prompts
- [ ] XP bar displays correctly on HUD
- [ ] Performance: XP check < 0.01ms per event

## Open Questions

None — the XP & Level-Up System design is fully specified.
