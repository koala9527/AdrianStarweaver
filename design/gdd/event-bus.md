# Event Bus

> **Status**: Designed
> **Author**: user + Claude
> **Last Updated**: 2026-03-28
> **Implements Pillar**: 构筑优先于操作 (Build over Execution) — enables spell/relic/element synergies via decoupled event-driven triggers

## Overview

The Event Bus is a centralized publish/subscribe messaging system that allows all game systems to communicate without direct references to each other. When something happens in the game — a spell hits an enemy, a player levels up, an enemy dies — the responsible system emits a typed event onto the bus. Any other system that cares about that event receives it automatically.

This decoupling is critical for the build/synergy system: relics, element infusions, and upgrade triggers all work by subscribing to combat events (onHit, onKill, onCrit) and injecting additional effects. Without the Event Bus, every new relic or upgrade would require hardcoded connections between systems, making the game impossible to extend.

The player never interacts with the Event Bus directly — it is invisible infrastructure. But every "when X happens, do Y" mechanic in the game runs through it.

## Player Fantasy

The Event Bus has no direct player fantasy — it is invisible plumbing. However, it is the enabler of the game's most satisfying moments: chain reactions. When a player builds a "freeze → shatter → chain lightning" combo and watches it cascade across a mob, that emergent spectacle is powered by events flowing through the bus. The player fantasy it serves is: "everything I built works together automatically."

## Detailed Design

### Core Rules

1. The Event Bus is a singleton-like service instantiated once per `RunScene` and passed to all systems via constructor injection (not a global static).
2. Systems **emit** events by calling `emit(eventName, payload)`. The payload is a strongly-typed object specific to each event type.
3. Systems **subscribe** by calling `on(eventName, callback, context)`. Callbacks execute synchronously in subscription order.
4. Systems **unsubscribe** by calling `off(eventName, callback, context)` or `offAll(context)` to remove all listeners for a given system.
5. Events are **fire-and-forget** — emitters do not receive return values from subscribers. If a subscriber needs to modify data (e.g., a relic modifying damage before it's applied), use a **mutable payload pattern**: the emitter passes a payload object, subscribers may mutate specific fields (e.g., `payload.damage`), and the emitter reads the final value after all subscribers have run.
6. Event names are string constants defined in a central `GameEvents` enum to prevent typos and enable autocomplete.
7. All payloads are TypeScript interfaces, one per event type, exported from a central `EventTypes.ts` file.

#### Event Catalog (MVP)

| Event Name | Emitter | Payload | Subscribers (examples) |
|------------|---------|---------|----------------------|
| `SPELL_CAST` | SpellSystem | `{ spellId, element, position, targets }` | Relic System, Audio, VFX |
| `SPELL_HIT` | CombatSystem | `{ spellId, element, target, damage, isCrit, position }` | Status Effect, Relic, Damage Numbers, VFX |
| `ENEMY_KILL` | CombatSystem | `{ enemyId, enemyType, position, killerSpellId, element }` | Loot, Spawn Director, Relic, XP, VFX |
| `ENEMY_DAMAGED` | CombatSystem | `{ enemyId, damage, element, remainingHp }` | HUD (boss HP), Damage Numbers |
| `PLAYER_DAMAGED` | CombatSystem | `{ damage, source, remainingHp }` | HUD, VFX, Audio |
| `PLAYER_HEAL` | CombatSystem | `{ amount, source, currentHp }` | HUD |
| `CRIT` | CombatSystem | `{ spellId, target, damage }` | Relic (crit-triggered effects), VFX |
| `STATUS_APPLY` | StatusEffectSystem | `{ effectType, target, duration, source }` | Relic, Element System, VFX |
| `STATUS_EXPIRE` | StatusEffectSystem | `{ effectType, target }` | Element System |
| `XP_GAINED` | LootSystem | `{ amount, source }` | XP & Level-Up System, HUD |
| `LEVEL_UP` | LevelUpSystem | `{ newLevel }` | HUD, Audio, VFX |
| `UPGRADE_CHOSEN` | LevelUpSystem | `{ upgradeCard }` | Build System, Spell System, HUD |
| `RELIC_ACQUIRED` | BuildSystem | `{ relicId }` | Relic System, HUD, Audio |
| `WAVE_START` | SpawnDirector | `{ waveNumber, enemyCount }` | HUD, Audio |
| `EVENT_START` | EventSystem | `{ eventType, position }` | HUD, Audio, VFX |
| `EVENT_COMPLETE` | EventSystem | `{ eventType, reward }` | Loot, HUD |
| `BOSS_SPAWN` | BossSystem | `{ bossId }` | HUD, Audio, Camera |
| `BOSS_DEFEATED` | BossSystem | `{ bossId }` | Game Timer (end run), HUD, Audio |
| `RUN_START` | SceneManager | `{ timestamp }` | All systems (init) |
| `RUN_END` | GameTimer | `{ survived, time, cause }` | Result Screen, Meta-Progression |
| `PHASE_CHANGE` | GameTimer | `{ phase, previousPhase }` | Spawn Director, Event System, HUD |
| `PICKUP_COLLECTED` | LootSystem | `{ pickupType, value, position }` | HUD, Audio |

### States and Transitions

The Event Bus is stateless. It has no modes, phases, or internal state machine. It is always available to receive `emit()` and `on()` calls from the moment it is instantiated until the scene is destroyed.

The only lifecycle consideration is cleanup: when `RunScene` ends, all subscriptions are cleared via `destroy()` to prevent memory leaks between runs.

### Interactions with Other Systems

The Event Bus interacts with every system in the game. Rather than listing each one, the interaction pattern is uniform:

| Role | API | Example |
|------|-----|---------|
| **Producer** | `eventBus.emit(EVENT, payload)` | CombatSystem emits `SPELL_HIT` after damage calc |
| **Consumer** | `eventBus.on(EVENT, callback, this)` | RelicSystem subscribes to `SPELL_HIT` to trigger on-hit effects |
| **Modifier** | Consumer mutates payload fields | Relic "连击棱镜" reads `payload.damage`, multiplies it, writes back |

**Ownership rules:**
- Each event has exactly one emitter system (listed in the Event Catalog)
- Each event may have zero or more subscribers
- The Event Bus does NOT own any game data — it only routes messages
- Systems receive the Event Bus via constructor: `constructor(eventBus: EventBus)`

**Subscription priority for mutable payloads:**
When multiple subscribers need to modify the same payload (e.g., multiple relics modifying damage), execution order matters. Subscribers register with an optional `priority` parameter (default: 0, higher = runs first). This allows:
- Damage multipliers (relics) at priority 10
- Damage reduction (shields) at priority 5
- Logging/display (damage numbers) at priority 0 (runs last, sees final value)

## Formulas

The Event Bus performs no mathematical calculations. It is a message routing system.

The only quantitative concern is performance overhead per event dispatch:

```
dispatchCost = subscriberCount × averageCallbackTime
```

| Variable | Type | Expected Range | Description |
|----------|------|---------------|-------------|
| subscriberCount | int | 1–8 per event | Number of callbacks registered for a given event |
| averageCallbackTime | μs | 1–50μs | Time per callback (depends on subscriber logic, not the bus) |

**Budget**: Total event dispatch overhead must stay under **1ms per frame** across all events fired in a single frame. At peak combat (100+ enemies, spell spam), expect 50–200 events per frame.

## Edge Cases

| Scenario | Expected Behavior | Rationale |
|----------|------------------|-----------|
| Subscriber emits another event inside its callback (re-entrant emit) | Allowed. The inner event's subscribers run immediately (depth-first), then the outer event's remaining subscribers continue. | Chain reactions (freeze → shatter → chain lightning) require re-entrant emits. |
| Re-entrant emit causes infinite loop (A triggers B triggers A...) | Hard cap at **8 levels** of re-entrant depth. If exceeded, log a warning and drop the event. | Prevents stack overflow from misconfigured relic/upgrade combos. |
| Subscriber unsubscribes during event dispatch | Safe. The current dispatch iteration uses a snapshot of the subscriber list. Removals take effect on the next emit. | Prevents index corruption during iteration. |
| Subscriber added during event dispatch | The new subscriber does NOT receive the current event. It will receive the next emit of that event. | Prevents unexpected double-processing. |
| emit() called with no subscribers | No-op. No error, no warning. | Many events are subscribed lazily (e.g., Audio System only exists in Alpha). |
| Scene destroyed while events are in-flight | `destroy()` clears all subscriptions immediately. Any in-flight dispatch completes but subsequent callbacks are skipped. | Clean shutdown without dangling references. |
| Same callback registered twice for the same event | Allowed but warned in dev mode. Both registrations fire (duplicate calls). | Catches accidental double-subscription bugs during development. |

## Dependencies

| System | Direction | Nature of Dependency |
|--------|-----------|---------------------|
| None | — | The Event Bus has zero upstream dependencies. It is a Foundation-layer system. |

**Depended on by (downstream):**

| System | Nature |
|--------|--------|
| Element System | Subscribes to combat events for element tag processing |
| Status Effect System | Subscribes to hit events to apply/expire effects |
| Spell System | Emits SPELL_CAST; subscribes to UPGRADE_CHOSEN for spell modifications |
| Combat System | Emits SPELL_HIT, ENEMY_KILL, ENEMY_DAMAGED, PLAYER_DAMAGED, CRIT |
| Loot & Pickup System | Emits XP_GAINED, PICKUP_COLLECTED; subscribes to ENEMY_KILL for drops |
| Spawn Director | Emits WAVE_START; subscribes to ENEMY_KILL for density tracking |
| Build System | Emits RELIC_ACQUIRED; subscribes to UPGRADE_CHOSEN |
| Relic System | Subscribes to SPELL_HIT, ENEMY_KILL, CRIT, STATUS_APPLY for trigger effects |
| Game Timer | Emits RUN_START, RUN_END, PHASE_CHANGE |
| XP & Level-Up System | Emits LEVEL_UP, UPGRADE_CHOSEN; subscribes to XP_GAINED |
| Event System | Emits EVENT_START, EVENT_COMPLETE; subscribes to Game Timer |
| Boss System | Emits BOSS_SPAWN, BOSS_DEFEATED |
| Audio System | Subscribes to combat/UI events for SFX triggers |
| HUD | Subscribes to PLAYER_DAMAGED, LEVEL_UP, XP_GAINED, etc. for display updates |

**Dependency type**: All downstream systems have a **hard** dependency on the Event Bus — they cannot function without it.

## Tuning Knobs

| Parameter | Current Value | Safe Range | Effect of Increase | Effect of Decrease |
|-----------|--------------|------------|-------------------|-------------------|
| `MAX_REENTRANT_DEPTH` | 8 | 4–16 | Allows longer chain reactions but risks performance spikes | Cuts off complex combos prematurely |
| `DEV_WARN_DUPLICATE_SUB` | true (dev only) | boolean | Logs warnings for double-subscriptions | Silent — harder to catch bugs |
| `DEV_LOG_EVENTS` | false | boolean | Logs every emit to console (debug only — heavy perf cost) | Normal operation |

## Visual/Audio Requirements

N/A — The Event Bus is invisible infrastructure with no visual or audio output.

## UI Requirements

N/A — The Event Bus has no player-facing UI.

## Acceptance Criteria

- [ ] `emit()` delivers payload to all registered subscribers for that event
- [ ] `on()` with priority parameter executes higher-priority subscribers first
- [ ] `off()` removes a specific subscriber; `offAll(context)` removes all subscribers for a context
- [ ] Mutable payload pattern works: subscriber A modifies `payload.damage`, subscriber B (lower priority) sees the modified value
- [ ] Re-entrant emit works up to 8 levels deep (chain reactions)
- [ ] Re-entrant emit at depth 9 is dropped with a console warning
- [ ] Unsubscribing during dispatch does not cause errors or skipped callbacks in the current dispatch
- [ ] Subscribing during dispatch does not cause the new subscriber to fire for the current event
- [ ] `destroy()` clears all subscriptions; subsequent `emit()` calls are no-ops
- [ ] All events in the Event Catalog have typed payload interfaces (TypeScript compile-time check)
- [ ] `GameEvents` enum contains all event names — no raw string event names in codebase
- [ ] Performance: total event dispatch overhead < 1ms per frame at peak combat (200 events/frame)
- [ ] No memory leaks: subscriber count returns to 0 after `destroy()`
- [ ] Dev mode: duplicate subscription warning fires when same callback is registered twice

## Open Questions

None — the Event Bus design is straightforward and fully specified.
