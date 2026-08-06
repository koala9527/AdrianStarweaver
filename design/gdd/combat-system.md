# Combat System

> **Status**: Designed
> **Author**: user + Claude
> **Last Updated**: 2026-03-28
> **Implements Pillar**: 构筑优先于操作 (Build over Execution) — combat resolves automatically, rewarding build quality over mechanical skill

## Overview

The Combat System is the central damage resolution engine. It receives collision callbacks from the Collision System (spell hits enemy, enemy hits player, area effect hits enemy), calculates final damage using the formula from guide.md §9.2, determines crits, rolls for status effect application, distributes XP on kills, and emits combat events on the Event Bus. It is the hub where Spell System output meets Enemy System input, and where Relic/Status Effect triggers fire. The Combat System does not own any entities — it processes interactions between entities owned by other systems.

## Player Fantasy

The player should feel the impact of their build choices through combat numbers. A well-built fire mage sees massive burn ticks. A crit-stacking lightning build sees chains of yellow damage numbers arcing across the screen. The fantasy is: "my numbers are getting bigger because my build is getting better." Combat feedback must be immediate, clear, and satisfying.

## Detailed Design

### Core Rules

1. The Combat System is a stateless processor — it receives collision callbacks and resolves them immediately. It does not run an update loop.

2. **Damage Flow** (spell → enemy):
   ```
   Collision callback (projectile, enemy)
   → Calculate base damage (from spell config + modifiers)
   → Apply player.power multiplier
   → Roll crit (player.critChance)
   → If crit: multiply by player.critDamage
   → Apply vulnerability multiplier (from Status Effect System)
   → Apply random variance (0.95–1.05)
   → Apply damage to enemy HP
   → Roll status effect chance
   → If status: call StatusEffectSystem.apply()
   → Emit SPELL_HIT event (mutable payload — relics can modify)
   → If crit: emit CRIT event
   → If enemy HP ≤ 0: trigger kill flow
   ```

3. **Damage Flow** (enemy → player):
   ```
   Collision callback (player, enemy) OR (player, enemyProjectile)
   → Check player i-frame state
   → If invulnerable: ignore
   → Check per-enemy contact damage cooldown
   → If on cooldown: ignore
   → Apply damage to player via PlayerController.takeDamage()
   → Emit PLAYER_DAMAGED event
   → If player HP ≤ 0: emit RUN_END (death)
   ```

4. **Kill Flow**:
   ```
   Enemy HP ≤ 0
   → Emit ENEMY_KILL event { enemyId, enemyType, position, killerSpellId, element }
   → Loot System listens → spawns XP orbs and drops
   → Relic System listens → triggers on-kill effects
   → Spawn Director listens → updates enemy count
   → Enemy enters Dying state
   ```

5. **Area Effect Damage**: For persistent zones (虚空法阵), the Combat System is called every `areaDamageInterval` (0.5s) for each enemy inside the zone. The zone tracks a `lastTickTime` per enemy to prevent double-ticking within the same interval.

6. **Chain Lightning Resolution**: When闪电链 hits its primary target, the Combat System:
   - Applies damage to primary target
   - Finds nearest enemy within `chainRange` not in the `hitSet`
   - Applies `chainDamage[n]` (with falloff) to chain target
   - Emits separate `SPELL_HIT` for each chain hit
   - Repeats for `chain` count

7. **Mutable Payload Pattern**: The `SPELL_HIT` event payload includes a `damage` field that relics can modify before the event dispatch completes. The Combat System:
   - Creates the payload with calculated damage
   - Emits `SPELL_HIT` (relics at priority 10 may modify `payload.damage`)
   - Reads `payload.finalDamage` after all subscribers have run
   - The actual HP reduction uses `payload.finalDamage`, not the pre-relic value

8. **Combat does NOT handle**: Spell casting (Spell System), enemy AI (Enemy System), status effect ticking (Status Effect System), loot spawning (Loot System). It only resolves the moment of impact.

### States and Transitions

The Combat System is stateless. It is a collection of callback handlers invoked by the Collision System. No update loop, no state machine.

### Interactions with Other Systems

| System | Direction | Interface |
|--------|-----------|-----------|
| Collision System | Called by | `onSpellHitEnemy(proj, enemy)`, `onPlayerHitByEnemy(player, enemy)`, `onPlayerHitByProjectile(player, proj)`, `onAreaEffectHitEnemy(zone, enemy)` |
| Spell System | Reads from | Projectile carries spell config (damage, element, pierce, chain) |
| Player Controller | Reads/Modifies | Reads `power`, `critChance`, `critDamage`; calls `takeDamage()` |
| Enemy System | Modifies | Reduces enemy HP; triggers death flow |
| Status Effect System | Calls | `apply(target, effect)` on successful status roll; reads vulnerability stacks |
| Element System | Reads from | Element tag on projectile for status effect type |
| Relic System | Triggers via | Relics subscribe to SPELL_HIT, ENEMY_KILL, CRIT events |
| Event Bus | Emits | `SPELL_HIT`, `ENEMY_KILL`, `ENEMY_DAMAGED`, `PLAYER_DAMAGED`, `CRIT`, `PLAYER_HEAL` |
| Loot & Pickup System | Triggers via | `ENEMY_KILL` event triggers loot drops |

## Formulas

### Final Damage (Spell → Enemy)
```
rawDamage = effectiveBaseDamage × player.power × skillMultiplier
critRoll = random(0, 1) < player.critChance
critMultiplier = critRoll ? player.critDamage : 1.0
vulnerabilityMultiplier = 1 + (target.vulnerabilityStacks × 0.10)
variance = random(0.95, 1.05)
finalDamage = floor(rawDamage × critMultiplier × vulnerabilityMultiplier × variance)
finalDamage = max(finalDamage, 1)  // minimum 1 damage
```

| Variable | Type | Range | Description |
|----------|------|-------|-------------|
| effectiveBaseDamage | float | 5–80 | Spell base damage after modifiers |
| player.power | float | 1.0–5.0 | 法强 multiplier |
| skillMultiplier | float | 0.5–2.0 | Per-spell scaling |
| player.critChance | float | 0.05–0.60 | Crit probability |
| player.critDamage | float | 1.5–3.0 | Crit damage multiplier |
| vulnerabilityStacks | int | 0–5 | From Status Effect System |
| variance | float | 0.95–1.05 | Small random spread |

**Expected damage ranges**:
- Early game (Lv1, 1 spell): 5–15 per hit
- Mid game (Lv10, 3 spells): 20–60 per hit
- Late game (Lv20, 4 spells, relics): 50–200 per hit
- Crit late game: 100–400 per hit

### Contact Damage (Enemy → Player)
```
actualDamage = scaledContactDamage - player.shield
actualDamage = max(actualDamage, 1)
player.hp -= actualDamage
player.shield = max(0, player.shield - scaledContactDamage)
```
(Uses Player Controller's damage intake formula from player-controller.md)

## Edge Cases

| Scenario | Expected Behavior | Rationale |
|----------|------------------|-----------|
| Damage exactly equals enemy HP | Enemy dies (HP ≤ 0 check) | Clean kill |
| Overkill damage | HP clamped to 0, no negative HP. Overkill amount is ignored. | No overkill mechanics in MVP |
| Crit on a burn tick | Not possible — burn ticks use fixed damage, no crit roll | Burn is DoT, not a spell hit |
| Multiple relics modify same SPELL_HIT payload | All run in priority order, each sees previous modifications | Mutable payload pattern handles this |
| Relic increases damage to 0 or negative | Clamped to minimum 1 | Always deal at least 1 damage |
| Player and enemy overlap at frame 1 of run | Contact damage applies normally (no grace period) | Player should move immediately |
| Chain lightning kills a target mid-chain | Chain continues to next valid target, skipping the dead one | Chain doesn't break on kill |
| Area effect and projectile hit same enemy same frame | Both apply damage separately — two SPELL_HIT events | Intended — rewards overlapping spells |
| Boss takes damage | Same formula, no damage cap. Boss has high HP to compensate. | Bosses are HP sponges, not damage-resistant |

## Dependencies

| System | Direction | Nature of Dependency |
|--------|-----------|---------------------|
| Spell System | Upstream | Hard — reads spell config from projectiles |
| Enemy System | Upstream | Hard — modifies enemy HP |
| Status Effect System | Upstream | Hard — reads vulnerability, calls apply() |
| Element System | Upstream | Hard — reads element tags |
| Event Bus | Upstream | Hard — emits all combat events |

**Depended on by:**

| System | Nature |
|--------|--------|
| Relic System | Soft — subscribes to combat events for triggers |
| Loot & Pickup System | Soft — subscribes to ENEMY_KILL |
| Damage Numbers | Soft — subscribes to SPELL_HIT, ENEMY_DAMAGED |
| VFX / Particle System | Soft — subscribes to combat events for hit effects |
| HUD | Soft — subscribes to PLAYER_DAMAGED for HP display |

## Tuning Knobs

| Parameter | Current Value | Safe Range | Effect of Increase | Effect of Decrease |
|-----------|--------------|------------|-------------------|-------------------|
| `DAMAGE_VARIANCE_MIN` | 0.95 | 0.85–1.0 | Wider damage spread | More consistent |
| `DAMAGE_VARIANCE_MAX` | 1.05 | 1.0–1.15 | Wider damage spread | More consistent |
| `MIN_DAMAGE` | 1 | 1 | N/A | N/A (always 1) |
| `CONTACT_DAMAGE_COOLDOWN` | 0.5s | 0.3–1.0s | Less contact DPS | More punishing |
| `AREA_TICK_INTERVAL` | 0.5s | 0.25–1.0s | More zone DPS | Less zone DPS |

Most combat tuning is done via Spell System (spell damage), Player Controller (stats), and Enemy System (enemy HP/damage) tuning knobs, not in the Combat System itself.

## Visual/Audio Requirements

| Event | Visual Feedback | Audio Feedback | Priority |
|-------|----------------|---------------|----------|
| Spell hit (normal) | Impact flash (element color) | Hit SFX | MVP (visual), Alpha (audio) |
| Spell hit (crit) | Larger impact flash + "CRIT" text | Crit SFX (sharper) | MVP |
| Player damaged | Screen edge red flash, player flash | Hit SFX | MVP |
| Enemy killed | Death flash + fade | Death SFX | MVP (visual), Alpha (audio) |
| Chain lightning arc | Lightning bolt VFX between targets | Zap SFX | Vertical Slice |

## UI Requirements

| Information | Display Location | Update Frequency | Condition |
|-------------|-----------------|-----------------|-----------|
| Damage numbers | Floating above enemy | On each hit | During combat |
| Crit indicator | Larger/colored damage number | On crit | During combat |
| Player HP change | HUD HP bar | On damage/heal | Always |

## Acceptance Criteria

- [ ] Damage formula produces correct values per specification
- [ ] Crit rolls at correct probability and applies correct multiplier
- [ ] Vulnerability stacks increase damage by 10% per stack
- [ ] Random variance stays within 0.95–1.05 range
- [ ] Minimum damage is always 1
- [ ] Contact damage respects per-enemy cooldown
- [ ] Player i-frames block all damage during invulnerability
- [ ] SPELL_HIT mutable payload allows relic damage modification
- [ ] ENEMY_KILL fires on enemy death with correct payload
- [ ] Chain lightning resolves correctly with damage falloff
- [ ] Area effect ticks at correct interval without double-ticking
- [ ] Player death triggers RUN_END event
- [ ] All combat events fire on Event Bus with correct data
- [ ] Performance: damage resolution < 0.1ms per hit

## Open Questions

None — the Combat System design is fully specified.
