import { EventBus } from '../core/EventBus';
import { Player } from '../entities/Player';
import { Enemy } from '../entities/Enemy';
import { EnemySystem } from './EnemySystem';
import {
  GameEvents,
  EnemyKillPayload,
  EnemyDamagedPayload,
  PlayerDamagedPayload,
  SpellHitPayload,
  ElementType,
} from '../types';

export class CombatSystem {
  private eventBus: EventBus;
  private player: Player;
  private enemySystem: EnemySystem;

  constructor(eventBus: EventBus, player: Player, enemySystem: EnemySystem) {
    this.eventBus = eventBus;
    this.player = player;
    this.enemySystem = enemySystem;
  }

  handleProjectileHitEnemy(
    projectile: Phaser.GameObjects.GameObject,
    enemyObj: Phaser.GameObjects.GameObject,
  ): void {
    const enemy = enemyObj as Enemy;
    if (!enemy.active) return;

    const proj = projectile as Phaser.Physics.Arcade.Sprite & {
      spellId?: string;
      baseDamage?: number;
      element?: ElementType | null;
      pierceCount?: number;
      maxPierce?: number;
      hitSet?: Set<Enemy>;
    };

    // Pierce check
    if (proj.hitSet?.has(enemy)) return;
    proj.hitSet?.add(enemy);

    const damage = this.calculateDamage(proj.baseDamage ?? 10);

    const isCrit = Math.random() < this.player.playerState.critChance;
    const finalDamage = Math.max(1, Math.floor(damage * (isCrit ? this.player.playerState.critDamage : 1)));

    const remainingHp = enemy.takeDamage(finalDamage);

    // Knockback
    const kbForce = isCrit ? 200 : 100;
    const dx = enemy.x - this.player.x;
    const dy = enemy.y - this.player.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 0) {
      const body = enemy.body as Phaser.Physics.Arcade.Body;
      body.setVelocity(
        (dx / dist) * kbForce + body.velocity.x * 0.5,
        (dy / dist) * kbForce + body.velocity.y * 0.5,
      );
    }

    this.eventBus.emit(GameEvents.SPELL_HIT, {
      spellId: proj.spellId ?? '',
      element: proj.element ?? null,
      target: enemy,
      damage: finalDamage,
      isCrit,
      position: { x: enemy.x, y: enemy.y },
    } satisfies SpellHitPayload);

    if (isCrit) {
      this.eventBus.emit(GameEvents.CRIT, {
        spellId: proj.spellId ?? '',
        target: enemy,
        damage: finalDamage,
      });
    }

    this.eventBus.emit(GameEvents.ENEMY_DAMAGED, {
      enemyId: enemy.config.id,
      damage: finalDamage,
      element: proj.element ?? null,
      remainingHp,
      enemy,
    } satisfies EnemyDamagedPayload);

    if (enemy.isDead()) {
      this.eventBus.emit(GameEvents.ENEMY_KILL, {
        enemyId: enemy.config.id,
        enemyType: enemy.config.id,
        position: { x: enemy.x, y: enemy.y },
        killerSpellId: proj.spellId ?? '',
        element: proj.element ?? null,
        enemy,
      } satisfies EnemyKillPayload);
      this.enemySystem.killEnemy(enemy);
    }

    // Handle pierce
    if (proj.maxPierce !== undefined && proj.pierceCount !== undefined) {
      proj.pierceCount++;
      if (proj.pierceCount > proj.maxPierce) {
        proj.setActive(false);
        proj.setVisible(false);
        (proj.body as Phaser.Physics.Arcade.Body).enable = false;
      }
    } else {
      // No pierce — destroy projectile
      proj.setActive(false);
      proj.setVisible(false);
      (proj.body as Phaser.Physics.Arcade.Body).enable = false;
    }
  }

  handleEnemyHitPlayer(
    playerObj: Phaser.GameObjects.GameObject,
    enemyObj: Phaser.GameObjects.GameObject,
  ): void {
    const enemy = enemyObj as Enemy;
    if (!enemy.active || !enemy.canDealContactDamage()) return;
    if (this.player.isInvulnerable()) return;

    const damage = enemy.config.contactDamage;
    this.player.takeDamage(damage);
    enemy.resetContactCooldown();

    this.eventBus.emit(GameEvents.PLAYER_DAMAGED, {
      damage,
      source: enemy.config.id,
      remainingHp: this.player.playerState.hp,
    } satisfies PlayerDamagedPayload);
  }

  private calculateDamage(baseDamage: number): number {
    const power = this.player.playerState.power;
    const variance = 0.9 + Math.random() * 0.2; // 0.9–1.1
    return baseDamage * power * variance;
  }

  destroy(): void {
    // Stateless — nothing to clean up
  }
}
