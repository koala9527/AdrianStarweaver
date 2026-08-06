# Technical Preferences

<!-- Populated by /setup-engine. Updated as the user makes decisions throughout development. -->
<!-- All agents reference this file for project-specific standards and conventions. -->

## Engine & Language

- **Engine**: Phaser 3.90.0
- **Language**: TypeScript (strict mode)
- **Rendering**: WebGL (Canvas fallback)
- **Physics**: Phaser Arcade Physics

## Naming Conventions

- **Classes**: PascalCase (e.g., `PlayerController`)
- **Variables/Functions**: camelCase (e.g., `moveSpeed`, `takeDamage()`)
- **Events**: camelCase with `on` prefix (e.g., `onHealthChanged`)
- **Files**: PascalCase matching class (e.g., `PlayerController.ts`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `MAX_HEALTH`)
- **Data configs**: camelCase files (e.g., `spells.ts`, `enemies.ts`)

## Performance Budgets

- **Target Framerate**: 60fps
- **Frame Budget**: 16.6ms
- **Draw Calls**: [TO BE CONFIGURED — profile after prototype]
- **Memory Ceiling**: [TO BE CONFIGURED — profile after prototype]
- **Max Simultaneous Enemies**: 100+ (use object pooling)
- **Max Simultaneous Projectiles**: 200+ (use object pooling)

## Testing

- **Framework**: Vitest
- **Minimum Coverage**: [TO BE CONFIGURED]
- **Required Tests**: Balance formulas, gameplay systems

## Build & Dev

- **Bundler**: Vite
- **Package Manager**: npm
- **Data Storage**: LocalStorage (browser)
- **Target Platform**: PC Browser (H5)

## Forbidden Patterns

- No hardcoded gameplay values — all balance data must be in `data/` config files
- No singletons — use dependency injection for testability
- No `any` type in TypeScript — use proper typing

## Allowed Libraries / Addons

- Phaser 3.90.0
- Vite (build tool)
- Vitest (testing)

## Architecture Decisions Log

- [No ADRs yet — use /architecture-decision to create one]
