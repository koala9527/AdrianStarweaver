# Scene Manager

> **Status**: Designed
> **Author**: user + Claude
> **Last Updated**: 2026-03-28
> **Implements Pillar**: N/A — infrastructure that manages game flow between screens

## Overview

The Scene Manager orchestrates the game's top-level flow: Boot (asset loading) → Menu (title screen) → Run (gameplay) → Result (post-run summary), and back to Menu. It leverages Phaser's built-in scene system rather than building a custom solution. Each scene is a Phaser `Scene` subclass responsible for its own setup, update loop, and teardown. The Scene Manager's role is to define the transitions between scenes, pass data between them (e.g., run results from Run to Result), and ensure clean resource lifecycle at each boundary.

## Player Fantasy

The Scene Manager is invisible infrastructure. The player experiences it as smooth, instant transitions: the game loads quickly, starting a run feels snappy, and the result screen appears the moment the run ends. There should never be a blank screen, a loading spinner mid-session, or a "stuck" transition.

## Detailed Design

### Core Rules

1. The game uses Phaser's native scene management (`this.scene.start()`, `this.scene.launch()`). No custom scene manager class is needed — the design specifies how Phaser's scenes are configured and connected.
2. Four scenes exist:

   | Scene Key | Class | Purpose |
   |-----------|-------|---------|
   | `boot` | `BootScene` | Load all assets, show loading bar, then auto-transition to menu |
   | `menu` | `MenuScene` | Title screen, start game, codex/collection (Alpha), settings |
   | `run` | `RunScene` | The 12-minute gameplay session — owns all gameplay systems |
   | `result` | `ResultScene` | Post-run stats, build summary, unlock progress, replay button |

3. Scene transitions:
   - `boot` → `menu`: Automatic after all assets loaded
   - `menu` → `run`: Player clicks "Start Game"
   - `run` → `result`: `RUN_END` event fires (death, boss kill, or timeout)
   - `result` → `menu`: Player clicks "Back to Menu"
   - `result` → `run`: Player clicks "Play Again" (shortcut, skips menu)

4. Data passing between scenes uses Phaser's `this.scene.start(key, data)`:
   - `menu` → `run`: `{ startingPreference?: string }` (optional Alpha feature)
   - `run` → `result`: `{ survived: boolean, time: number, cause: string, buildSummary: BuildSnapshot, kills: number, level: number }`
   - `result` → `run`: same as menu → run

5. `RunScene` is the heavyweight scene. On `create()`, it instantiates all gameplay systems (Event Bus, Input, Object Pool, etc.) via a setup sequence. On `shutdown()`, it calls `destroy()` on all systems and releases all pooled objects. No gameplay state leaks between runs.

6. Asset loading happens entirely in `BootScene`. All sprites, audio, and data files are loaded once. `RunScene` does not load assets — it only references already-loaded resources.

7. Overlay scenes (e.g., a pause menu) can be launched on top of `RunScene` using `this.scene.launch('pause')` without stopping the run scene. For MVP, the level-up panel is NOT a separate scene — it's a UI layer within `RunScene` that pauses the game timer.

### States and Transitions

```
[Boot] --assets loaded--> [Menu] --start game--> [Run] --run ends--> [Result]
                            ^                                           |
                            |___________back to menu____________________|
                                                    |
                            [Run] <--play again-----|
```

Each scene is either active or inactive. Only one primary scene is active at a time (overlays excepted).

### Interactions with Other Systems

| System | Direction | Interface |
|--------|-----------|-----------|
| All gameplay systems | RunScene creates them | Instantiated in `RunScene.create()`, destroyed in `RunScene.shutdown()` |
| Save System | Menu/Result read | Menu reads unlock state; Result writes run stats |
| Meta-Progression | Result writes | Result scene triggers unlock calculations |
| Event Bus | RunScene owns | Created and destroyed with RunScene lifecycle |
| Game Timer | RunScene owns | Emits `RUN_END` which triggers scene transition to Result |

## Formulas

No formulas. Scene transitions are event-driven, not calculated.

The only timing concern is boot loading:

```
loadTime = totalAssetSize / downloadSpeed
```

**Target**: Boot → Menu transition in < 3 seconds on a typical broadband connection. Total asset budget for MVP: < 5MB.

## Edge Cases

| Scenario | Expected Behavior | Rationale |
|----------|------------------|-----------|
| Player refreshes browser during run | Run is lost — no mid-run save. Boot → Menu on reload. | LocalStorage only saves meta-progression, not run state |
| Asset fails to load in Boot | Show error message with retry button. Do not transition to Menu. | Prevents broken gameplay from missing assets |
| Player clicks "Play Again" rapidly | Debounce — ignore clicks for 500ms after first click | Prevents double scene start |
| RunScene shutdown while level-up panel is open | Level-up panel is dismissed, all systems destroyed normally | Panel is part of RunScene, not a separate scene |
| Browser tab hidden during run | Phaser pauses the game loop (requestAnimationFrame stops). Timer resumes on tab focus. | Standard browser behavior — no special handling needed |

## Dependencies

| System | Direction | Nature of Dependency |
|--------|-----------|---------------------|
| None | — | Foundation-layer system. Uses Phaser's built-in scene management. |

**Depended on by:** Camera System, Player Controller, Collision System, Audio System — all require a scene context to exist.

## Tuning Knobs

| Parameter | Current Value | Safe Range | Effect of Increase | Effect of Decrease |
|-----------|--------------|------------|-------------------|-------------------|
| `BOOT_MIN_DISPLAY` | 500ms | 0–2000ms | Loading screen visible longer (feels polished) | Faster boot (may flash) |
| `TRANSITION_DEBOUNCE` | 500ms | 200–1000ms | Slower scene switches | Risk of double-trigger |
| `ASSET_BUDGET_MB` | 5MB | 2–15MB | More/richer assets | Faster load times |

## Visual/Audio Requirements

| Event | Visual Feedback | Audio Feedback | Priority |
|-------|----------------|---------------|----------|
| Boot loading | Progress bar | None | MVP |
| Scene transition | Brief fade or cut | None (MVP), transition SFX (Alpha) | Alpha |

## UI Requirements

N/A — Each scene owns its own UI. The Scene Manager only handles transitions.

## Acceptance Criteria

- [ ] Boot scene loads all assets and transitions to Menu automatically
- [ ] Menu "Start Game" button transitions to RunScene
- [ ] RunScene instantiates all gameplay systems in `create()`
- [ ] RunScene destroys all systems cleanly in `shutdown()` — no memory leaks
- [ ] `RUN_END` event triggers transition from Run to Result with correct data
- [ ] Result screen displays run data passed from RunScene
- [ ] "Play Again" from Result starts a fresh RunScene (no stale state)
- [ ] "Back to Menu" from Result returns to MenuScene
- [ ] No blank screens or stuck transitions between any scenes
- [ ] Boot loading completes in < 3 seconds with MVP assets
- [ ] Rapid button clicks do not cause double scene transitions

## Open Questions

None — the Scene Manager design is fully specified.
