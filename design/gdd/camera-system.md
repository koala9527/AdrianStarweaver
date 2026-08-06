# Camera System

> **Status**: Designed
> **Author**: user + Claude
> **Last Updated**: 2026-03-28
> **Implements Pillar**: 战场信息要清楚 (Battlefield Readability) — camera framing ensures the player can read the battlefield at all times

## Overview

The Camera System controls the game's viewport during a run. It uses Phaser's built-in camera to follow the player with smooth lerp-based tracking, keeping the mage centered while allowing slight lead in the movement direction. The camera is bounded to the map edges so it never shows void space. During boss encounters, the camera may shake or zoom slightly to emphasize impact. The system is simple by design — in a top-down auto-cast game, the camera should never distract from the action.

## Player Fantasy

The camera should feel like an invisible companion that always shows exactly what the player needs to see. During normal play, it tracks smoothly without the player ever thinking about it. During intense moments (boss slam, big explosion), a subtle screen shake adds weight and impact. The fantasy is: "I always see what matters — enemies approaching, pickups nearby, danger zones ahead."

## Detailed Design

### Core Rules

1. The camera uses Phaser's `this.cameras.main.startFollow(player, true, lerpX, lerpY)` for smooth tracking.
2. Lerp values control how quickly the camera catches up to the player:
   - `lerpX`: 0.1 (smooth horizontal follow)
   - `lerpY`: 0.1 (smooth vertical follow)
3. The camera is bounded to the map dimensions via `this.cameras.main.setBounds(0, 0, mapWidth, mapHeight)` — it never shows outside the playable area.
4. Camera zoom is fixed at `1.0` for normal gameplay. The viewport shows enough area for the player to react to incoming enemies (approximately 800×600 game units visible at default resolution).
5. Screen shake is available for impact moments:
   - `shake(duration, intensity)` — called by VFX/Combat systems via Event Bus
   - Light shake: `shake(100, 0.005)` — elite hit, big spell
   - Heavy shake: `shake(200, 0.01)` — boss attack, player near-death
6. The camera is created and configured in `RunScene.create()`. No camera exists in Menu or Result scenes (they use default Phaser camera with no special behavior).
7. Resolution and viewport:
   - Game resolution: 1280×720 (16:9)
   - The camera renders at this resolution; CSS scales to fill the browser window
   - Phaser's `ScaleManager` handles responsive scaling (`Phaser.Scale.FIT`)

### States and Transitions

| State | Entry Condition | Exit Condition | Behavior |
|-------|----------------|----------------|----------|
| **Following** | RunScene starts | Run ends | Smooth lerp follow on player |
| **Shaking** | Shake triggered | Duration expires | Follow + oscillation overlay |

Shaking is an overlay on Following — the camera still tracks the player while shaking. These are not exclusive states.

### Interactions with Other Systems

| System | Direction | Interface |
|--------|-----------|-----------|
| Player Controller | Upstream | Camera follows the player sprite's position |
| Scene Manager | Upstream | Camera is created/destroyed with RunScene lifecycle |
| Combat System | Upstream triggers | Subscribes to `BOSS_SPAWN` for potential zoom, `PLAYER_DAMAGED` for shake |
| VFX / Particle System | Upstream triggers | May request shake on big explosions |
| Event Bus | Subscribes | Listens for shake-triggering events |

## Formulas

Camera follow (handled by Phaser internally):

```
cameraX += (playerX - cameraX) * lerpX
cameraY += (playerY - cameraY) * lerpY
cameraX = clamp(cameraX, bounds.left + viewWidth/2, bounds.right - viewWidth/2)
cameraY = clamp(cameraY, bounds.top + viewHeight/2, bounds.bottom - viewHeight/2)
```

| Variable | Type | Range | Description |
|----------|------|-------|-------------|
| lerpX, lerpY | float | 0.05–0.3 | Follow smoothness (lower = smoother, higher = snappier) |
| viewWidth | int | 1280 | Viewport width in game units |
| viewHeight | int | 720 | Viewport height in game units |

## Edge Cases

| Scenario | Expected Behavior | Rationale |
|----------|------------------|-----------|
| Player at map corner | Camera stops at bounds, player moves toward screen edge | Never show void outside map |
| Multiple shakes triggered simultaneously | Shakes stack additively (Phaser default) | Feels more impactful during chaotic moments |
| Player moves very fast (dash, if added) | Lerp naturally handles — camera catches up smoothly | No special case needed |
| Browser window resized | Phaser ScaleManager re-fits, camera viewport unchanged | Responsive scaling handled by engine |
| Game paused during shake | Shake timer pauses with game (Phaser time scale) | Shake doesn't expire during pause |

## Dependencies

| System | Direction | Nature of Dependency |
|--------|-----------|---------------------|
| Scene Manager | Upstream | Camera exists within RunScene context |

**Depended on by:** No systems directly depend on the Camera System. It is a leaf node — other systems don't read camera state. (Boss System may trigger camera effects but doesn't depend on camera output.)

## Tuning Knobs

| Parameter | Current Value | Safe Range | Effect of Increase | Effect of Decrease |
|-----------|--------------|------------|-------------------|-------------------|
| `LERP_X` | 0.1 | 0.05–0.3 | Snappier follow, less smooth | Smoother, more floaty |
| `LERP_Y` | 0.1 | 0.05–0.3 | Snappier follow | Smoother |
| `SHAKE_LIGHT_INTENSITY` | 0.005 | 0.002–0.01 | More noticeable shake | Subtler |
| `SHAKE_HEAVY_INTENSITY` | 0.01 | 0.005–0.02 | Dramatic shake | Subtler |
| `GAME_WIDTH` | 1280 | 960–1920 | See more of the map | Tighter view |
| `GAME_HEIGHT` | 720 | 540–1080 | See more of the map | Tighter view |

## Visual/Audio Requirements

| Event | Visual Feedback | Audio Feedback | Priority |
|-------|----------------|---------------|----------|
| Screen shake (light) | Camera oscillation 100ms | None | MVP |
| Screen shake (heavy) | Camera oscillation 200ms | Impact SFX (Alpha) | Alpha |

## UI Requirements

N/A — The Camera System has no UI elements. HUD elements are fixed to the screen (Phaser UI camera), not affected by camera movement.

## Acceptance Criteria

- [ ] Camera smoothly follows the player with configurable lerp
- [ ] Camera never shows area outside map bounds
- [ ] Screen shake triggers correctly on combat events
- [ ] Shake does not displace the camera permanently (returns to follow position)
- [ ] Game renders at 1280×720 and scales responsively to browser window
- [ ] Camera works correctly at map corners and edges
- [ ] HUD elements are unaffected by camera movement and shake
- [ ] Performance: camera update adds < 0.1ms per frame

## Open Questions

None — the Camera System design is fully specified.
