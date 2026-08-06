export class CollisionSystem {
  readonly playerGroup: Phaser.Physics.Arcade.Group;
  readonly enemyGroup: Phaser.Physics.Arcade.Group;
  readonly playerProjectileGroup: Phaser.Physics.Arcade.Group;
  readonly enemyProjectileGroup: Phaser.Physics.Arcade.Group;
  readonly pickupGroup: Phaser.Physics.Arcade.Group;
  readonly areaEffectGroup: Phaser.Physics.Arcade.Group;

  constructor(scene: Phaser.Scene) {
    this.playerGroup = scene.physics.add.group({ runChildUpdate: false });
    this.enemyGroup = scene.physics.add.group({ runChildUpdate: false });
    this.playerProjectileGroup = scene.physics.add.group({ runChildUpdate: false });
    this.enemyProjectileGroup = scene.physics.add.group({ runChildUpdate: false });
    this.pickupGroup = scene.physics.add.group({ runChildUpdate: false });
    this.areaEffectGroup = scene.physics.add.group({ runChildUpdate: false });

    // Enemy-enemy collide for separation
    scene.physics.add.collider(this.enemyGroup, this.enemyGroup);
  }

  setupOverlaps(
    scene: Phaser.Scene,
    onProjectileHitEnemy: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
    onEnemyHitPlayer: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
    onPickupCollected: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
  ): void {
    scene.physics.add.overlap(this.playerProjectileGroup, this.enemyGroup, onProjectileHitEnemy);
    scene.physics.add.overlap(this.playerGroup, this.enemyGroup, onEnemyHitPlayer);
    scene.physics.add.overlap(this.playerGroup, this.pickupGroup, onPickupCollected);
  }

  destroy(): void {
    this.playerGroup.destroy(true);
    this.enemyGroup.destroy(true);
    this.playerProjectileGroup.destroy(true);
    this.enemyProjectileGroup.destroy(true);
    this.pickupGroup.destroy(true);
    this.areaEffectGroup.destroy(true);
  }
}
