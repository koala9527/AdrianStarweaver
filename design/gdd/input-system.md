# Input System

> **Status**: Designed
> **Author**: user + Claude
> **Last Updated**: 2026-03-28
> **Implements Pillar**: 构筑优先于操作 (Build over Execution) — input is deliberately minimal (move only) so the player focuses on build decisions, not mechanical skill

## Overview

The Input System captures and normalizes player input from keyboard and mouse. Per the core design principle (guide.md §9.1), the player's only active control is **movement via WASD** — all attacks, pickups, and interactions are automatic. The mouse is used exclusively for UI selection (level-up cards, menus). This extreme simplicity is intentional: the game's depth comes from build decisions, not mechanical execution. The Input System outputs a normalized movement direction vector each frame, consumed by the Player Controller.

## Player Fantasy

The player should feel fluid and responsive when moving — the mage glides smoothly in any direction with zero input lag. Movement is the player's only verb, so it must feel perfect. The fantasy is: "I'm a wizard weaving through chaos, and my body goes exactly where I want." There should never be a moment where the player thinks "I pressed the key but nothing happened."

## Detailed Design

### Core Rules

1. The Input System reads keyboard state every frame via Phaser's `this.scene.input.keyboard` API.
2. It produces a single output: a **normalized direction vector** `{ x: number, y: number }` where each component is in the range `[-1, 1]` and the vector magnitude is clamped to `1.0` (diagonal movement is not faster than cardinal).
3. Key bindings:
   - `W` / `ArrowUp` → direction.y = -1
   - `S` / `ArrowDown` → direction.y = +1
   - `A` / `ArrowLeft` → direction.x = -1
   - `D` / `ArrowRight` → direction.x = +1
4. Multiple simultaneous keys are summed then normalized. E.g., W+D → `(1, -1)` normalized to `(0.707, -0.707)`.
5. Opposing keys cancel: W+S → `(0, 0)` (no movement).
6. The Input System does **not** move the player — it only provides the direction vector. The Player Controller reads this and applies movement speed, collision, etc.
7. Mouse position is tracked and exposed as `{ screenX, screenY, worldX, worldY }` for UI systems (level-up card selection, menu clicks).
8. Mouse clicks are **not** consumed by the Input System — Phaser's built-in interactive object system handles UI click events directly.
9. When the game is paused (e.g., level-up panel open), the Input System continues reading but the Player Controller ignores movement input. The Input System itself has no concept of pause.

### States and Transitions

The Input System is stateless. It reads hardware input and outputs a direction vector every frame. No modes, no state machine.

The only behavioral distinction is contextual: during gameplay, WASD drives movement; during UI overlays, mouse drives selection. But this distinction is handled by consumers (Player Controller ignores input during pause; UI panels consume mouse events), not by the Input System itself.

### Interactions with Other Systems

| System | Direction | Interface |
|--------|-----------|-----------|
| Player Controller | Downstream reads | `getDirection(): { x: number, y: number }` — called every frame |
| Level-Up Panel | Downstream reads (mouse) | Uses Phaser interactive objects directly, not the Input System |
| Menu UI | Downstream reads (mouse) | Uses Phaser interactive objects directly |

The Input System does not emit events on the Event Bus. Movement is polled every frame — event-based input would add latency and complexity for no benefit. The Input System is injected into the Player Controller via constructor.

## Formulas

The Input System performs one calculation: direction normalization.

```
rawX = (rightKey ? 1 : 0) - (leftKey ? 1 : 0)
rawY = (downKey ? 1 : 0) - (upKey ? 1 : 0)
magnitude = sqrt(rawX² + rawY²)
direction = magnitude > 0 ? { x: rawX / magnitude, y: rawY / magnitude } : { x: 0, y: 0 }
```

| Variable | Type | Range | Description |
|----------|------|-------|-------------|
| rawX | int | -1, 0, 1 | Horizontal key sum |
| rawY | int | -1, 0, 1 | Vertical key sum |
| magnitude | float | 0, 1, or √2 | Length before normalization |
| direction.x | float | -1.0 to 1.0 | Normalized horizontal |
| direction.y | float | -1.0 to 1.0 | Normalized vertical |

**Output**: Unit vector or zero vector. No other values possible.

## Edge Cases

| Scenario | Expected Behavior | Rationale |
|----------|------------------|-----------|
| No keys pressed | Direction = `(0, 0)` | Player stands still |
| Opposing keys (W+S or A+D) | Direction = `(0, 0)` on that axis | Cancel out — no drift |
| All 4 keys pressed | Direction = `(0, 0)` | Both axes cancel |
| Key held across scene transition | Keys are re-read from Phaser's keyboard state each frame; stale state is not possible | Phaser handles key-up on blur |
| Browser tab loses focus | Phaser fires key-up for all held keys automatically | Prevents "stuck key" on alt-tab |
| Player holds movement during level-up panel | Input System still outputs direction, but Player Controller ignores it while paused | Input System has no pause concept |

## Dependencies

| System | Direction | Nature of Dependency |
|--------|-----------|---------------------|
| None | — | The Input System has zero upstream dependencies. Foundation-layer system. |

**Depended on by (downstream):**

| System | Nature |
|--------|--------|
| Player Controller | Hard dependency — reads `getDirection()` every frame to move the player |

## Tuning Knobs

| Parameter | Current Value | Safe Range | Effect of Increase | Effect of Decrease |
|-----------|--------------|------------|-------------------|-------------------|
| `DEAD_ZONE` | 0 (not needed for keyboard) | 0–0.3 | Only relevant if gamepad support is added later | N/A |

Note: The Input System has no tuning knobs for keyboard input. Movement speed is owned by the Player Controller, not the Input System.

## Visual/Audio Requirements

N/A — The Input System is invisible infrastructure with no visual or audio output.

## UI Requirements

N/A — The Input System has no player-facing UI.

## Acceptance Criteria

- [ ] WASD keys produce correct direction vectors: W→(0,-1), S→(0,1), A→(-1,0), D→(1,0)
- [ ] Arrow keys produce identical vectors to WASD
- [ ] Diagonal input (W+D) produces normalized vector (0.707, -0.707), not (1, -1)
- [ ] Opposing keys cancel to (0, 0)
- [ ] No keys pressed returns (0, 0)
- [ ] `getDirection()` returns a new value every frame (no stale data)
- [ ] Mouse position is available as both screen and world coordinates
- [ ] Alt-tab / focus loss does not cause stuck movement
- [ ] Performance: `getDirection()` completes in < 0.01ms (trivial)

## Open Questions

None — the Input System design is straightforward and fully specified.
