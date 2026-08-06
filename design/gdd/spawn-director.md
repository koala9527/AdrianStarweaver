# Spawn Director

> **Status**: Designed
> **Author**: user + Claude
> **Last Updated**: 2026-03-28
> **Implements Pillar**: 构筑优先于操作 (Build over Execution) — dynamic spawning tests the player's build, not reflexes

## Overview

The Spawn Director is the "game master" that controls enemy wave generation throughout a 12-minute run. Rather than scripted spawn tables, it uses a budget-based system (guide.md §10.3) that dynamically adjusts wave composition based on elapsed time, player power level, current enemy count, and intensity targets. The Director ensures the game feels challenging but fair: strong players face tougher waves, weak players get breathing room. It controls the pacing curve from the gentle early game through the intense late game to the boss climax.

## Player Fantasy

The player should feel a rising tide of pressure that matches their growing power. Early game feels manageable — "I can handle this." Mid game introduces variety and density — "things are getting serious." Late game is a flood — "my build is being tested." The Director should never feel unfair (sudden impossible spike) or boring (long stretches of nothing). The fantasy is: "the game knows how strong I am and keeps pushing me."

## Detailed Design

### Core Rules

1. The Spawn Director runs on a **tick interval** of 2 seconds. Every tick, it evaluates whether to spawn a new wave.

2. **Budget System** (from guide.md §10.3):
   ```
   spawnBudget = baseBudgetByTime × playerPowerAdjust × intensityFactor
   ```
   The budget is spent on enemies — each enemy type has a `spawnCost`. The Director selects enemy compositions that fit within the budget.

3. **Spawn Condition**: A new wave spawns when:
   - `currentEnemyCount < maxEnemies` (room on screen)
   - `timeSinceLastSpawn >= spawnInterval` (cooldown between waves)
   - Budget is sufficient for at least 1 enemy

4. **Wave Composition**: The Director picks enemies from a weighted pool based on the current phase:

   | Phase | Available Enemies | Composition Bias |
   |-------|------------------|-----------------|
   | EARLY (0–2min) | Slime, Skeleton | 80% Slime, 20% Skeleton |
   | MID_EARLY (2–4min) | Slime, Skeleton, Ranged Caster | Add ranged variety |
   | MID (4–7min) | All normal types | Balanced mix, introduce Charger + Splitter |
   | MID_LATE (7–9min) | All normal types | Higher budget, more Shield Brutes |
   | LATE (9–11min) | All normal types | Maximum pressure, dense waves |
   | BOSS (11–12min) | Reduced normals | Thin spawns — boss is the focus |

5. **Spawn Position**: Enemies spawn outside the camera view but within a ring around the player:
   ```
   spawnDistance = random(viewWidth/2 + 50, viewWidth/2 + 150)
   spawnAngle = random(0, 2π)
   spawnPos = player.position + (cos(angle), sin(angle)) × distance
   ```
   Clamped to map bounds.

6. **Wave Size**: Each wave spawns `budgetToSpend / avgEnemyCost` enemies, spread over 0.5s (staggered, not all at once) to avoid visual pop-in.

7. **Max Enemies on Screen**: Hard cap of 120 active enemies. If at cap, Director waits until kills free up slots.

8. **Intensity Curve** (per phase):

   | Phase | baseBudget/tick | spawnInterval | maxEnemies target |
   |-------|----------------|---------------|-------------------|
   | EARLY | 3 | 3.0s | 20 |
   | MID_EARLY | 6 | 2.5s | 40 |
   | MID | 10 | 2.0s | 60 |
   | MID_LATE | 15 | 1.5s | 80 |
   | LATE | 20 | 1.0s | 100 |
   | BOSS | 5 | 4.0s | 30 |

9. **Player Power Adjustment**: The Director estimates player power from kills-per-minute:
   ```
   kpm = recentKills / timePeriod  (rolling 30-second window)
   playerPowerAdjust = clamp(kpm / expectedKpm, 0.7, 1.5)
   ```
   If the player is clearing faster than expected, budget increases. If struggling, budget decreases.

10. **Public KPM API**: The Director exposes `getKPM(): number` for external systems (Upgrade Pool System uses it for AOE bonus scoring). Returns the current rolling KPM value.

10. **Elite Spawning**: Elites are not part of normal waves. They are triggered by the Event System at specific times (3min, 9min). The Spawn Director provides a `spawnElite(eliteType, position)` method that the Event System calls.

11. **Boss Spawning**: At 11:00, the Event System calls `spawnBoss()`. The Director spawns the boss at a fixed distance from the player and reduces normal spawn rates.

### States and Transitions

| State | Entry | Exit | Behavior |
|-------|-------|------|----------|
| **Spawning** | Run starts | Run ends | Normal tick-based wave generation |
| **Boss Phase** | BOSS phase begins (11:00) | Run ends | Reduced normal spawns, boss active |
| **Paused** | Game paused | Game resumed | No spawning |

### Interactions with Other Systems

| System | Direction | Interface |
|--------|-----------|-----------|
| Enemy System | Calls | `enemyPool.acquire()` + configure with type/stats/position |
| Game Timer | Reads from | `getElapsed()` and `getPhase()` for budget and composition |
| Event Bus | Subscribes/Emits | Subscribes to `ENEMY_KILL` (track count, KPM); emits `WAVE_START` |
| Event System | Called by | `spawnElite()` and `spawnBoss()` for scripted spawns |
| Player Controller | Reads from | Player position for spawn ring calculation |

## Formulas

### Spawn Budget
```
baseBudgetByTime = phaseConfig[currentPhase].baseBudget
playerPowerAdjust = clamp(kpm / expectedKpm[currentPhase], 0.7, 1.5)
intensityFactor = 1.0 + sin(elapsed × 0.5) × 0.2  // gentle wave oscillation
spawnBudget = floor(baseBudgetByTime × playerPowerAdjust × intensityFactor)
```

| Variable | Type | Range | Description |
|----------|------|-------|-------------|
| baseBudgetByTime | int | 3–20 | Per-phase base budget |
| playerPowerAdjust | float | 0.7–1.5 | KPM-based scaling |
| intensityFactor | float | 0.8–1.2 | Sine wave for micro-pacing |
| expectedKpm | float | 10–60 | Expected kills/min per phase |

### Expected KPM by Phase
| Phase | Expected KPM |
|-------|-------------|
| EARLY | 15 |
| MID_EARLY | 25 |
| MID | 40 |
| MID_LATE | 50 |
| LATE | 60 |

### Spawn Ring Position
```
angle = random(0, 2π)
distance = random(viewHalfWidth + 50, viewHalfWidth + 150)
x = player.x + cos(angle) × distance
y = player.y + sin(angle) × distance
x = clamp(x, mapBounds.left + margin, mapBounds.right - margin)
y = clamp(y, mapBounds.top + margin, mapBounds.bottom - margin)
```

## Edge Cases

| Scenario | Expected Behavior | Rationale |
|----------|------------------|-----------|
| Player at map corner | Spawn ring clamped to map bounds — enemies may cluster from fewer directions | Acceptable — player chose the corner |
| Max enemies reached | Director waits, no spawning until kills free slots | Prevents performance issues |
| Player KPM is 0 (not killing anything) | playerPowerAdjust = 0.7 (minimum) — still spawns but at reduced rate | Player must face some pressure |
| Player KPM extremely high | playerPowerAdjust = 1.5 (capped) — prevents runaway difficulty | Cap prevents impossible scaling |
| Boss phase but normal enemies still alive | Existing enemies persist, new normal spawns reduced | Gradual transition, not instant clear |
| Game paused during spawn stagger | Stagger timer pauses with game | Consistent pause |
| Spawn position overlaps player | Minimum spawn distance (viewWidth/2 + 50) prevents this | Enemies always spawn off-screen |

## Dependencies

| System | Direction | Nature of Dependency |
|--------|-----------|---------------------|
| Enemy System | Upstream | Hard — spawns enemies via pool |
| Game Timer | Upstream | Hard — reads time and phase |
| Event Bus | Upstream | Hard — tracks kills for KPM |

**Depended on by:**

| System | Nature |
|--------|--------|
| Event System | Soft — calls spawnElite/spawnBoss |
| Boss System | Soft — calls spawnBoss |
| Upgrade Pool System | Soft — reads getKPM() for AOE bonus scoring |

## Tuning Knobs

| Parameter | Current Value | Safe Range | Effect of Increase | Effect of Decrease |
|-----------|--------------|------------|-------------------|-------------------|
| `TICK_INTERVAL` | 2.0s | 1.0–4.0s | More frequent spawn checks | Less frequent |
| `MAX_ENEMIES` | 120 | 60–200 | More on-screen chaos | Calmer battlefield |
| `POWER_ADJUST_MIN` | 0.7 | 0.5–0.9 | Less mercy for weak players | More mercy |
| `POWER_ADJUST_MAX` | 1.5 | 1.2–2.0 | Harder for strong players | Less punishment for efficiency |
| `KPM_WINDOW` | 30s | 15–60s | More responsive to recent performance | Smoother, slower adjustment |
| `STAGGER_DURATION` | 0.5s | 0.2–1.0s | Slower wave arrival | Faster pop-in |
| `SPAWN_RING_MIN` | viewWidth/2 + 50 | +30 to +100 | Spawn further away | Spawn closer |
| `SPAWN_RING_MAX` | viewWidth/2 + 150 | +80 to +250 | Wider spawn ring | Tighter ring |
| Phase budgets/intervals | See table above | Adjustable per phase | Shifts difficulty curve | Shifts difficulty curve |

## Visual/Audio Requirements

| Event | Visual Feedback | Audio Feedback | Priority |
|-------|----------------|---------------|----------|
| Wave spawn | Enemies fade in at spawn positions | None (enemies appear silently) | MVP |
| Intensity spike | None (invisible system) | Music intensity layer (Alpha) | Alpha |

## UI Requirements

N/A — The Spawn Director is invisible. Enemy count is visible through the battlefield itself.

## Acceptance Criteria

- [ ] Enemies spawn outside camera view in a ring around the player
- [ ] Spawn budget scales correctly per phase
- [ ] Player power adjustment responds to KPM within 0.7–1.5 range
- [ ] Wave composition matches phase-appropriate enemy types
- [ ] Max enemy cap (120) is respected
- [ ] Spawn stagger spreads enemies over 0.5s (no instant pop-in)
- [ ] Boss phase reduces normal spawn rate
- [ ] `spawnElite()` and `spawnBoss()` work when called by Event System
- [ ] Spawning pauses when game is paused
- [ ] Spawn positions clamped to map bounds
- [ ] All spawn parameters are data-driven
- [ ] Performance: Director tick < 0.5ms

## Open Questions

None — the Spawn Director design is fully specified.
