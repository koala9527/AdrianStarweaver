# Game Timer

> **Status**: Designed
> **Author**: user + Claude
> **Last Updated**: 2026-03-28
> **Implements Pillar**: N/A — invisible infrastructure that drives the 12-minute run pacing

## Overview

The Game Timer is the master clock for a single run. It tracks elapsed time from run start, drives the Spawn Director's intensity curve, triggers timed events (elite spawns, guardian circles, boss), and determines the run's end condition. The timer runs at real-time speed, pauses when the game is paused (e.g., level-up panel), and is displayed on the HUD. It is the backbone of the game's pacing — every system that cares about "when" something happens reads from the Game Timer.

## Player Fantasy

The Game Timer creates a sense of escalating urgency. Early on, the timer is just a number. By minute 7-8, the player glances at it nervously — "how much longer can I survive?" By minute 11, the boss music kicks in and the timer becomes a countdown to the climax. The fantasy is: "every second I survive, I'm getting stronger, but the world is getting more dangerous."

## Detailed Design

### Core Rules

1. The Game Timer starts at `0.00` when `RunScene` begins and counts up in seconds.
2. Time advances by `delta` each frame (Phaser's `scene.time.delta / 1000`), accumulating into `elapsedTime: number` (in seconds).
3. The timer **pauses** when the game is paused (level-up panel, pause menu). Paused time does not count toward elapsed time.
4. The timer exposes:
   - `getElapsed(): number` — total elapsed seconds (excluding paused time)
   - `getPhase(): RunPhase` — current phase of the run based on elapsed time
   - `isPaused(): boolean`
   - `pause() / resume()` — called by systems that pause gameplay

5. **Pause Cascade Protocol**: When `pause()` is called, the Game Timer sets `isPaused = true` and calls `this.scene.time.paused = true` and `this.scene.physics.pause()` on the RunScene. This freezes:
   - All Phaser timer events (spell cooldowns, status effect ticks, spawn intervals)
   - All Arcade Physics bodies (projectiles, enemies, player movement)
   - The Game Timer's own `elapsedTime` accumulation

   Systems that poll `isPaused()` (Player Controller, Spell System) use it as a secondary guard. The primary freeze mechanism is Phaser's scene-level pause. On `resume()`, the Game Timer calls `this.scene.time.paused = false` and `this.scene.physics.resume()`, restoring all frozen state.
5. The timer emits events on the Event Bus:
   - `RUN_START` — when the timer begins
   - `RUN_END` — when the run ends (survival, boss kill, or player death)
   - `PHASE_CHANGE` — when the run transitions between phases
6. Run phases (from guide.md §5.3):

   | Phase | Time Range | Description |
   |-------|-----------|-------------|
   | `EARLY` | 0:00 – 2:00 | Tutorial feel, few enemies, player gets 2nd spell |
   | `MID_EARLY` | 2:00 – 4:00 | First build forming, first elite |
   | `MID` | 4:00 – 7:00 | Wave intensity rises, 3rd/4th spell slots |
   | `MID_LATE` | 7:00 – 9:00 | Event pressure, area danger mechanics |
   | `LATE` | 9:00 – 11:00 | High-pressure waves, push to complete build |
   | `BOSS` | 11:00 – 12:00 | Boss fight and resolution |

7. The run ends when one of these conditions is met:
   - Player HP reaches 0 → `RUN_END { survived: false, time: elapsed, cause: 'death' }`
   - Boss is defeated → `RUN_END { survived: true, time: elapsed, cause: 'boss_killed' }`
   - Timer exceeds hard cap (14:00) → `RUN_END { survived: true, time: elapsed, cause: 'timeout' }` (safety net if boss fight drags)

### States and Transitions

| State | Entry Condition | Exit Condition | Behavior |
|-------|----------------|----------------|----------|
| **Running** | `RUN_START` emitted | Pause requested or run ends | Timer advances by delta each frame |
| **Paused** | Level-up panel opens or pause menu | Panel closes or resume called | Timer frozen, delta ignored |
| **Ended** | Run end condition met | Scene transition | Timer frozen, `RUN_END` emitted |

### Interactions with Other Systems

| System | Direction | Interface |
|--------|-----------|-----------|
| Spawn Director | Downstream reads | `getElapsed()` and `getPhase()` to scale wave intensity |
| Event System | Downstream reads | `getElapsed()` to trigger timed events (elite at 3:00, etc.) |
| HUD | Downstream reads | `getElapsed()` to display timer |
| XP & Level-Up System | Upstream pauses | Calls `pause()` when level-up panel opens, `resume()` on close |
| Combat System | Upstream triggers end | Emits player death → Game Timer emits `RUN_END` |
| Boss System | Upstream triggers end | Emits `BOSS_DEFEATED` → Game Timer emits `RUN_END` |
| Event Bus | Used for | Emits `RUN_START`, `RUN_END`, `PHASE_CHANGE` |

## Formulas

```
elapsedTime += isPaused ? 0 : (delta / 1000)
currentPhase = phaseTable.find(p => elapsedTime >= p.start && elapsedTime < p.end)
```

| Variable | Type | Range | Description |
|----------|------|-------|-------------|
| elapsedTime | float | 0 – 840 (14 min max) | Accumulated run time in seconds |
| delta | float | ~16.6ms at 60fps | Frame delta from Phaser |
| currentPhase | RunPhase enum | EARLY – BOSS | Current run phase |

Phase boundaries:

| Phase | Start (s) | End (s) |
|-------|----------|---------|
| EARLY | 0 | 120 |
| MID_EARLY | 120 | 240 |
| MID | 240 | 420 |
| MID_LATE | 420 | 540 |
| LATE | 540 | 660 |
| BOSS | 660 | 840 |

## Edge Cases

| Scenario | Expected Behavior | Rationale |
|----------|------------------|-----------|
| Multiple pause calls without resume | Pause is idempotent — timer stays paused, no stack counting | Prevents stuck-paused bugs |
| Resume called when not paused | No-op | Safe to call unconditionally |
| Player dies during pause (level-up panel) | Not possible — combat is frozen during pause | Pause freezes all systems |
| Boss killed before 11:00 (early boss trigger) | Run ends immediately with `boss_killed` cause | Boss kill always ends the run regardless of timer |
| Timer reaches 14:00 hard cap | Run ends with `timeout` cause | Safety net — should never happen in normal play |
| Frame rate drops cause large delta | Single frame delta capped at 100ms (0.1s) to prevent time jumps | Prevents timer skipping phases on lag spikes |

## Dependencies

| System | Direction | Nature of Dependency |
|--------|-----------|---------------------|
| Event Bus | Upstream | Uses Event Bus to emit RUN_START, RUN_END, PHASE_CHANGE |

**Depended on by:** Spawn Director, Event System, HUD, Boss System, XP & Level-Up System (via phase/time reads and pause/resume). All are hard dependencies.

## Tuning Knobs

| Parameter | Current Value | Safe Range | Effect of Increase | Effect of Decrease |
|-----------|--------------|------------|-------------------|-------------------|
| `RUN_DURATION` | 720s (12 min) | 300–900s | Longer runs, more build time | Shorter, more intense runs |
| `HARD_CAP` | 840s (14 min) | RUN_DURATION + 60–180s | More boss fight time | Tighter safety net |
| `MAX_DELTA` | 100ms | 50–200ms | Tolerates worse lag | Stricter time accuracy |
| Phase boundaries | See table above | Adjustable per phase | Shifts pacing curve | Shifts pacing curve |

## Visual/Audio Requirements

N/A — The Game Timer has no direct visual/audio output. The HUD reads from it to display the clock.

## UI Requirements

N/A — Timer display is owned by the HUD system, not the Game Timer itself.

## Acceptance Criteria

- [ ] Timer starts at 0 and counts up in real-time seconds
- [ ] Timer pauses when `pause()` is called and resumes on `resume()`
- [ ] Paused time is not counted in `getElapsed()`
- [ ] `getPhase()` returns correct phase for all time ranges
- [ ] `PHASE_CHANGE` event fires exactly once per phase transition
- [ ] `RUN_START` fires when timer begins
- [ ] `RUN_END` fires on player death, boss kill, or hard cap timeout
- [ ] Frame delta capped at 100ms to prevent time jumps
- [ ] Multiple `pause()` calls are idempotent
- [ ] Timer accuracy: within 0.1s of real elapsed time over a 12-minute run

## Open Questions

None — the Game Timer design is fully specified.
