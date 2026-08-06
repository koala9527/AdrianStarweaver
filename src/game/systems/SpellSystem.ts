import { Player } from '../entities/Player';
import { Projectile } from '../entities/Projectile';
import { Enemy } from '../entities/Enemy';
import { ObjectPool } from '../core/ObjectPool';
import { CollisionSystem } from '../core/CollisionSystem';
import { EventBus } from '../core/EventBus';
import { SpellConfig, SpellSlotState, SpellModifier, GameEvents } from '../types';
import { SPELL_CONFIGS } from '../data/spells';
import { SPELL_VFX } from '../data/spellVfx';

interface LaserBeam {
  line: Phaser.GameObjects.Graphics;
  timer: number;
  targets: Enemy[];
  spellId: string;
  damage: number;
}

interface AuraEffect {
  ring: Phaser.GameObjects.Graphics;
  spellId: string;
  tickTimer: number;
  tickInterval: number;
  damage: number;
  radius: number;
}

interface OrbitOrb {
  sprite: Phaser.GameObjects.Arc;
  angle: number;
  radius: number;
  speed: number;
  spellId: string;
  damage: number;
  hitCooldowns: Map<Enemy, number>;
}

interface BeamEffect {
  gfx: Phaser.GameObjects.Graphics;
  spellId: string;
  target: Enemy | null;
  timer: number;
  duration: number;
  tickTimer: number;
  tickInterval: number;
  damage: number;
  radius: number;
}

interface SpinEffect {
  gfx: Phaser.GameObjects.Graphics;
  spellId: string;
  angle: number;
  tickTimer: number;
  tickInterval: number;
  damage: number;
  radius: number;
  hitCooldowns: Map<Enemy, number>;
}

export class SpellSystem {
  private scene: Phaser.Scene;
  private player: Player;
  private projectilePool: ObjectPool<Projectile>;
  private collisionSystem: CollisionSystem;
  private eventBus: EventBus;

  // Non-projectile spell visuals
  private laserBeams: LaserBeam[] = [];
  private auraEffects: AuraEffect[] = [];
  private orbitOrbs: OrbitOrb[] = [];
  private beamEffects: BeamEffect[] = [];
  private spinEffects: SpinEffect[] = [];

  constructor(
    scene: Phaser.Scene,
    player: Player,
    projectilePool: ObjectPool<Projectile>,
    collisionSystem: CollisionSystem,
    eventBus: EventBus,
  ) {
    this.scene = scene;
    this.player = player;
    this.projectilePool = projectilePool;
    this.collisionSystem = collisionSystem;
    this.eventBus = eventBus;
  }

  equipSpell(spellId: string): void {
    const config = SPELL_CONFIGS[spellId];
    if (!config) return;
    if (this.player.playerState.spellSlots.length >= 4) return;

    this.player.playerState.spellSlots.push({
      spellId: config.id,
      level: 1,
      element: config.element,
      cooldownRemaining: 0,
      modifiers: [],
    });

    // Initialize orbit orbs immediately
    if (config.spellType === 'orbit') {
      this.initOrbitOrbs(config);
    }
    // Initialize aura immediately
    if (config.spellType === 'aura') {
      this.initAura(config);
    }
    // Initialize spin immediately
    if (config.spellType === 'spin') {
      this.initSpin(config);
    }
  }

  update(delta: number): void {
    const deltaSec = delta / 1000;

    for (const slot of this.player.playerState.spellSlots) {
      const config = SPELL_CONFIGS[slot.spellId];
      if (!config) continue;

      // Tick cooldown
      if (slot.cooldownRemaining > 0) {
        slot.cooldownRemaining -= deltaSec * this.player.playerState.cooldownRate;
        if (slot.cooldownRemaining < 0) slot.cooldownRemaining = 0;
      }

      // Auto-cast when ready (projectile and laser types)
      if (slot.cooldownRemaining <= 0 && config.castMode === 'auto') {
        const spellType = config.spellType ?? 'projectile';
        if (spellType === 'projectile') {
          this.castProjectile(slot, config);
        } else if (spellType === 'laser') {
          this.castLaser(slot, config);
        } else if (spellType === 'beam') {
          this.castBeam(slot, config);
        }
        // aura, orbit, spin are continuous, handled in their update loops
      }
    }

    // Update active projectiles
    for (const proj of this.projectilePool.getActiveObjects()) {
      if (proj.active) {
        (proj as Projectile).updateProjectile(delta);
      }
    }

    // Update lasers
    this.updateLasers(delta);

    // Update auras
    this.updateAuras(delta);

    // Update orbit orbs
    this.updateOrbitOrbs(delta);

    // Update beams
    this.updateBeams(delta);

    // Update spins
    this.updateSpins(delta);
  }

  // ========== PROJECTILE SPELLS ==========

  private castProjectile(slot: SpellSlotState, config: SpellConfig): void {
    const effectiveDamage = this.getEffectiveStat(config.baseDamage, 'baseDamage', slot.modifiers);
    const effectiveSpeed = this.getEffectiveStat(config.projectileSpeed ?? 350, 'projectileSpeed', slot.modifiers);
    const effectiveCooldown = Math.max(0.1, this.getEffectiveStat(config.cooldown, 'cooldown', slot.modifiers));
    const effectivePierce = Math.floor(this.getEffectiveStat(config.pierce ?? 0, 'pierce', slot.modifiers));
    const effectiveCount = Math.floor(this.getEffectiveStat(config.projectileCount ?? 1, 'projectileCount', slot.modifiers));

    const mode = config.targetMode ?? 'nearest';

    if (mode === 'surround') {
      for (let i = 0; i < effectiveCount; i++) {
        const proj = this.projectilePool.acquire() as Projectile;
        const angle = (i / effectiveCount) * Math.PI * 2;
        proj.fire(
          this.player.x, this.player.y,
          Math.cos(angle) * effectiveSpeed,
          Math.sin(angle) * effectiveSpeed,
          config.id, effectiveDamage, slot.element, effectivePierce,
        );
      }
    } else if (mode === 'area') {
      for (let i = 0; i < effectiveCount; i++) {
        const proj = this.projectilePool.acquire() as Projectile;
        const angle = (i / effectiveCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
        proj.fire(
          this.player.x, this.player.y,
          Math.cos(angle) * effectiveSpeed,
          Math.sin(angle) * effectiveSpeed,
          config.id, effectiveDamage, slot.element, effectivePierce,
        );
      }
    } else if (mode === 'random') {
      const enemies = this.collisionSystem.enemyGroup.getChildren() as Enemy[];
      const active = enemies.filter(e => e.active);
      for (let i = 0; i < effectiveCount; i++) {
        const t = active.length > 0 ? active[Math.floor(Math.random() * active.length)] : null;
        if (!t) break;
        const proj = this.projectilePool.acquire() as Projectile;
        const dx = t.x - this.player.x;
        const dy = t.y - this.player.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        proj.fire(
          this.player.x, this.player.y,
          (dx / dist) * effectiveSpeed,
          (dy / dist) * effectiveSpeed,
          config.id, effectiveDamage, slot.element, effectivePierce,
        );
      }
    } else {
      const target = this.findNearestEnemy();
      if (!target) { slot.cooldownRemaining = 0.2; return; }

      for (let i = 0; i < effectiveCount; i++) {
        const proj = this.projectilePool.acquire() as Projectile;
        const dx = target.x - this.player.x;
        const dy = target.y - this.player.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const spreadAngle = effectiveCount > 1
          ? (i - (effectiveCount - 1) / 2) * 0.15
          : 0;
        const baseAngle = Math.atan2(dy, dx);
        const angle = baseAngle + spreadAngle;
        proj.fire(
          this.player.x, this.player.y,
          Math.cos(angle) * effectiveSpeed,
          Math.sin(angle) * effectiveSpeed,
          config.id, effectiveDamage, slot.element, effectivePierce,
        );
      }
    }

    slot.cooldownRemaining = effectiveCooldown;
    this.emitCast(config, slot);
  }

  // ========== LASER SPELLS ==========

  private castLaser(slot: SpellSlotState, config: SpellConfig): void {
    const effectiveDamage = this.getEffectiveStat(config.baseDamage, 'baseDamage', slot.modifiers);
    const effectiveCooldown = Math.max(0.1, this.getEffectiveStat(config.cooldown, 'cooldown', slot.modifiers));
    const effectiveRadius = this.getEffectiveStat(config.radius ?? 350, 'radius', slot.modifiers);
    const chainCount = Math.floor(this.getEffectiveStat(config.chain ?? 3, 'chain', slot.modifiers));

    const enemies = this.collisionSystem.enemyGroup.getChildren() as Enemy[];
    const active = enemies.filter(e => e.active);
    if (active.length === 0) { slot.cooldownRemaining = 0.2; return; }

    // Find nearest enemy within radius
    let nearest: Enemy | null = null;
    let minDist = effectiveRadius * effectiveRadius;
    for (const e of active) {
      const dx = e.x - this.player.x;
      const dy = e.y - this.player.y;
      const d = dx * dx + dy * dy;
      if (d < minDist) { minDist = d; nearest = e; }
    }
    if (!nearest) { slot.cooldownRemaining = 0.2; return; }

    // Build chain targets
    const targets: Enemy[] = [nearest];
    const used = new Set<Enemy>([nearest]);
    for (let i = 1; i < chainCount; i++) {
      const last = targets[targets.length - 1];
      let nextBest: Enemy | null = null;
      let nextDist = 200 * 200; // chain range 200px
      for (const e of active) {
        if (used.has(e)) continue;
        const dx = e.x - last.x;
        const dy = e.y - last.y;
        const d = dx * dx + dy * dy;
        if (d < nextDist) { nextDist = d; nextBest = e; }
      }
      if (!nextBest) break;
      targets.push(nextBest);
      used.add(nextBest);
    }

    // Draw laser graphics — jagged lightning arc
    const vfx = SPELL_VFX[config.id] ?? SPELL_VFX.arcane_missile;
    const gfx = this.scene.add.graphics().setDepth(140);

    // Draw from player to first target, then chain
    const points: { x: number; y: number }[] = [
      { x: this.player.x, y: this.player.y },
      ...targets.map(t => ({ x: t.x, y: t.y })),
    ];

    // Generate jagged lightning path between each pair of points
    const drawLightningSegment = (
      g: Phaser.GameObjects.Graphics,
      x1: number, y1: number, x2: number, y2: number,
      lineWidth: number, color: number, alpha: number,
    ) => {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const segments = Math.max(4, Math.floor(dist / 20));
      const perpX = -dy / dist;
      const perpY = dx / dist;

      g.lineStyle(lineWidth, color, alpha);
      g.beginPath();
      g.moveTo(x1, y1);
      for (let s = 1; s < segments; s++) {
        const t = s / segments;
        const mx = x1 + dx * t;
        const my = y1 + dy * t;
        const jitter = (Math.random() - 0.5) * 24;
        g.lineTo(mx + perpX * jitter, my + perpY * jitter);
      }
      g.lineTo(x2, y2);
      g.strokePath();
    };

    // Outer glow
    for (let i = 1; i < points.length; i++) {
      drawLightningSegment(gfx, points[i - 1].x, points[i - 1].y, points[i].x, points[i].y, 6, vfx.hitColor, 0.4);
    }
    // Main bolt
    for (let i = 1; i < points.length; i++) {
      drawLightningSegment(gfx, points[i - 1].x, points[i - 1].y, points[i].x, points[i].y, 3, vfx.hitColor, 0.9);
    }
    // Inner bright core
    for (let i = 1; i < points.length; i++) {
      drawLightningSegment(gfx, points[i - 1].x, points[i - 1].y, points[i].x, points[i].y, 1.5, 0xffffff, 0.8);
    }

    // Branch lightning forks
    for (let i = 1; i < points.length; i++) {
      if (Math.random() < 0.6) {
        const midT = 0.3 + Math.random() * 0.4;
        const mx = points[i - 1].x + (points[i].x - points[i - 1].x) * midT;
        const my = points[i - 1].y + (points[i].y - points[i - 1].y) * midT;
        const branchAngle = Math.atan2(points[i].y - points[i - 1].y, points[i].x - points[i - 1].x)
          + (Math.random() - 0.5) * 1.5;
        const branchLen = 20 + Math.random() * 30;
        const bx = mx + Math.cos(branchAngle) * branchLen;
        const by = my + Math.sin(branchAngle) * branchLen;
        drawLightningSegment(gfx, mx, my, bx, by, 1.5, vfx.hitColor, 0.5);
      }
    }

    this.laserBeams.push({
      line: gfx,
      timer: config.duration ?? 300,
      targets,
      spellId: config.id,
      damage: effectiveDamage,
    });

    // Deal damage to all chain targets
    for (const t of targets) {
      this.eventBus.emit(GameEvents.SPELL_HIT, {
        spellId: config.id,
        element: slot.element,
        target: t,
        damage: effectiveDamage,
        isCrit: false,
        position: { x: t.x, y: t.y },
      });
    }

    slot.cooldownRemaining = effectiveCooldown;
    this.emitCast(config, slot);
  }

  private updateLasers(delta: number): void {
    for (let i = this.laserBeams.length - 1; i >= 0; i--) {
      const beam = this.laserBeams[i];
      beam.timer -= delta;
      const alpha = Math.max(0, beam.timer / 300);
      beam.line.setAlpha(alpha);
      if (beam.timer <= 0) {
        beam.line.destroy();
        this.laserBeams.splice(i, 1);
      }
    }
  }

  // ========== AURA SPELLS ==========

  private initAura(config: SpellConfig): void {
    const vfx = SPELL_VFX[config.id] ?? SPELL_VFX.arcane_missile;
    const gfx = this.scene.add.graphics().setDepth(130);

    const slot = this.player.playerState.spellSlots.find(s => s.spellId === config.id);
    const mods = slot?.modifiers ?? [];
    const radius = this.getEffectiveStat(config.radius ?? 150, 'radius', mods);
    const damage = this.getEffectiveStat(config.baseDamage, 'baseDamage', mods);
    const cooldown = Math.max(0.1, this.getEffectiveStat(config.cooldown, 'cooldown', mods));

    // Draw aura ring
    gfx.lineStyle(3, vfx.hitColor, 0.4);
    gfx.strokeCircle(0, 0, radius);
    gfx.fillStyle(vfx.hitColor, 0.08);
    gfx.fillCircle(0, 0, radius);

    this.auraEffects.push({
      ring: gfx,
      spellId: config.id,
      tickTimer: 0,
      tickInterval: cooldown * 1000,
      damage,
      radius,
    });
  }

  private updateAuras(delta: number): void {
    const deltaSec = delta / 1000;

    for (const aura of this.auraEffects) {
      // Follow player
      aura.ring.setPosition(this.player.x, this.player.y);

      // Pulse effect
      const pulse = 0.9 + Math.sin(Date.now() * 0.003) * 0.1;
      aura.ring.setScale(pulse);

      // Rotating rune particles around aura edge
      if (Math.random() < 0.15) {
        const angle = Math.random() * Math.PI * 2;
        const vfx = SPELL_VFX[aura.spellId] ?? SPELL_VFX.arcane_missile;
        const px = this.player.x + Math.cos(angle) * aura.radius;
        const py = this.player.y + Math.sin(angle) * aura.radius;
        const rune = this.scene.add.circle(px, py, 2 + Math.random() * 2, vfx.hitColor, 0.6)
          .setDepth(131);
        const orbitAngle = angle + Math.PI * 0.5;
        this.scene.tweens.add({
          targets: rune,
          x: px + Math.cos(orbitAngle) * 20,
          y: py + Math.sin(orbitAngle) * 20 - 10,
          alpha: 0,
          scaleX: 0.3,
          scaleY: 0.3,
          duration: 600,
          onComplete: () => rune.destroy(),
        });
      }

      // Pulsing ripple wave every ~1.5s
      if (Math.random() < 0.012) {
        const vfx = SPELL_VFX[aura.spellId] ?? SPELL_VFX.arcane_missile;
        const ripple = this.scene.add.circle(this.player.x, this.player.y, aura.radius * 0.3, vfx.hitColor, 0)
          .setDepth(129).setStrokeStyle(2, vfx.hitColor, 0.3);
        this.scene.tweens.add({
          targets: ripple,
          radius: aura.radius,
          alpha: 0,
          duration: 600,
          ease: 'Quad.easeOut',
          onUpdate: () => ripple.setStrokeStyle(2, vfx.hitColor, ripple.alpha * 0.3),
          onComplete: () => ripple.destroy(),
        });
      }

      // Tick damage
      aura.tickTimer += delta;
      if (aura.tickTimer >= aura.tickInterval) {
        aura.tickTimer = 0;

        // Refresh stats from slot
        const slot = this.player.playerState.spellSlots.find(s => s.spellId === aura.spellId);
        const config = SPELL_CONFIGS[aura.spellId];
        if (slot && config) {
          aura.damage = this.getEffectiveStat(config.baseDamage, 'baseDamage', slot.modifiers);
          aura.radius = this.getEffectiveStat(config.radius ?? 150, 'radius', slot.modifiers);

          // Redraw ring — double ring (inner + outer)
          const vfx = SPELL_VFX[aura.spellId] ?? SPELL_VFX.arcane_missile;
          aura.ring.clear();
          // Outer ring
          aura.ring.lineStyle(3, vfx.hitColor, 0.4);
          aura.ring.strokeCircle(0, 0, aura.radius);
          // Inner ring
          aura.ring.lineStyle(1.5, vfx.hitColor, 0.2);
          aura.ring.strokeCircle(0, 0, aura.radius * 0.6);
          // Fill
          aura.ring.fillStyle(vfx.hitColor, 0.08);
          aura.ring.fillCircle(0, 0, aura.radius);

          // Reset cooldown on slot for HUD display
          const cd = Math.max(0.1, this.getEffectiveStat(config.cooldown, 'cooldown', slot.modifiers));
          slot.cooldownRemaining = cd;
        }

        // Damage enemies in radius + attraction pull
        const enemies = this.collisionSystem.enemyGroup.getChildren() as Enemy[];
        const r2 = aura.radius * aura.radius;
        const attractR2 = (aura.radius * 1.5) * (aura.radius * 1.5);
        for (const e of enemies) {
          if (!e.active) continue;
          const dx = e.x - this.player.x;
          const dy = e.y - this.player.y;
          const d2 = dx * dx + dy * dy;

          // Attraction: enemies within 1.5x radius get pulled toward player
          if (d2 <= attractR2 && d2 > 0) {
            const dist = Math.sqrt(d2);
            const pullStrength = 30 * deltaSec;
            const body = e.body as Phaser.Physics.Arcade.Body;
            body.velocity.x -= (dx / dist) * pullStrength;
            body.velocity.y -= (dy / dist) * pullStrength;
          }

          if (d2 <= r2) {
            const config = SPELL_CONFIGS[aura.spellId];
            this.eventBus.emit(GameEvents.SPELL_HIT, {
              spellId: aura.spellId,
              element: config?.element ?? null,
              target: e,
              damage: aura.damage,
              isCrit: false,
              position: { x: e.x, y: e.y },
            });
          }
        }
      }
    }
  }

  // ========== ORBIT SPELLS ==========

  private initOrbitOrbs(config: SpellConfig): void {
    const vfx = SPELL_VFX[config.id] ?? SPELL_VFX.arcane_missile;
    const slot = this.player.playerState.spellSlots.find(s => s.spellId === config.id);
    const mods = slot?.modifiers ?? [];
    const count = Math.floor(this.getEffectiveStat(config.projectileCount ?? 3, 'projectileCount', mods));
    const radius = this.getEffectiveStat(config.radius ?? 100, 'radius', mods);
    const damage = this.getEffectiveStat(config.baseDamage, 'baseDamage', mods);

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const orb = this.scene.add.circle(
        this.player.x + Math.cos(angle) * radius,
        this.player.y + Math.sin(angle) * radius,
        8, vfx.projectileColor, 0.85,
      ).setDepth(145).setStrokeStyle(2, vfx.hitColor, 0.6);

      this.orbitOrbs.push({
        sprite: orb,
        angle,
        radius,
        speed: 2.5,
        spellId: config.id,
        damage,
        hitCooldowns: new Map(),
      });
    }
  }

  private updateOrbitOrbs(delta: number): void {
    const deltaSec = delta / 1000;

    for (const orb of this.orbitOrbs) {
      orb.angle += orb.speed * deltaSec;

      // Refresh stats
      const slot = this.player.playerState.spellSlots.find(s => s.spellId === orb.spellId);
      const config = SPELL_CONFIGS[orb.spellId];
      if (slot && config) {
        orb.damage = this.getEffectiveStat(config.baseDamage, 'baseDamage', slot.modifiers);
        orb.radius = this.getEffectiveStat(config.radius ?? 100, 'radius', slot.modifiers);
      }

      const ox = this.player.x + Math.cos(orb.angle) * orb.radius;
      const oy = this.player.y + Math.sin(orb.angle) * orb.radius;
      orb.sprite.setPosition(ox, oy);

      // Enhanced trail glow — longer, with halo
      const vfx = SPELL_VFX[orb.spellId] ?? SPELL_VFX.arcane_missile;
      const trail = this.scene.add.circle(ox, oy, 6, vfx.projectileColor, 0.25)
        .setDepth(144);
      this.scene.tweens.add({
        targets: trail,
        alpha: 0,
        scaleX: 0.2,
        scaleY: 0.2,
        duration: 300,
        onComplete: () => trail.destroy(),
      });

      // Check collision with enemies
      const enemies = this.collisionSystem.enemyGroup.getChildren() as Enemy[];
      for (const e of enemies) {
        if (!e.active) continue;
        const dx = e.x - ox;
        const dy = e.y - oy;
        if (dx * dx + dy * dy < 30 * 30) {
          // Check hit cooldown
          const lastHit = orb.hitCooldowns.get(e) ?? 0;
          if (Date.now() - lastHit < 500) continue;
          orb.hitCooldowns.set(e, Date.now());

          // Hit burst particles
          for (let i = 0; i < 4; i++) {
            const angle = Math.random() * Math.PI * 2;
            const sp = this.scene.add.circle(
              e.x, e.y, 2 + Math.random() * 2, vfx.hitColor, 0.7,
            ).setDepth(146);
            this.scene.tweens.add({
              targets: sp,
              x: e.x + Math.cos(angle) * 20,
              y: e.y + Math.sin(angle) * 20,
              alpha: 0,
              duration: 250,
              onComplete: () => sp.destroy(),
            });
          }

          this.eventBus.emit(GameEvents.SPELL_HIT, {
            spellId: orb.spellId,
            element: config?.element ?? null,
            target: e,
            damage: orb.damage,
            isCrit: false,
            position: { x: e.x, y: e.y },
          });
        }
      }

      // Clean up stale cooldowns
      for (const [enemy, time] of orb.hitCooldowns) {
        if (!enemy.active || Date.now() - time > 2000) {
          orb.hitCooldowns.delete(enemy);
        }
      }
    }
  }

  // ========== BEAM SPELLS ==========

  private castBeam(slot: SpellSlotState, config: SpellConfig): void {
    const effectiveDamage = this.getEffectiveStat(config.baseDamage, 'baseDamage', slot.modifiers);
    const effectiveCooldown = Math.max(0.1, this.getEffectiveStat(config.cooldown, 'cooldown', slot.modifiers));
    const effectiveRadius = this.getEffectiveStat(config.radius ?? 400, 'radius', slot.modifiers);
    const duration = config.duration ?? 1500;

    const target = this.findNearestEnemy();
    if (!target) { slot.cooldownRemaining = 0.2; return; }

    const dx = target.x - this.player.x;
    const dy = target.y - this.player.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > effectiveRadius) { slot.cooldownRemaining = 0.2; return; }

    const gfx = this.scene.add.graphics().setDepth(141);

    this.beamEffects.push({
      gfx,
      spellId: config.id,
      target,
      timer: duration,
      duration,
      tickTimer: 0,
      tickInterval: 200,
      damage: effectiveDamage,
      radius: effectiveRadius,
    });

    slot.cooldownRemaining = effectiveCooldown;
    this.emitCast(config, slot);
  }

  private updateBeams(delta: number): void {
    for (let i = this.beamEffects.length - 1; i >= 0; i--) {
      const beam = this.beamEffects[i];
      beam.timer -= delta;

      const vfx = SPELL_VFX[beam.spellId] ?? SPELL_VFX.arcane_missile;

      // If target died, find new one
      if (!beam.target || !beam.target.active) {
        beam.target = this.findNearestEnemy();
      }

      // Draw beam
      beam.gfx.clear();
      if (beam.target && beam.target.active) {
        const px = this.player.x;
        const py = this.player.y;
        const tx = beam.target.x;
        const ty = beam.target.y;
        const alpha = Math.min(1, beam.timer / 200); // Fade out at end

        // Outer glow
        beam.gfx.lineStyle(10, vfx.hitColor, alpha * 0.2);
        beam.gfx.beginPath();
        beam.gfx.moveTo(px, py);
        beam.gfx.lineTo(tx, ty);
        beam.gfx.strokePath();

        // Main beam
        beam.gfx.lineStyle(5, vfx.hitColor, alpha * 0.7);
        beam.gfx.beginPath();
        beam.gfx.moveTo(px, py);
        beam.gfx.lineTo(tx, ty);
        beam.gfx.strokePath();

        // Inner core
        beam.gfx.lineStyle(2, 0xffffff, alpha * 0.8);
        beam.gfx.beginPath();
        beam.gfx.moveTo(px, py);
        beam.gfx.lineTo(tx, ty);
        beam.gfx.strokePath();

        // Tick damage
        beam.tickTimer += delta;
        if (beam.tickTimer >= beam.tickInterval) {
          beam.tickTimer = 0;

          // Damage all enemies along the beam line
          const enemies = this.collisionSystem.enemyGroup.getChildren() as Enemy[];
          const bx = tx - px;
          const by = ty - py;
          const bLen = Math.sqrt(bx * bx + by * by) || 1;
          for (const e of enemies) {
            if (!e.active) continue;
            // Point-to-line distance
            const ex = e.x - px;
            const ey = e.y - py;
            const t = Math.max(0, Math.min(1, (ex * bx + ey * by) / (bLen * bLen)));
            const closestX = px + bx * t;
            const closestY = py + by * t;
            const distSq = (e.x - closestX) ** 2 + (e.y - closestY) ** 2;
            if (distSq < 25 * 25) {
              const slot = this.player.playerState.spellSlots.find(s => s.spellId === beam.spellId);
              this.eventBus.emit(GameEvents.SPELL_HIT, {
                spellId: beam.spellId,
                element: slot?.element ?? null,
                target: e,
                damage: beam.damage,
                isCrit: false,
                position: { x: e.x, y: e.y },
              });
            }
          }
        }

        // Sparkle particles along beam
        if (Math.random() < 0.3) {
          const t = Math.random();
          const sx = px + (tx - px) * t + (Math.random() - 0.5) * 8;
          const sy = py + (ty - py) * t + (Math.random() - 0.5) * 8;
          const sp = this.scene.add.circle(sx, sy, 2, vfx.hitColor, 0.7).setDepth(142);
          this.scene.tweens.add({
            targets: sp,
            alpha: 0,
            y: sy - 10,
            duration: 300,
            onComplete: () => sp.destroy(),
          });
        }
      }

      if (beam.timer <= 0) {
        beam.gfx.destroy();
        this.beamEffects.splice(i, 1);
      }
    }
  }

  // ========== SPIN SPELLS ==========

  private initSpin(config: SpellConfig): void {
    const vfx = SPELL_VFX[config.id] ?? SPELL_VFX.arcane_missile;
    const gfx = this.scene.add.graphics().setDepth(132);

    const slot = this.player.playerState.spellSlots.find(s => s.spellId === config.id);
    const mods = slot?.modifiers ?? [];
    const radius = this.getEffectiveStat(config.radius ?? 130, 'radius', mods);
    const damage = this.getEffectiveStat(config.baseDamage, 'baseDamage', mods);
    const cooldown = Math.max(0.1, this.getEffectiveStat(config.cooldown, 'cooldown', mods));

    this.spinEffects.push({
      gfx,
      spellId: config.id,
      angle: 0,
      tickTimer: 0,
      tickInterval: cooldown * 1000,
      damage,
      radius,
      hitCooldowns: new Map(),
    });
  }

  private updateSpins(delta: number): void {
    const deltaSec = delta / 1000;

    for (const spin of this.spinEffects) {
      const vfx = SPELL_VFX[spin.spellId] ?? SPELL_VFX.arcane_missile;

      // Rotate
      spin.angle += 3.0 * deltaSec;

      // Refresh stats
      const slot = this.player.playerState.spellSlots.find(s => s.spellId === spin.spellId);
      const config = SPELL_CONFIGS[spin.spellId];
      if (slot && config) {
        spin.damage = this.getEffectiveStat(config.baseDamage, 'baseDamage', slot.modifiers);
        spin.radius = this.getEffectiveStat(config.radius ?? 130, 'radius', slot.modifiers);
      }

      // Draw rotating fan/arc (90 degree sweep)
      spin.gfx.clear();
      spin.gfx.setPosition(this.player.x, this.player.y);

      const sweepAngle = Math.PI / 2; // 90 degrees
      const startAngle = spin.angle;
      const endAngle = spin.angle + sweepAngle;

      // Filled arc
      spin.gfx.fillStyle(vfx.hitColor, 0.15);
      spin.gfx.beginPath();
      spin.gfx.moveTo(0, 0);
      for (let a = startAngle; a <= endAngle; a += 0.1) {
        spin.gfx.lineTo(Math.cos(a) * spin.radius, Math.sin(a) * spin.radius);
      }
      spin.gfx.lineTo(Math.cos(endAngle) * spin.radius, Math.sin(endAngle) * spin.radius);
      spin.gfx.closePath();
      spin.gfx.fillPath();

      // Arc edge
      spin.gfx.lineStyle(2, vfx.hitColor, 0.5);
      spin.gfx.beginPath();
      for (let a = startAngle; a <= endAngle; a += 0.05) {
        if (a === startAngle) {
          spin.gfx.moveTo(Math.cos(a) * spin.radius, Math.sin(a) * spin.radius);
        } else {
          spin.gfx.lineTo(Math.cos(a) * spin.radius, Math.sin(a) * spin.radius);
        }
      }
      spin.gfx.strokePath();

      // Fire particles at the leading edge
      if (Math.random() < 0.25) {
        const px = this.player.x + Math.cos(endAngle) * spin.radius * (0.5 + Math.random() * 0.5);
        const py = this.player.y + Math.sin(endAngle) * spin.radius * (0.5 + Math.random() * 0.5);
        const p = this.scene.add.circle(px, py, 2 + Math.random() * 2, vfx.hitColor, 0.7)
          .setDepth(133);
        this.scene.tweens.add({
          targets: p,
          alpha: 0,
          y: py - 12,
          scaleX: 0.3,
          scaleY: 0.3,
          duration: 400,
          onComplete: () => p.destroy(),
        });
      }

      // Tick damage to enemies in the sweep arc
      spin.tickTimer += delta;
      if (spin.tickTimer >= spin.tickInterval) {
        spin.tickTimer = 0;

        const enemies = this.collisionSystem.enemyGroup.getChildren() as Enemy[];
        for (const e of enemies) {
          if (!e.active) continue;
          const dx = e.x - this.player.x;
          const dy = e.y - this.player.y;
          const d2 = dx * dx + dy * dy;
          if (d2 > spin.radius * spin.radius) continue;

          // Check if enemy is within the sweep angle
          let enemyAngle = Math.atan2(dy, dx);
          if (enemyAngle < 0) enemyAngle += Math.PI * 2;
          let normStart = startAngle % (Math.PI * 2);
          if (normStart < 0) normStart += Math.PI * 2;
          let normEnd = normStart + sweepAngle;

          const inArc = (enemyAngle >= normStart && enemyAngle <= normEnd) ||
            (enemyAngle + Math.PI * 2 >= normStart && enemyAngle + Math.PI * 2 <= normEnd);

          if (!inArc) continue;

          // Hit cooldown per enemy
          const lastHit = spin.hitCooldowns.get(e) ?? 0;
          if (Date.now() - lastHit < 300) continue;
          spin.hitCooldowns.set(e, Date.now());

          this.eventBus.emit(GameEvents.SPELL_HIT, {
            spellId: spin.spellId,
            element: config?.element ?? null,
            target: e,
            damage: spin.damage,
            isCrit: false,
            position: { x: e.x, y: e.y },
          });
        }

        // Clean stale cooldowns
        for (const [enemy, time] of spin.hitCooldowns) {
          if (!enemy.active || Date.now() - time > 2000) {
            spin.hitCooldowns.delete(enemy);
          }
        }
      }
    }
  }

  // ========== HELPERS ==========

  private emitCast(config: SpellConfig, slot: SpellSlotState): void {
    this.eventBus.emit(GameEvents.SPELL_CAST, {
      spellId: config.id,
      element: slot.element,
      position: { x: this.player.x, y: this.player.y },
      targets: [],
    });
  }

  private findNearestEnemy(): Enemy | null {
    const enemies = this.collisionSystem.enemyGroup.getChildren() as Enemy[];
    let nearest: Enemy | null = null;
    let minDist = Infinity;

    for (const enemy of enemies) {
      if (!enemy.active) continue;
      const dx = enemy.x - this.player.x;
      const dy = enemy.y - this.player.y;
      const dist = dx * dx + dy * dy;
      if (dist < minDist) {
        minDist = dist;
        nearest = enemy;
      }
    }

    return nearest;
  }

  getEffectiveStat(base: number, field: string, modifiers: SpellModifier[]): number {
    let value = base;
    const sets = modifiers.filter(m => m.field === field && m.operation === 'set');
    const adds = modifiers.filter(m => m.field === field && m.operation === 'add');
    const muls = modifiers.filter(m => m.field === field && m.operation === 'mul');

    if (sets.length > 0) value = sets[sets.length - 1].value;
    for (const mod of adds) value += mod.value;
    for (const mod of muls) value *= mod.value;

    return value;
  }

  getEffectiveCooldown(slot: SpellSlotState): number {
    const config = SPELL_CONFIGS[slot.spellId];
    if (!config) return 1;
    return Math.max(0.1, this.getEffectiveStat(config.cooldown, 'cooldown', slot.modifiers));
  }

  getSpellConfig(spellId: string): SpellConfig | null {
    return SPELL_CONFIGS[spellId] ?? null;
  }

  destroy(): void {
    this.projectilePool.releaseAll();
    for (const beam of this.laserBeams) beam.line.destroy();
    for (const aura of this.auraEffects) aura.ring.destroy();
    for (const orb of this.orbitOrbs) orb.sprite.destroy();
    for (const b of this.beamEffects) b.gfx.destroy();
    for (const s of this.spinEffects) s.gfx.destroy();
    this.laserBeams = [];
    this.auraEffects = [];
    this.orbitOrbs = [];
    this.beamEffects = [];
    this.spinEffects = [];
  }
}
