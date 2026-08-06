# HUD

> **Status**: Designed
> **Author**: user + Claude
> **Last Updated**: 2026-03-28
> **Implements Pillar**: 构筑优先于操作 (Build over Execution) — the HUD shows build state so the player can make informed upgrade decisions

## Overview

The HUD is the always-visible in-run UI overlay that displays the player's vital information: health bar (with shield), XP bar with level indicator, spell cooldown icons, and the run timer. It reads from Player Controller, XP & Level-Up System, Spell System, and Game Timer but never writes back — it is purely a display layer. The HUD hides during scene transitions to the Result Screen but remains visible during level-up pauses so the player can reference their state while choosing cards.

## Player Fantasy

The HUD is infrastructure the player doesn't consciously notice — it just works. Health dips and the bar pulses red. XP fills and the bar glows. Spell cooldowns sweep and the player knows when their next burst is ready. The fantasy is: "I always know my state at a glance without looking away from the action."

## Detailed Design

### Core Rules

1. The HUD is a Phaser Container added to the RunScene's UI camera (fixed to screen, not world).

2. **Layout** (1280×720 base, Scale.FIT):
   - Health bar: top-left (x:20, y:20), 200×16px
   - Shield overlay: same position, rendered on top of health bar in blue
   - XP bar: bottom-center (x:440, y:692), 400×12px
   - Level badge: left of XP bar (x:420, y:686), circular 24px
   - Spell icons: bottom-center row (x:480, y:648), up to 4 icons, 40×40px each, 8px gap
   - Timer: top-right (x:1200, y:20), right-aligned text

3. **Health Bar**: Displays `hp / maxHp` as a filled bar. Color transitions: green (>50%), yellow (25–50%), red (<25%). If `shield > 0`, a blue overlay shows shield amount on top of the health bar.

4. **XP Bar**: Displays `currentXp / expToNext` as a filled bar. Smooth tween fill (100ms lerp). When level cap (30) is reached, bar shows full with "MAX" text.

5. **Level Badge**: Circular badge showing current level number. Brief scale-up animation (1.0→1.3→1.0 over 200ms) on level-up.

6. **Spell Icons**: Up to 4 spell slots displayed as square icons. Each shows:
   - Spell icon (resolved from `spellId`)
   - Element tint (fire=red, ice=blue, lightning=yellow, arcane=purple, null=white)
   - Radial cooldown sweep overlay (clockwise, darkened)
   - Small level number badge (bottom-right corner)
   - Flash/glow when cooldown reaches 0 (ready)

7. **Timer**: Displays `getElapsed()` formatted as `M:SS`. Counts up from `0:00`. Freezes when game is paused.

8. **Visibility**: HUD is visible during normal gameplay. During level-up pause, HUD remains visible (player needs to see their state while choosing cards). HUD hides on scene transition to Result Screen.

9. **Update Frequency**: Health bar and spell cooldowns update every frame. XP bar updates on `XP_GAINED` events. Timer updates every frame. Level badge updates on `LEVEL_UP` events.

### States and Transitions

| State | Entry | Exit | Behavior |
|-------|-------|------|----------|
| **Active** | RunScene starts | Run ends | All elements visible, updating |
| **Paused** | Game paused (level-up) | Game resumed | Visible but timer frozen, cooldowns frozen |
| **Hidden** | Scene transition | N/A | All elements invisible |

### Interactions with Other Systems

| System | Direction | Interface |
|--------|-----------|-----------|
| Player Controller | Reads from | `hp`, `maxHp`, `shield` for health bar |
| XP & Level-Up System | Reads from | `currentXp`, `expToNext`, `level` for XP bar and level badge |
| Spell System | Reads from | `SpellSlotState[]` for spell icons and cooldowns |
| Game Timer | Reads from | `getElapsed()` for timer display, `isPaused()` for freeze |
| Event Bus | Subscribes | `XP_GAINED` (update XP bar), `LEVEL_UP` (animate level badge), `SPELL_ACQUIRED` (add icon) |
| Level-Up Panel | Coexists | Both visible during level-up pause |

## Formulas

### Bar Fill Ratios
```
healthBarFill = hp / maxHp                              // 0–1
shieldBarFill = shield / maxHp                          // overlaid, 0–1
xpBarFill = currentXp / expToNext                       // 0–1, smooth lerp
cooldownFill = cooldownRemaining / effectiveCooldown    // 0–1, radial sweep
```

### Timer Display
```
timerText = floor(elapsed / 60) + ":" + pad(floor(elapsed % 60), 2)
```

### Health Bar Color
```
healthColor = hp/maxHp > 0.5 ? green : hp/maxHp > 0.25 ? yellow : red
```

| Variable | Type | Range | Description |
|----------|------|-------|-------------|
| hp | int | 0–maxHp | Current health |
| maxHp | int | 100–500 | Maximum health |
| shield | int | 0–100 | Shield absorb amount |
| currentXp | int | 0–expToNext | Current XP in this level |
| expToNext | int | 10–106 | XP threshold for next level |
| cooldownRemaining | float | 0–effectiveCooldown | Seconds until spell ready |
| effectiveCooldown | float | 0.1–10 | Spell's modified cooldown |
| elapsed | float | 0–840 | Run time in seconds |

## Edge Cases

| Scenario | Expected Behavior | Rationale |
|----------|------------------|-----------|
| Shield > 0 | Blue overlay on health bar, total display = hp + shield | Visual clarity |
| HP exactly 0 | Health bar empty, red — player is dead, run ends | Death handled by other systems |
| No spells equipped (run start) | Empty spell bar, icons appear as spells are acquired | Clean initial state |
| 4 spells equipped, all on cooldown | All 4 icons show radial sweep simultaneously | Normal late-game state |
| Level 30 (cap) | XP bar full, "MAX" text, no further XP bar updates | Soft cap |
| Timer at 14:00 (hard cap) | Timer shows "14:00" and stops | Game Timer hard cap |
| Resolution scaling | All positions use relative anchors, Scale.FIT handles the rest | Consistent across screen sizes |

## Dependencies

| System | Direction | Nature of Dependency |
|--------|-----------|---------------------|
| Player Controller | Upstream | Hard — reads HP, shield |
| XP & Level-Up System | Upstream | Hard — reads XP, level |
| Spell System | Upstream | Hard — reads spell slots, cooldowns |
| Game Timer | Upstream | Hard — reads elapsed time |
| Event Bus | Upstream | Hard — subscribes to update events |

**Depended on by:**

| System | Nature |
|--------|--------|
| (none) | Leaf presentation node |

## Tuning Knobs

| Parameter | Current Value | Safe Range | Effect of Increase | Effect of Decrease |
|-----------|--------------|------------|-------------------|-------------------|
| `HEALTH_BAR_WIDTH` | 200px | 150–300px | Larger health bar | Smaller health bar |
| `HEALTH_BAR_HEIGHT` | 16px | 12–24px | Thicker health bar | Thinner health bar |
| `XP_BAR_WIDTH` | 400px | 300–600px | Wider XP bar | Narrower XP bar |
| `XP_LERP_SPEED` | 100ms | 50–300ms | Slower fill animation | Snappier fill |
| `SPELL_ICON_SIZE` | 40px | 32–56px | Larger spell icons | Smaller spell icons |
| `SPELL_ICON_GAP` | 8px | 4–16px | More space between icons | Tighter icon row |
| `HP_YELLOW_THRESHOLD` | 0.5 | 0.3–0.6 | Yellow appears earlier | Yellow appears later |
| `HP_RED_THRESHOLD` | 0.25 | 0.1–0.35 | Red appears earlier | Red appears later |
| `LEVEL_BADGE_ANIM_DURATION` | 200ms | 100–400ms | Slower pop animation | Faster pop |

## Visual/Audio Requirements

| Event | Visual Feedback | Audio Feedback | Priority |
|-------|----------------|---------------|----------|
| HP changes | Bar fill animates smoothly | None | MVP |
| HP < 25% | Bar pulses red | Low HP warning SFX | MVP (visual), Alpha (audio) |
| XP gained | Bar fills with lerp | None | MVP |
| Spell ready | Icon flash/glow | None | MVP |
| Level-up | Badge scale pop | Handled by XP & Level-Up System | MVP |

## UI Requirements

| Information | Display Location | Update Frequency | Condition |
|-------------|-----------------|-----------------|-----------|
| Health bar | Top-left | Every frame | Always |
| Shield overlay | Top-left (over health) | Every frame | When shield > 0 |
| XP bar | Bottom-center | On XP_GAINED | Always (MAX at cap) |
| Level badge | Left of XP bar | On LEVEL_UP | Always |
| Spell icons (×4) | Bottom-center row | Every frame (cooldowns) | When spells equipped |
| Timer | Top-right | Every frame | Always |

## Acceptance Criteria

- [ ] Health bar displays correctly and updates every frame
- [ ] Shield overlay renders on top of health bar when shield > 0
- [ ] Health bar color transitions at 50% and 25% thresholds
- [ ] XP bar fills smoothly with lerp on XP_GAINED events
- [ ] XP bar shows "MAX" at level 30
- [ ] Level badge displays current level with pop animation on level-up
- [ ] Spell icons show for each equipped spell with element tint
- [ ] Radial cooldown sweep updates every frame per spell
- [ ] Spell icon flashes when cooldown reaches 0
- [ ] Timer displays elapsed time as M:SS, freezes when paused
- [ ] HUD remains visible during level-up pause
- [ ] All positions scale correctly with Scale.FIT
- [ ] Performance: HUD render < 0.5ms per frame

## Open Questions

None — the HUD design is fully specified.
