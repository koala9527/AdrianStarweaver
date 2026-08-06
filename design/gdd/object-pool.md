# Object Pool

> **Status**: Designed
> **Author**: user + Claude
> **Last Updated**: 2026-03-28
> **Implements Pillar**: N/A — invisible performance infrastructure

## Overview

The Object Pool is a generic reuse system that pre-allocates and recycles game objects (enemies, projectiles, area effects, pickups, summons) instead of creating and destroying them at runtime. This is critical for H5 browser performance: with 100+ enemies and 200+ projectiles on screen simultaneously, garbage collection spikes from constant `new`/`destroy` would cause visible frame hitches. The Object Pool provides `acquire()` and `release()` methods — systems request objects from the pool and return them when done, avoiding GC pressure entirely.

## Player Fantasy

The Object Pool has no player fantasy — it is invisible performance infrastructure. Its success is measured by what the player does NOT experience: no frame drops, no stuttering, no lag spikes when the screen fills with enemies and spell effects. The player should feel smooth 60fps even during the most chaotic late-game moments.

## Detailed Design

### Core Rules

1. The Object Pool is a generic class `ObjectPool<T>` that manages a typed collection of reusable objects.
2. Each pool is created with a **factory function** `() => T` that produces new instances, and a **reset function** `(obj: T) => void` that restores an object to its default state before reuse.
3. API:
   - `acquire(): T` — Returns an inactive object from the pool. If none available, creates a new one via the factory (pool grows dynamically). Marks the object as active.
   - `release(obj: T): void` — Marks the object as inactive, calls the reset function, and returns it to the available pool.
   - `releaseAll(): void` — Releases all active objects (used on run end).
   - `preAllocate(count: number): void` — Pre-creates objects during scene init to avoid first-frame allocation spikes.
   - `getActiveCount(): number` — Returns count of currently active objects.
   - `getPoolSize(): number` — Returns total pool size (active + inactive).
4. Objects in the pool must implement a minimal interface:
   ```ts
   interface Poolable {
     active: boolean;
     reset(): void;
   }
   ```
5. Pre-allocation budgets (called during `RunScene.create()`):
   - Enemies: 80
   - Projectiles: 150
   - Pickups (XP orbs): 100
   - Area effects: 20
   - Summons: 10
   - Damage number texts: 30
6. Pools grow dynamically if demand exceeds pre-allocation, but a **hard cap** per pool type prevents runaway memory usage. If the cap is hit, the oldest active object is force-released (recycled).
7. Released objects are made invisible (`setActive(false)`, `setVisible(false)`) and moved off-screen — they are NOT removed from the Phaser scene.

### States and Transitions

Each pooled object has two states:

| State | Description | Transition |
|-------|-------------|------------|
| **Inactive** | In the available pool, invisible, not updated | → Active via `acquire()` |
| **Active** | In use by a system, visible, updated each frame | → Inactive via `release()` |

The pool itself is stateless — it is always available from instantiation to scene destruction.

### Interactions with Other Systems

| System | Direction | Interface |
|--------|-----------|-----------|
| Spell System | Downstream | Acquires projectiles and area effects; releases on hit/expire |
| Enemy System | Downstream | Acquires enemy sprites; releases on death |
| Loot & Pickup System | Downstream | Acquires XP orbs and drops; releases on collection |
| Spawn Director | Downstream | Calls `enemyPool.acquire()` to spawn waves |
| Damage Numbers | Downstream | Acquires floating text objects; releases after fade |
| VFX / Particle System | Downstream | May use pools for non-Phaser-particle effects |

The Object Pool does not use the Event Bus. Systems call pool methods directly via injected references.

## Formulas

No gameplay formulas. The only metric is memory:

```
totalMemory = Σ (poolSize[type] × objectMemory[type])
```

| Pool Type | Object Size (est.) | Pre-alloc | Hard Cap | Max Memory |
|-----------|-------------------|-----------|----------|------------|
| Enemy | ~2KB (sprite + state) | 80 | 150 | ~300KB |
| Projectile | ~0.5KB (sprite + velocity) | 150 | 300 | ~150KB |
| Pickup | ~0.3KB (sprite + value) | 100 | 200 | ~60KB |
| Area Effect | ~1KB (sprite + timer) | 20 | 40 | ~40KB |
| Summon | ~2KB (sprite + AI state) | 10 | 20 | ~40KB |
| Damage Text | ~0.2KB (text object) | 30 | 60 | ~12KB |

**Total worst-case**: ~600KB — well within H5 browser limits.

## Edge Cases

| Scenario | Expected Behavior | Rationale |
|----------|------------------|-----------|
| Pool exhausted and hard cap reached | Force-release the oldest active object of that type, reuse it | Prevents memory runaway; oldest enemy/projectile is least relevant |
| `release()` called on an already-inactive object | No-op with dev-mode warning | Prevents double-release bugs |
| `acquire()` called before `preAllocate()` | Works fine — factory creates a new object on demand | Pre-allocation is optimization, not requirement |
| Scene destroyed while objects are active | `releaseAll()` is called in scene shutdown; all objects reset | Clean teardown between runs |
| Object reference held after release | The object may be reused by another system — holding stale references is a bug. Dev-mode: released objects get a `_released` flag for assertion checks. | Prevents use-after-free style bugs |

## Dependencies

| System | Direction | Nature of Dependency |
|--------|-----------|---------------------|
| None | — | Zero upstream dependencies. Foundation-layer system. |

**Depended on by:** Spell System, Enemy System, Loot & Pickup System, Spawn Director, Damage Numbers, VFX. All are hard dependencies.

## Tuning Knobs

| Parameter | Current Value | Safe Range | Effect of Increase | Effect of Decrease |
|-----------|--------------|------------|-------------------|-------------------|
| `PREALLOC_ENEMIES` | 80 | 40–150 | More memory upfront, fewer runtime allocations | Saves memory, more runtime growth |
| `PREALLOC_PROJECTILES` | 150 | 50–300 | Smoother spell-heavy combat | May stutter on first big spell burst |
| `PREALLOC_PICKUPS` | 100 | 30–200 | Smooth XP orb spawning | May stutter on large kill waves |
| `CAP_ENEMIES` | 150 | 80–300 | More enemies on screen | Older enemies recycled sooner |
| `CAP_PROJECTILES` | 300 | 100–500 | More projectiles on screen | Oldest projectiles recycled |
| `CAP_PICKUPS` | 200 | 50–400 | More pickups on ground | Oldest pickups recycled |

## Visual/Audio Requirements

N/A — The Object Pool is invisible performance infrastructure.

## UI Requirements

N/A — The Object Pool has no player-facing UI.

## Acceptance Criteria

- [ ] `acquire()` returns an inactive object from the pool when available
- [ ] `acquire()` creates a new object via factory when pool is empty
- [ ] `acquire()` force-recycles oldest active object when hard cap is reached
- [ ] `release()` resets the object and returns it to the available pool
- [ ] `release()` on an already-inactive object is a no-op (no crash)
- [ ] `releaseAll()` returns all active objects to the pool
- [ ] `preAllocate()` creates the specified number of inactive objects
- [ ] Pre-allocated objects do not appear on screen until acquired
- [ ] No GC spikes during peak combat (100+ enemies, 200+ projectiles)
- [ ] Total pool memory stays under 1MB
- [ ] Dev mode: warning on double-release and stale reference access
- [ ] Performance: `acquire()` and `release()` complete in < 0.05ms

## Open Questions

None — the Object Pool design is straightforward and fully specified.
