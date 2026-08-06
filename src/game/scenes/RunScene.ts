import { EventBus } from '../core/EventBus';
import { InputSystem } from '../core/InputSystem';
import { ObjectPool } from '../core/ObjectPool';
import { GameTimer } from '../core/GameTimer';
import { CollisionSystem } from '../core/CollisionSystem';
import { Player } from '../entities/Player';
import { Enemy } from '../entities/Enemy';
import { Projectile } from '../entities/Projectile';
import { Pickup } from '../entities/Pickup';
import { PlayerController } from '../systems/PlayerController';
import { EnemySystem } from '../systems/EnemySystem';
import { SpawnDirector } from '../systems/SpawnDirector';
import { CombatSystem } from '../systems/CombatSystem';
import { SpellSystem } from '../systems/SpellSystem';
import { LootSystem } from '../systems/LootSystem';
import { BuildSystem } from '../systems/BuildSystem';
import { UpgradePoolSystem } from '../systems/UpgradePoolSystem';
import { LevelUpSystem } from '../systems/LevelUpSystem';
import { Hud } from '../ui/Hud';
import { LevelUpPanel } from '../ui/LevelUpPanel';
import { QuestBanner } from '../ui/QuestBanner';
import { NarrationPanel } from '../ui/NarrationPanel';
import { DanmakuSystem } from '../ui/DanmakuSystem';
import { BubbleSystem } from '../systems/BubbleSystem';
import { BubbleTextGenerator } from '../services/BubbleTextGenerator';
import { VfxSystem } from '../systems/VfxSystem';
import { QuestSystem } from '../systems/QuestSystem';
import { MapCollision } from '../core/MapCollision';
import { GameEvents, RunEndPayload, RunResultData } from '../types';
import { MISSION_STORIES, ENDINGS, OPENING_NARRATION } from '../data/story';

const MAP_WIDTH = 4096;
const MAP_HEIGHT = 4096;
const TILE_SIZE = 1024;

export class RunScene extends Phaser.Scene {
  // Core
  private eventBus!: EventBus;
  private inputSystem!: InputSystem;
  private gameTimer!: GameTimer;
  private collisionSystem!: CollisionSystem;

  // Pools
  private enemyPool!: ObjectPool<Enemy>;
  private projectilePool!: ObjectPool<Projectile>;
  private pickupPool!: ObjectPool<Pickup>;

  // Entities
  private player!: Player;

  // Systems
  private playerController!: PlayerController;
  private enemySystem!: EnemySystem;
  private spawnDirector!: SpawnDirector;
  private combatSystem!: CombatSystem;
  private spellSystem!: SpellSystem;
  private lootSystem!: LootSystem;
  private buildSystem!: BuildSystem;
  private upgradePoolSystem!: UpgradePoolSystem;
  private levelUpSystem!: LevelUpSystem;
  private bubbleSystem!: BubbleSystem;
  private bubbleGenerator!: BubbleTextGenerator;
  private vfxSystem!: VfxSystem;
  private mapCollision!: MapCollision;
  private questSystem!: QuestSystem;
  private questBanner!: QuestBanner;

  // Audio
  private bgm!: Phaser.Sound.BaseSound;

  // UI
  private hud!: Hud;
  private levelUpPanel!: LevelUpPanel;
  private narrationPanel!: NarrationPanel;
  private danmakuSystem!: DanmakuSystem;

  constructor() {
    super({ key: 'run' });
  }

  create(): void {
    // Map bounds
    this.physics.world.setBounds(0, 0, MAP_WIDTH, MAP_HEIGHT);

    // Draw tiled background
    this.createBackground();

    // Core systems
    this.eventBus = new EventBus();
    this.inputSystem = new InputSystem(this);
    this.gameTimer = new GameTimer(this, this.eventBus);
    this.collisionSystem = new CollisionSystem(this);

    // Object pools
    this.enemyPool = new ObjectPool<Enemy>(
      () => new Enemy(this, this.collisionSystem),
      (e) => e.reset(),
      150,
    );
    this.enemyPool.preAllocate(40);

    this.projectilePool = new ObjectPool<Projectile>(
      () => new Projectile(this, this.collisionSystem),
      (p) => p.reset(),
      300,
    );
    this.projectilePool.preAllocate(50);

    this.pickupPool = new ObjectPool<Pickup>(
      () => new Pickup(this, this.collisionSystem),
      (p) => p.reset(),
      200,
    );
    this.pickupPool.preAllocate(30);

    // Player
    this.player = new Player(this, MAP_WIDTH / 2 - 200, MAP_HEIGHT / 2 - 200 , this.collisionSystem);
    this.playerController = new PlayerController(this.player, this.inputSystem);

    // Player collides with map blockers
    this.physics.add.collider(this.player, this.mapCollision.getBlockers());

    // Enemies collide with map blockers
    this.physics.add.collider(this.collisionSystem.enemyGroup, this.mapCollision.getBlockers());

    // Camera
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.cameras.main.setBounds(0, 0, MAP_WIDTH, MAP_HEIGHT);

    // Gameplay systems
    this.enemySystem = new EnemySystem(this, this.enemyPool, this.collisionSystem, this.player);
    this.spawnDirector = new SpawnDirector(this.enemySystem, this.gameTimer, this.eventBus, this.player);
    this.spawnDirector.setMapCollision(this.mapCollision);
    this.spellSystem = new SpellSystem(this, this.player, this.projectilePool, this.collisionSystem, this.eventBus);
    this.combatSystem = new CombatSystem(this.eventBus, this.player, this.enemySystem);
    this.lootSystem = new LootSystem(this, this.pickupPool, this.collisionSystem, this.player, this.eventBus);
    this.buildSystem = new BuildSystem(this.eventBus, this.player, this.spellSystem);
    this.upgradePoolSystem = new UpgradePoolSystem(this.buildSystem, this.spellSystem, this.spawnDirector);
    this.levelUpSystem = new LevelUpSystem(this.eventBus, this.gameTimer, this.upgradePoolSystem, this.spellSystem, this.player);

    // Bubble system
    this.bubbleGenerator = new BubbleTextGenerator();
    this.bubbleGenerator.preGenerate();
    this.bubbleSystem = new BubbleSystem(this, this.eventBus, this.gameTimer, this.bubbleGenerator, this.player);
    this.bubbleSystem.setMapCollision(this.mapCollision);
    this.enemySystem.onEnemySpawned = (enemy) => this.bubbleSystem.onEnemySpawned(enemy);

    // VFX system
    this.vfxSystem = new VfxSystem(this, this.eventBus);
    this.vfxSystem.setMapCollision(this.mapCollision, this.player);

    // Quest system
    this.questSystem = new QuestSystem(this.eventBus, this.gameTimer);
    this.questBanner = new QuestBanner(this);
    this.questSystem.onQuestStart = (quest) => this.questBanner.showQuest(quest);
    this.questSystem.onQuestProgress = (quest, progress, target) => this.questBanner.updateProgress(progress, target);
    this.questSystem.onQuestComplete = () => this.questBanner.showComplete();
    this.questSystem.onQuestFailed = () => this.questBanner.showFailed();

    // Narration panel for story
    this.narrationPanel = new NarrationPanel(this);
    this.questSystem.onMissionComplete = (missionId) => this.handleMissionComplete(missionId);

    // Equip starting spell
    this.spellSystem.equipSpell('arcane_missile');

    // UI
    this.levelUpPanel = new LevelUpPanel(this);
    const joystick = this.inputSystem.getJoystick();
    if (joystick) {
      this.levelUpPanel.setJoystick(joystick);
    }
    this.hud = new Hud(this, this.player, this.levelUpSystem, this.spellSystem, this.gameTimer, this.eventBus);
    this.danmakuSystem = new DanmakuSystem(this, this.eventBus);

    // Wire level-up flow
    this.levelUpSystem.onShowCards = (cards, level) => {
      this.levelUpPanel.setGameState(this.player.playerState, this.gameTimer.getElapsed());
      this.levelUpPanel.show(cards, level);
    };
    this.levelUpPanel.onCardSelected = (card) => {
      this.levelUpSystem.selectCard(card);
    };

    // Collision overlaps
    this.collisionSystem.setupOverlaps(
      this,
      (proj, enemy) => this.combatSystem.handleProjectileHitEnemy(
        proj as Phaser.GameObjects.GameObject, enemy as Phaser.GameObjects.GameObject),
      (player, enemy) => this.combatSystem.handleEnemyHitPlayer(
        player as Phaser.GameObjects.GameObject, enemy as Phaser.GameObjects.GameObject),
      (player, pickup) => this.lootSystem.handlePickupCollected(
        player as Phaser.GameObjects.GameObject, pickup as Phaser.GameObjects.GameObject),
    );

    // Run end listener
    this.eventBus.on(GameEvents.RUN_END, this.onRunEnd, this);

    // Start the run
    this.gameTimer.start();

    // Audio
    this.bgm = this.sound.add('bgm', { loop: true, volume: 0.4 });
    this.bgm.play();

    // SFX wiring — per-spell sounds
    this.eventBus.on(GameEvents.SPELL_CAST, (payload: { spellId: string }) => {
      const sfxKey = `sfx_${payload.spellId}`;
      if (this.sound.get(sfxKey) || this.cache.audio.has(sfxKey)) {
        this.sound.play(sfxKey, { volume: 1.0 });
      }
    });
    this.eventBus.on(GameEvents.PLAYER_DAMAGED, () => {
      this.sound.play('hit', { volume: 0.9 });
    });

    // Buff gained — apply to player and show in danmaku
    this.eventBus.on(GameEvents.BUFF_GAINED, (payload: { name: string; field: string; value: number }) => {
      const ps = this.player.playerState;
      if (payload.field === 'hp') {
        ps.hp = Math.min(ps.maxHp, ps.hp + payload.value);
      } else if (payload.field === 'shield') {
        ps.shield += payload.value;
      } else if (payload.field === 'moveSpeed') {
        ps.moveSpeed += payload.value;
        // Revert after 10 seconds
        this.time.delayedCall(10000, () => { ps.moveSpeed -= payload.value; });
      } else if (payload.field === 'power') {
        ps.power += payload.value;
        this.time.delayedCall(10000, () => { ps.power -= payload.value; });
      }
      this.danmakuSystem.push(`${payload.name} 获得!`, '#ffcc44');
    });

    // Opening narration
    this.narrationPanel.showNarration(OPENING_NARRATION);
  }

  update(time: number, delta: number): void {
    if (this.gameTimer.isEnded()) return;

    // Game timer
    this.gameTimer.update(delta);

    if (!this.gameTimer.isPaused()) {
      // Gameplay systems
      this.playerController.update(delta);
      this.enemySystem.update(delta);
      this.spawnDirector.update(delta);
      this.spellSystem.update(delta);
      this.lootSystem.update(delta);
      this.bubbleSystem.update(delta);
      this.vfxSystem.update(delta);
      this.questSystem.update(delta);

      // Death check
      if (this.player.isDead()) {
        this.gameTimer.endRun(false, 'death');
        return;
      }
    }

    // UI always updates
    this.hud.update();
    this.levelUpPanel.update();
    this.questBanner.update();
    this.danmakuSystem.update(delta);
    this.narrationPanel.update();

    // Update quest timer display
    const aq = this.questSystem.getActiveQuest();
    if (aq) {
      this.questBanner.updateTimer(aq.timeRemaining);
    }
  }

  private onRunEnd(payload: RunEndPayload): void {
    // Check if all missions completed for ending
    if (payload.survived && this.questSystem.getCurrentMissionNumber() > 5) {
      // Show ending narration
      const isHiddenEnding = this.questSystem.allMissionsCompletedOnTime();
      const ending = isHiddenEnding ? ENDINGS.hidden : ENDINGS.normal;

      this.narrationPanel.showNarration(ending);

      // Transition to result after narration
      this.time.delayedCall(ending.duration + 1000, () => {
        const resultData: RunResultData = {
          survived: payload.survived,
          time: payload.time,
          cause: payload.cause,
          kills: this.spawnDirector.getTotalKills(),
          level: this.player.playerState.level,
        };
        this.scene.start('result', resultData);
      });
    } else {
      // Normal death/failure
      this.time.delayedCall(500, () => {
        const resultData: RunResultData = {
          survived: payload.survived,
          time: payload.time,
          cause: payload.cause,
          kills: this.spawnDirector.getTotalKills(),
          level: this.player.playerState.level,
        };
        this.scene.start('result', resultData);
      });
    }
  }

  private handleMissionComplete(missionId: string): void {
    // Find the corresponding story narration
    const missionStory = MISSION_STORIES.find(m => m.missionId.toString() === missionId.replace('mission', ''));

    if (missionStory && missionStory.narrationAfter.text) {
      // Show narration after mission completion
      this.narrationPanel.showNarration(missionStory.narrationAfter);
    }

    // Check if this was the final mission
    if (missionId === 'mission5') {
      // Trigger run end with victory
      this.gameTimer.endRun(true, 'victory');
    }
  }

  private createBackground(): void {
    // Place 4x4 map tiles
    for (let row = 1; row <= 4; row++) {
      for (let col = 1; col <= 4; col++) {
        const x = (col - 1) * TILE_SIZE;
        const y = (row - 1) * TILE_SIZE;
        this.add.image(x, y, `map_${row}_${col}`).setOrigin(0, 0).setDisplaySize(TILE_SIZE, TILE_SIZE);
      }
    }

    // Build collision from masks
    this.mapCollision = new MapCollision(this);
    this.mapCollision.buildFromMasks();
  }

  shutdown(): void {
    this.bgm.stop();
    this.mapCollision.destroy();
    this.questSystem.destroy();
    this.vfxSystem.destroy();
    this.bubbleSystem.destroy();
    this.danmakuSystem.destroy();
    this.eventBus.off(GameEvents.RUN_END, this.onRunEnd, this);
    this.spawnDirector.destroy();
    this.combatSystem.destroy();
    this.spellSystem.destroy();
    this.lootSystem.destroy();
    this.buildSystem.destroy();
    this.upgradePoolSystem.destroy();
    this.levelUpSystem.destroy();
    this.enemySystem.destroy();
    this.collisionSystem.destroy();
    this.eventBus.destroy();
  }
}
