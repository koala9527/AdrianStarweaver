# Collision System

> **Status**: Designed
> **Author**: user + Claude
> **Last Updated**: 2026-03-28
> **Implements Pillar**: 战场信息要清楚 (Battlefield Readability) — collision groups determine what interacts with what, keeping combat logic clean

## Overview

The Collision System configures Phaser Arcade Physics groups and defines which objects collide or overlap with which. It does not contain game logic — it only sets up the physics relationships and routes overlap/collision callbacks to the appropriate systems (Combat, Loot, Enemy). In a game with 100+ enemies, 200+ projectiles, and dozens of pickups, the collision matrix must be carefully designed to minimize unnecessary checks while ensuring all gameplay-relevant interactions are detected.

## Player Fantasy

The Collision System is invisible infrastructure. The player experiences it as: projectiles hit enemies reliably, pickups are collected when walked over, and enemies push against the player physically. Collisions should never feel "off" — no phantom hits, no missed pickups, no enemies clipping through each other in ways that look broken.

## Detailed Design

### Core Rules

1. The Collision System uses Phaser Arcade Physics exclusively (no Matter.js — too heavy for H5 with 100+ bodies).
2. All game objects belong to one of these **physics groups**:

   | Group | Body Type | Members |
   |-------|-----------|---------|
   | `playerGroup` | Dynamic, circular | Player sprite |
   | `enemyGroup` | Dynamic, circular | All enemy sprites |
   | `playerProjectileGroup` | Dynamic, circular | Spells/projectiles fired by player |
   | `enemyProjectileGroup` | Dynamic, circular | Projectiles fired by enemies (ranged mobs, boss) |
   | `pickupGroup` | Dynamic, circular | XP orbs, drops |
   | `areaEffectGroup` | Static, circular/rect | Ground zones (虚空法阵, boss danger zones) |

3. **Collision matrix** — defines all interactions:

   | A | B | Type | Handler | Description |
   |---|---|------|---------|-------------|
   | Player | Enemy | overlap | CombatSystem.onPlayerHitByEnemy | Contact damage |
   | Player | EnemyProjectile | overlap | CombatSystem.onPlayerHitByProjectile | Ranged damage |
   | Player | Pickup | overlap | LootSystem.onPickupCollected | Auto-collect within radius |
   | PlayerProjectile | Enemy | overlap | CombatSystem.onSpellHitEnemy | Spell damage |
   | AreaEffect (player) | Enemy | overlap | CombatSystem.onAreaEffectHitEnemy | Persistent zone damage |
   | Enemy | Enemy | collide | (none — Phaser separates) | Enemies push each other, prevent stacking |

4. Interactions NOT configured (no physics relationship):
   - Player ↔ PlayerProjectile (no friendly fire)
   - Enemy ↔ EnemyProjectile (enemies don't hit each other)
   - Pickup ↔ Enemy (enemies ignore pickups)
   - Pickup ↔ Projectile (projectiles pass through pickups)
   - PlayerProjectile ↔ EnemyProjectile (projectiles don't collide)

5. All overlap callbacks receive `(objectA, objectB)` and delegate to the owning system. The Collision System does NOT process damage, loot, or status effects — it only routes the callback.

6. **Pickup collection** uses a special approach: the Loot System checks distance to player each frame for objects within `pickupRadius`, rather than relying on physics overlap. This allows the magnetic pull-in effect. The physics overlap is a fallback for direct contact.

7. **Performance optimization**:
   - All groups use Phaser's built-in spatial partitioning
   - Inactive (pooled) objects have `body.enable = false` — they are excluded from physics checks automatically
   - Enemy-Enemy collision uses `collide` (not overlap) so Phaser handles separation without callbacks
   - Pierce/passthrough projectiles: on overlap, the projectile is NOT immediately released — the Combat System checks the spell's `pierce` count and decides whether to release or continue

8. The Collision System is initialized in `RunScene.create()` after all pools are created. It calls `this.physics.add.overlap(groupA, groupB, callback)` and `this.physics.add.collider(groupA, groupB)` for each row in the collision matrix.

### States and Transitions

The Collision System is stateless. Physics groups and overlap/collider registrations are set up once in `RunScene.create()` and persist until scene shutdown. No runtime state changes.

### Interactions with Other Systems

| System | Direction | Interface |
|--------|-----------|-----------|
| Combat System | Routes to | `onSpellHitEnemy(projectile, enemy)`, `onPlayerHitByEnemy(player, enemy)`, `onPlayerHitByProjectile(player, proj)`, `onAreaEffectHitEnemy(zone, enemy)` |
| Loot & Pickup System | Routes to | `onPickupCollected(player, pickup)` |
| Object Pool | Reads from | Groups contain pooled objects; inactive objects have `body.enable = false` |
| Spell System | Reads from | Projectiles are added to `playerProjectileGroup` on acquire |
| Enemy System | Reads from | Enemies are added to `enemyGroup` on acquire |
| Scene Manager | Lifecycle | Created/destroyed with RunScene |

## Formulas

No gameplay formulas. The only performance metric:

```
collisionChecks ≈ Σ (groupA.activeCount × groupB.activeCount) for each overlap/collider
```

Worst case per frame:
- PlayerProjectile × Enemy: 300 × 150 = 45,000 pair checks (Phaser spatial hash reduces this to ~2,000–5,000 actual checks)
- Enemy × Enemy: 150 × 150 / 2 = 11,250 pair checks (reduced by spatial hash)

**Budget**: Total physics step must complete within **4ms per frame** (25% of 16.6ms budget).

## Edge Cases

| Scenario | Expected Behavior | Rationale |
|----------|------------------|-----------|
| Projectile hits multiple enemies in same frame | Each overlap fires separately; pierce count decremented per hit | Phaser calls overlap callback for each pair |
| Enemy dies from projectile but overlap fires again next frame | Dead/released enemies have `body.enable = false` — no further overlaps | Pool release disables physics body |
| Player and enemy occupy exact same position | Overlap fires, contact damage applied, i-frames prevent repeated damage | No physics separation for player-enemy (overlap, not collide) |
| 150 enemies stacked in one spot | Enemy-Enemy collider pushes them apart over multiple frames | Phaser arcade separation handles this, may look jittery but functional |
| Area effect overlaps same enemy every frame | Combat System tracks hit cooldown per (zone, enemy) pair to prevent 60x/sec damage | Tick rate controlled by Combat System, not Collision System |
| Projectile spawned inside an enemy | Overlap fires immediately on next physics step | No special case — works correctly |

## Dependencies

| System | Direction | Nature of Dependency |
|--------|-----------|---------------------|
| Scene Manager | Upstream | Hard — requires RunScene physics world |

**Depended on by:** Spell System, Enemy System, Combat System, Loot & Pickup System. All are hard dependencies — they need physics groups to exist.

## Tuning Knobs

| Parameter | Current Value | Safe Range | Effect of Increase | Effect of Decrease |
|-----------|--------------|------------|-------------------|-------------------|
| `PLAYER_BODY_RADIUS` | 12 | 8–20 | Easier to get hit, easier to collect pickups | Harder to hit, tighter dodging |
| `ENEMY_BODY_RADIUS` | varies per type | 8–24 | Easier to hit with spells | Harder to hit |
| `PROJECTILE_BODY_RADIUS` | 6 | 4–12 | More generous hit detection | Tighter, more precise |
| `PICKUP_BODY_RADIUS` | 8 | 4–16 | Easier direct-contact collection | Must be closer |

## Visual/Audio Requirements

N/A — The Collision System is invisible. Hit feedback is owned by Combat System and VFX.

## UI Requirements

N/A — No player-facing UI.

## Acceptance Criteria

- [ ] Player-Enemy overlap triggers contact damage callback
- [ ] PlayerProjectile-Enemy overlap triggers spell hit callback
- [ ] Player-Pickup overlap triggers collection callback
- [ ] Player-EnemyProjectile overlap triggers ranged damage callback
- [ ] AreaEffect-Enemy overlap triggers zone damage callback
- [ ] Enemy-Enemy collider prevents enemy stacking
- [ ] Inactive (pooled) objects do not participate in physics checks
- [ ] No friendly fire (player projectiles don't hit player)
- [ ] No enemy-on-enemy projectile damage
- [ ] Physics step completes within 4ms at peak load (150 enemies, 300 projectiles)
- [ ] Pierce projectiles continue through enemies correctly
- [ ] All body radii are configurable via data

## Open Questions

None — the Collision System design is fully specified.
