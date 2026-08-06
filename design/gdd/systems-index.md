# Systems Index: 咒语旅团 (Spell Brigade)

> **Status**: Approved
> **Created**: 2026-03-28
> **Last Updated**: 2026-03-28
> **Source Concept**: docs/guide.md

---

## Overview

咒语旅团 is a top-down auto-cast survival roguelike (Vampire Survivors-style) for PC browser (H5).
The player controls a mage who automatically casts spells while the player focuses on positioning.
The core loop is: move → auto-cast → kill → collect XP → level up (3-pick-1) → build synergies.
A 12-minute run culminates in a boss fight. Systems must support 100+ simultaneous enemies,
spell projectile spam, and a data-driven build/upgrade system with element synergies.

Tech stack: Phaser 3.90.0 + TypeScript + Vite.

---

## Systems Enumeration

| # | System Name | Category | Priority | Status | Design Doc | Depends On |
|---|-------------|----------|----------|--------|------------|------------|
| 1 | Event Bus | Core | MVP | Designed | design/gdd/event-bus.md | — |
| 2 | Input System | Core | MVP | Designed | design/gdd/input-system.md | — |
| 3 | Object Pool | Core | MVP | Designed | design/gdd/object-pool.md | — |
| 4 | Game Timer | Core | MVP | Designed | design/gdd/game-timer.md | — |
| 5 | Scene Manager | Core | MVP | Designed | design/gdd/scene-manager.md | — |
| 6 | Camera System | Core | MVP | Designed | design/gdd/camera-system.md | Scene Manager |
| 7 | Player Controller | Gameplay | MVP | Designed | design/gdd/player-controller.md | Input System, Scene Manager |
| 8 | Collision System | Core | MVP | Designed | design/gdd/collision-system.md | Scene Manager |
| 9 | Element System | Gameplay | MVP | Designed | design/gdd/element-system.md | Event Bus |
| 10 | Status Effect System | Gameplay | MVP | Designed | design/gdd/status-effect-system.md | Event Bus |
| 11 | Spell System | Gameplay | MVP | Designed | design/gdd/spell-system.md | Player Controller, Object Pool, Collision System, Element System, Event Bus |
| 12 | Enemy System | Gameplay | MVP | Designed | design/gdd/enemy-system.md | Object Pool, Collision System, Player Controller |
| 13 | Combat System | Gameplay | MVP | Designed | design/gdd/combat-system.md | Spell System, Enemy System, Status Effect System, Element System, Event Bus |
| 14 | Loot & Pickup System | Economy | MVP | Designed | design/gdd/loot-pickup-system.md | Object Pool, Collision System, Player Controller, Event Bus |
| 15 | Spawn Director | Gameplay | MVP | Designed | design/gdd/spawn-director.md | Enemy System, Game Timer, Event Bus |
| 16 | Build System | Progression | MVP | Designed | design/gdd/build-system.md | Spell System, Element System, Event Bus |
| 17 | Upgrade Pool System | Progression | MVP | Designed | design/gdd/upgrade-pool-system.md | Build System, Spell System, Relic System |
| 18 | XP & Level-Up System | Progression | MVP | Designed | design/gdd/xp-levelup-system.md | Loot & Pickup System, Upgrade Pool System, Event Bus |
| 19 | HUD | UI | MVP | Designed | design/gdd/hud.md | Player Controller, Spell System, Game Timer, XP & Level-Up System |
| 20 | Level-Up Panel | UI | MVP | Designed | design/gdd/level-up-panel.md | XP & Level-Up System, Upgrade Pool System |
| 21 | Relic System | Progression | Vertical Slice | Not Started | — | Event Bus, Build System |
| 22 | Event System | Gameplay | Vertical Slice | Not Started | — | Game Timer, Spawn Director, Event Bus |
| 23 | Boss System | Gameplay | Vertical Slice | Not Started | — | Enemy System, Spawn Director, Event System |
| 24 | VFX / Particle System | UI | Vertical Slice | Not Started | — | Spell System, Combat System, Element System |
| 25 | Damage Numbers | UI | Vertical Slice | Not Started | — | Combat System |
| 26 | Result Screen | UI | Vertical Slice | Not Started | — | Build System, Meta-Progression, Game Timer |
| 27 | Save System | Persistence | Alpha | Not Started | — | — |
| 28 | Meta-Progression | Progression | Alpha | Not Started | — | Save System |
| 29 | Menu UI | UI | Alpha | Not Started | — | Save System, Meta-Progression |
| 30 | Audio System | Audio | Alpha | Not Started | — | Scene Manager, Event Bus |

---

## Categories

| Category | Description |
|----------|-------------|
| **Core** | Foundation systems everything depends on |
| **Gameplay** | Systems that make the game fun — combat, spells, enemies, spawning |
| **Progression** | How the player grows — XP, builds, upgrades, relics, meta-progression |
| **Economy** | Resource creation and consumption — loot, pickups |
| **Persistence** | Save state — LocalStorage |
| **UI** | Player-facing displays — HUD, panels, menus, VFX, damage numbers |
| **Audio** | Sound and music |

---

## Priority Tiers

| Tier | Definition | Target Milestone | Systems |
|------|------------|------------------|---------|
| **MVP** | Core loop: move + auto-cast + kill + level-up + build | M1: Core Prototype | 20 systems |
| **Vertical Slice** | Complete 12-min run with boss, events, relics, polish | M2: Verifiable Demo | 6 systems |
| **Alpha** | Persistence, meta-progression, menus, audio | M3: Polish | 4 systems |

---

## Dependency Map

### Foundation Layer (no dependencies)

1. **Event Bus** — central pub/sub for all system communication
2. **Input System** — WASD + mouse, read by player controller
3. **Object Pool** — generic reuse for enemies, projectiles, pickups
4. **Game Timer** — 12-minute run clock, drives spawn director and events
5. **Scene Manager** — Boot → Menu → Run → Result scene lifecycle
6. **Save System** — LocalStorage read/write (no game logic deps)

### Core Layer (depends on Foundation)

1. **Camera System** — depends on: Scene Manager
2. **Player Controller** — depends on: Input System, Scene Manager
3. **Collision System** — depends on: Scene Manager (Phaser Arcade Physics)

### Feature Layer (depends on Core)

1. **Element System** — depends on: Event Bus
2. **Status Effect System** — depends on: Event Bus
3. **Spell System** — depends on: Player Controller, Object Pool, Collision System, Element System, Event Bus
4. **Enemy System** — depends on: Object Pool, Collision System, Player Controller
5. **Combat System** — depends on: Spell System, Enemy System, Status Effect System, Element System, Event Bus
6. **Loot & Pickup System** — depends on: Object Pool, Collision System, Player Controller, Event Bus
7. **Spawn Director** — depends on: Enemy System, Game Timer, Event Bus
8. **Build System** — depends on: Spell System, Element System, Event Bus
9. **Relic System** — depends on: Event Bus, Build System
10. **Upgrade Pool System** — depends on: Build System, Spell System, Relic System
11. **XP & Level-Up System** — depends on: Loot & Pickup System, Upgrade Pool System, Event Bus
12. **Event System** — depends on: Game Timer, Spawn Director, Event Bus
13. **Boss System** — depends on: Enemy System, Spawn Director, Event System
14. **Meta-Progression** — depends on: Save System

### Presentation Layer (depends on Features)

1. **HUD** — depends on: Player Controller, Spell System, Game Timer, XP & Level-Up System
2. **Level-Up Panel** — depends on: XP & Level-Up System, Upgrade Pool System
3. **Result Screen** — depends on: Build System, Meta-Progression, Game Timer
4. **Menu UI** — depends on: Save System, Meta-Progression
5. **VFX / Particle System** — depends on: Spell System, Combat System, Element System
6. **Damage Numbers** — depends on: Combat System
7. **Audio System** — depends on: Scene Manager, Event Bus

---

## Recommended Design Order

| Order | System | Priority | Layer | Est. Effort |
|-------|--------|----------|-------|-------------|
| 1 | Event Bus | MVP | Foundation | S |
| 2 | Input System | MVP | Foundation | S |
| 3 | Object Pool | MVP | Foundation | S |
| 4 | Game Timer | MVP | Foundation | S |
| 5 | Scene Manager | MVP | Foundation | S |
| 6 | Camera System | MVP | Core | S |
| 7 | Player Controller | MVP | Core | M |
| 8 | Collision System | MVP | Core | S |
| 9 | Element System | MVP | Feature | S |
| 10 | Status Effect System | MVP | Feature | M |
| 11 | Spell System | MVP | Feature | L |
| 12 | Enemy System | MVP | Feature | M |
| 13 | Combat System | MVP | Feature | M |
| 14 | Loot & Pickup System | MVP | Feature | S |
| 15 | Spawn Director | MVP | Feature | M |
| 16 | Build System | MVP | Feature | M |
| 17 | Upgrade Pool System | MVP | Feature | M |
| 18 | XP & Level-Up System | MVP | Feature | M |
| 19 | HUD | MVP | Presentation | M |
| 20 | Level-Up Panel | MVP | Presentation | M |
| 21 | Relic System | V-Slice | Feature | M |
| 22 | Event System | V-Slice | Feature | M |
| 23 | Boss System | V-Slice | Feature | M |
| 24 | VFX / Particle System | V-Slice | Presentation | M |
| 25 | Damage Numbers | V-Slice | Presentation | S |
| 26 | Result Screen | V-Slice | Presentation | S |
| 27 | Save System | Alpha | Persistence | S |
| 28 | Meta-Progression | Alpha | Progression | M |
| 29 | Menu UI | Alpha | Presentation | M |
| 30 | Audio System | Alpha | Presentation | S |

(S = 1 session, M = 2-3 sessions, L = 4+ sessions)

---

## Circular Dependencies

- **Build System ↔ Relic System**: Build System tracks relics, Relic System needs Build context.
  **Resolution**: Build System owns the data store. Relic System reads build state via Event Bus
  queries (one-way: Relic → Build). Upgrade Pool System depends on both but only reads from them.

No other cycles detected.

---

## High-Risk Systems

| System | Risk Type | Risk Description | Mitigation |
|--------|-----------|-----------------|------------|
| Spell System | Design + Technical | Most complex system — 6 spells × 4 upgrade tiers × 4 elements, auto-targeting, projectile spawning at scale | Design GDD thoroughly; prototype early with 1 spell |
| Spawn Director | Design | Dynamic difficulty must feel fair — too aggressive = frustrating, too passive = boring | Use guide.md budget formula; tune with playtesting |
| Upgrade Pool System | Design | Weighted card generation must produce meaningful choices, not garbage hands | Implement synergy scoring from guide.md §8.3; test with simulated runs |
| Object Pool | Technical | H5 performance with 100+ enemies + 200+ projectiles | Profile early; set hard caps per guide.md §20 |

---

## Progress Tracker

| Metric | Count |
|--------|-------|
| Total systems identified | 30 |
| Design docs started | 20 |
| Design docs reviewed | 0 |
| Design docs approved | 0 |
| MVP systems designed | 20/20 |
| Vertical Slice systems designed | 0/6 |
| Alpha systems designed | 0/4 |

---

## Next Steps

- [ ] Design MVP-tier systems first (use `/design-system [system-name]`)
- [ ] Start with Event Bus, Input System, Object Pool (Foundation layer)
- [ ] Spell System is highest-risk — prioritize its GDD
- [ ] Run `/design-review` on each completed GDD
- [ ] Prototype core loop after first 13 systems are designed
- [ ] Run `/gate-check pre-production` when MVP systems are designed
