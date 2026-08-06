import { EventBus } from '../core/EventBus';
import { GameTimer } from '../core/GameTimer';
import { GameEvents, EnemyKillPayload, XpGainedPayload } from '../types';

export interface Quest {
  id: string;
  name: string;
  description: string;
  triggerTime: number; // seconds into the run
  duration: number; // seconds to complete (0 = no time limit)
  type: 'kill' | 'kill_type' | 'survive' | 'level' | 'collect' | 'streak';
  target: number;
  targetType?: string; // for kill_type
  reward: { type: 'xp' | 'stat'; field?: string; value: number };
  icon: string;
}

export const QUEST_LIST: Quest[] = [
  {
    id: 'mission1', name: '森林河岸觉醒', description: '击杀10只史莱姆',
    triggerTime: 0, duration: 50, type: 'kill_type', target: 10, targetType: 'slime',
    reward: { type: 'xp', value: 30 }, icon: '🟢',
  },
  {
    id: 'mission2', name: '石桥清理', description: '击杀8只骷髅',
    triggerTime: 85, duration: 45, type: 'kill_type', target: 8, targetType: 'skeleton',
    reward: { type: 'xp', value: 35 }, icon: '💀',
  },
  {
    id: 'mission3', name: '河流防御', description: '击杀5只水鬼',
    triggerTime: 165, duration: 50, type: 'kill_type', target: 5, targetType: 'wraith',
    reward: { type: 'xp', value: 40 }, icon: '👻',
  },
  {
    id: 'mission4', name: '星纹石桥之路', description: '击杀12只史莱姆和6只骷髅',
    triggerTime: 255, duration: 60, type: 'kill', target: 18,
    reward: { type: 'xp', value: 50 }, icon: '⚔',
  },
  {
    id: 'mission5', name: '最终决战', description: '击杀邪恶魔法核心',
    triggerTime: 370, duration: 70, type: 'kill_type', target: 1, targetType: 'boss',
    reward: { type: 'xp', value: 100 }, icon: '🔥',
  },
];

export type QuestState = 'waiting' | 'active' | 'completed' | 'failed';

interface ActiveQuest {
  quest: Quest;
  state: QuestState;
  progress: number;
  timeRemaining: number;
}

export class QuestSystem {
  private eventBus: EventBus;
  private gameTimer: GameTimer;
  private quests: ActiveQuest[];
  private currentIndex = 0;
  private totalKills = 0;
  private totalKillsByType: Record<string, number> = {};
  private playerLevel = 1;
  private missionCompletionTimes: number[] = []; // Track completion times for hidden ending

  // Callbacks for UI
  onQuestStart: ((quest: Quest) => void) | null = null;
  onQuestProgress: ((quest: Quest, progress: number, target: number) => void) | null = null;
  onQuestComplete: ((quest: Quest) => void) | null = null;
  onQuestFailed: ((quest: Quest) => void) | null = null;
  onMissionComplete: ((missionId: string) => void) | null = null; // New callback for story narration

  constructor(eventBus: EventBus, gameTimer: GameTimer) {
    this.eventBus = eventBus;
    this.gameTimer = gameTimer;

    this.quests = QUEST_LIST.map(q => ({
      quest: q,
      state: 'waiting' as QuestState,
      progress: 0,
      timeRemaining: q.duration,
    }));

    eventBus.on(GameEvents.ENEMY_KILL, this.onEnemyKill, this);
    eventBus.on(GameEvents.LEVEL_UP, this.onLevelUp, this);
  }

  private onEnemyKill(payload: EnemyKillPayload): void {
    this.totalKills++;
    const type = payload.enemyType;
    this.totalKillsByType[type] = (this.totalKillsByType[type] ?? 0) + 1;

    this.checkActiveProgress();
  }

  private onLevelUp(payload: { newLevel: number }): void {
    this.playerLevel = payload.newLevel;
    this.checkActiveProgress();
  }

  private checkActiveProgress(): void {
    const aq = this.getActiveQuest();
    if (!aq || aq.state !== 'active') return;

    const q = aq.quest;
    let progress = 0;

    switch (q.type) {
      case 'kill':
        progress = this.totalKills;
        break;
      case 'kill_type':
        progress = this.totalKillsByType[q.targetType ?? ''] ?? 0;
        break;
      case 'level':
        progress = this.playerLevel;
        break;
    }

    // For kill quests that start mid-run, track relative progress
    if (q.type === 'kill' || q.type === 'kill_type') {
      const startProgress = aq.progress === 0 ? progress : 0;
      if (aq.progress === 0 && progress > 0) {
        // Store baseline on first check
        (aq as unknown as { baseline: number }).baseline = progress - 1;
      }
      const baseline = (aq as unknown as { baseline?: number }).baseline ?? 0;
      progress = progress - baseline;
    }

    aq.progress = progress;

    if (this.onQuestProgress) {
      this.onQuestProgress(q, Math.min(progress, q.target), q.target);
    }

    if (progress >= q.target) {
      this.completeQuest(aq);
    }
  }

  private completeQuest(aq: ActiveQuest): void {
    aq.state = 'completed';

    // Track completion time for hidden ending check
    const completionTime = this.gameTimer.getElapsed();
    this.missionCompletionTimes.push(completionTime);

    // Grant reward
    if (aq.quest.reward.type === 'xp') {
      this.eventBus.emit(GameEvents.XP_GAINED, { amount: aq.quest.reward.value });
    }

    // Random bonus reward
    const bonusRoll = Math.random();
    let buffName: string;
    let buffField: string;
    let buffValue: number;
    if (bonusRoll < 0.25) {
      buffName = '⚡ 疾风之力';
      buffField = 'moveSpeed';
      buffValue = 50;
    } else if (bonusRoll < 0.5) {
      buffName = '🔥 魔力涌动';
      buffField = 'power';
      buffValue = 0.3;
    } else if (bonusRoll < 0.75) {
      buffName = '🛡 临时护盾';
      buffField = 'shield';
      buffValue = 30;
    } else {
      buffName = '💚 生命恢复';
      buffField = 'hp';
      buffValue = 25;
    }
    this.eventBus.emit(GameEvents.BUFF_GAINED, {
      name: buffName,
      field: buffField,
      value: buffValue,
    });

    if (this.onQuestComplete) {
      this.onQuestComplete(aq.quest);
    }

    // Trigger story narration callback
    if (this.onMissionComplete) {
      this.onMissionComplete(aq.quest.id);
    }

    // Move to next quest
    this.currentIndex++;
  }

  update(delta: number): void {
    if (this.gameTimer.isPaused()) return;

    const elapsed = this.gameTimer.getElapsed();

    // Check if next quest should trigger
    if (this.currentIndex < this.quests.length) {
      const aq = this.quests[this.currentIndex];
      if (aq.state === 'waiting' && elapsed >= aq.quest.triggerTime) {
        aq.state = 'active';
        aq.progress = 0;
        aq.timeRemaining = aq.quest.duration;

        // Reset kill baseline for relative tracking
        if (aq.quest.type === 'kill') {
          (aq as unknown as { baseline: number }).baseline = this.totalKills;
        } else if (aq.quest.type === 'kill_type') {
          (aq as unknown as { baseline: number }).baseline = this.totalKillsByType[aq.quest.targetType ?? ''] ?? 0;
        }

        if (this.onQuestStart) {
          this.onQuestStart(aq.quest);
        }

        // Immediately check if already completed (e.g., level quests)
        this.checkActiveProgress();
      }

      // Tick active quest timer
      if (aq.state === 'active' && aq.quest.duration > 0) {
        aq.timeRemaining -= delta / 1000;
        if (aq.timeRemaining <= 0) {
          aq.state = 'failed';
          if (this.onQuestFailed) {
            this.onQuestFailed(aq.quest);
          }
          this.currentIndex++;
        }
      }
    }
  }

  getActiveQuest(): ActiveQuest | null {
    if (this.currentIndex >= this.quests.length) return null;
    const aq = this.quests[this.currentIndex];
    return aq.state === 'active' ? aq : null;
  }

  getCurrentQuest(): ActiveQuest | null {
    if (this.currentIndex >= this.quests.length) return null;
    return this.quests[this.currentIndex];
  }

  destroy(): void {
    this.eventBus.off(GameEvents.ENEMY_KILL, this.onEnemyKill, this);
    this.eventBus.off(GameEvents.LEVEL_UP, this.onLevelUp, this);
  }

  /**
   * Check if all missions completed within time limits (for hidden ending)
   */
  allMissionsCompletedOnTime(): boolean {
    return this.missionCompletionTimes.length === QUEST_LIST.length &&
           this.quests.every(aq => aq.state === 'completed');
  }

  /**
   * Get current mission index (1-based for display)
   */
  getCurrentMissionNumber(): number {
    return this.currentIndex + 1;
  }
}
