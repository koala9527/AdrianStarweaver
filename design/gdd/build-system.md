# Build System

> **Status**: Designed
> **Author**: user + Claude
> **Last Updated**: 2026-03-28
> **Implements Pillar**: 构筑优先于操作 (Build over Execution) — the Build System IS the core of the game; it tracks and applies every choice the player makes

## Overview

The Build System is the central registry of the player's current build state. It tracks which spells are equipped, what upgrades have been applied, which relics are active, and what element affinities the player has accumulated. When the player chooses an upgrade card, the Build System applies it — modifying spell stats, adding global buffs, equipping new spells, or granting relics. It also provides a build snapshot for the Result Screen and serves as the query source for the Upgrade Pool System when generating contextually relevant card choices.

## Player Fantasy

The Build System is the invisible backbone of the "I built this" feeling. Every upgrade card chosen, every spell acquired, every relic found — they all flow through the Build System. The player doesn't interact with it directly, but they feel it every time their damage spikes after a synergistic upgrade, or when a new relic triggers a chain reaction they didn't expect. The fantasy is: "my choices compound into something greater than the sum of its parts."

## Detailed Design

### Core Rules

1. The Build System maintains the authoritative `BuildState`:
   ```ts
   interface BuildState {
     spells: SpellSlotState[];       // equipped spells with modifiers
     relics: string[];               // active relic IDs
     globalModifiers: GlobalMod[];   // stat buffs applied to PlayerState
     elementAffinity: ElementAffinity;  // fire/ice/lightning/arcane counts
     upgradeHistory: string[];       // ordered list of all chosen upgrade IDs
     tags: string[];                 // accumulated build tags for synergy matching
   }
   ```

2. **Applying Upgrade Cards**: When the player chooses a card (via `UPGRADE_CHOSEN` event), the Build System reads the card's `ApplyInstruction[]` and executes them:
   ```ts
   type ApplyInstruction = {
     target: 'player' | 'spell' | 'tag';
     targetId?: string;           // spellId for spell-targeted upgrades
     operation: 'add' | 'mul' | 'set' | 'append_tag';
     field: string;
     value: number | string;
   };
   ```

3. **Instruction Execution**:
   - `target: 'player'` → Modify `PlayerState` field (e.g., `{ target: 'player', field: 'maxHp', operation: 'add', value: 20 }`)
   - `target: 'spell'` → Add a `SpellModifier` to the specified spell slot (e.g., `{ target: 'spell', targetId: 'arcane_missile', field: 'baseDamage', operation: 'mul', value: 1.2 }`)
   - `target: 'tag'` → Append a tag to the build (e.g., `{ target: 'tag', operation: 'append_tag', field: 'tags', value: 'fire_mastery' }`)

4. **New Spell Acquisition**: When an upgrade card has `category: 'new_spell'`, the Build System:
   - Finds the first empty spell slot
   - Creates a new `SpellSlotState` with the spell's base config
   - Updates element affinity
   - Emits `SPELL_ACQUIRED` (not in original event catalog — add if needed, or use `UPGRADE_CHOSEN`)

5. **Relic Acquisition**: When an upgrade card has `category: 'relic'`, the Build System:
   - Adds the relic ID to `relics[]`
   - Emits `RELIC_ACQUIRED` on Event Bus
   - The Relic System subscribes and activates the relic's passive effects

6. **Element Affinity Updates**: Whenever a spell is acquired or an element infusion is applied, the Build System updates `elementAffinity` counts. The Element System reads these for reaction logic; the Upgrade Pool System reads them for card generation bias.

7. **Build Snapshot**: The Build System can produce a `BuildSnapshot` for the Result Screen:
   ```ts
   interface BuildSnapshot {
     spells: { id: string; name: string; level: number; element: ElementType | null }[];
     relics: string[];
     totalUpgrades: number;
     dominantElement: ElementType | null;
     tags: string[];
   }
   ```

8. **Global Modifiers**: Some upgrade cards apply global stat changes (e.g., "+12% 法强", "+10% crit"). These are stored as `GlobalMod` entries and applied to `PlayerState` additively. The Build System recalculates all global modifiers when a new one is added.

### States and Transitions

The Build System is stateless in terms of its own operation — it is a data store with apply/query methods. `BuildState` is modified only when `UPGRADE_CHOSEN` fires.

### Interactions with Other Systems

| System | Direction | Interface |
|--------|-----------|-----------|
| Event Bus | Subscribes | `UPGRADE_CHOSEN` → apply upgrade card |
| Spell System | Modifies | Adds SpellModifiers to spell slots; adds new spells |
| Player Controller | Modifies | Applies global stat changes to PlayerState |
| Element System | Modifies | Updates element affinity on spell/infusion changes |
| Relic System | Triggers | Emits `RELIC_ACQUIRED` for relic activation |
| Upgrade Pool System | Reads from | `getBuildState()` for contextual card generation |
| HUD | Reads from | Current spell/relic display |
| Result Screen | Reads from | `getSnapshot()` for post-run build summary |

## Formulas

### Global Modifier Application
```
for each globalMod in globalModifiers:
  if mod.operation == 'add': playerState[mod.field] += mod.value
  if mod.operation == 'mul': playerState[mod.field] *= mod.value
```
Applied in order: all `add` first, then all `mul` (same as spell modifiers).

### Element Affinity
```
affinity[element] = spellCount[element] + infusionCount[element] + relicBonus[element]
dominantElement = element with max affinity (null if tied or all zero)
```
Note: Element System is the authoritative owner of the affinity formula. See element-system.md for variable definitions. `relicBonus` accounts for element-boosting relics (0–3 per element).

## Edge Cases

| Scenario | Expected Behavior | Rationale |
|----------|------------------|-----------|
| Upgrade targets a spell the player doesn't have | Should never happen — Upgrade Pool filters by equipped spells | Pool validation prevents this |
| New spell offered when all slots full | Should never happen — Upgrade Pool checks slot availability | Pool validation prevents this |
| Duplicate relic offered | Should never happen — Upgrade Pool excludes owned relics | Pool validation prevents this |
| Player has no element affinity (all untyped) | dominantElement = null, no bias in Upgrade Pool | Valid early-game state |
| Global modifier reduces a stat below 0 | Clamped by PlayerState (e.g., moveSpeed min 50, critChance min 0) | PlayerState owns clamping |
| 30+ upgrades in a single run | upgradeHistory grows unbounded — acceptable for 12-min run | No performance concern at this scale |

## Dependencies

| System | Direction | Nature of Dependency |
|--------|-----------|---------------------|
| Spell System | Downstream | Hard — Build System writes SpellModifiers and new spells to spell slots |
| Element System | Upstream | Hard — updates affinity |
| Event Bus | Upstream | Hard — subscribes to UPGRADE_CHOSEN |

**Depended on by:**

| System | Nature |
|--------|--------|
| Upgrade Pool System | Hard — reads build state for card generation |
| Relic System | Hard — receives RELIC_ACQUIRED |
| HUD | Soft — reads build for display |
| Result Screen | Soft — reads snapshot for summary |

## Tuning Knobs

| Parameter | Current Value | Safe Range | Effect of Increase | Effect of Decrease |
|-----------|--------------|------------|-------------------|-------------------|
| `MAX_RELICS` | 10 | 5–15 | More relic slots | Fewer relics per run |
| `MAX_GLOBAL_MODS` | 30 | 15–50 | More stat upgrades possible | Tighter cap |

Most tuning is in the upgrade cards themselves (data/spellUpgrades.ts, data/relics.ts), not in the Build System.

## Visual/Audio Requirements

N/A — The Build System is a data layer. Visual feedback is owned by HUD and Level-Up Panel.

## UI Requirements

| Information | Display Location | Update Frequency | Condition |
|-------------|-----------------|-----------------|-----------|
| Current build summary | Build panel (optional overlay) | On upgrade chosen | When panel opened |
| Build snapshot | Result Screen | End of run | Post-run |

## Acceptance Criteria

- [ ] ApplyInstruction executes correctly for player/spell/tag targets
- [ ] New spells equip to first empty slot
- [ ] Relics add to build and emit RELIC_ACQUIRED
- [ ] Element affinity updates on spell acquire and element infusion
- [ ] Global modifiers apply in correct order (add then mul)
- [ ] BuildSnapshot accurately reflects current build state
- [ ] upgradeHistory records all chosen upgrades in order
- [ ] Build tags accumulate correctly for synergy matching
- [ ] All build data is queryable by Upgrade Pool System
- [ ] No duplicate relics in build state

## Open Questions

None — the Build System design is fully specified.
