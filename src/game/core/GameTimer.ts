import { EventBus } from './EventBus';
import { GameEvents, RunPhase, PhaseChangePayload, RunEndPayload } from '../types';

interface PhaseConfig {
  phase: RunPhase;
  startTime: number;
  endTime: number;
}

const PHASE_CONFIGS: PhaseConfig[] = [
  { phase: RunPhase.EARLY, startTime: 0, endTime: 60 },
  { phase: RunPhase.MID_EARLY, startTime: 60, endTime: 120 },
  { phase: RunPhase.MID, startTime: 120, endTime: 180 },
  { phase: RunPhase.MID_LATE, startTime: 180, endTime: 240 },
  { phase: RunPhase.LATE, startTime: 240, endTime: 300 },
];

const HARD_CAP_SECONDS = 300;
const MAX_DELTA = 0.1; // 100ms cap

export class GameTimer {
  private scene: Phaser.Scene;
  private eventBus: EventBus;
  private elapsedTime = 0;
  private _isPaused = false;
  private currentPhase: RunPhase = RunPhase.EARLY;
  private ended = false;

  constructor(scene: Phaser.Scene, eventBus: EventBus) {
    this.scene = scene;
    this.eventBus = eventBus;
  }

  start(): void {
    this.elapsedTime = 0;
    this._isPaused = false;
    this.currentPhase = RunPhase.EARLY;
    this.ended = false;
    this.eventBus.emit(GameEvents.RUN_START, { timestamp: Date.now() });
  }

  update(delta: number): void {
    if (this._isPaused || this.ended) return;

    const dt = Math.min(delta / 1000, MAX_DELTA);
    this.elapsedTime += dt;

    // Check phase transition
    const newPhase = this.calculatePhase();
    if (newPhase !== this.currentPhase) {
      const prev = this.currentPhase;
      this.currentPhase = newPhase;
      this.eventBus.emit(GameEvents.PHASE_CHANGE, {
        phase: newPhase,
        previousPhase: prev,
      } satisfies PhaseChangePayload);
    }

    // Hard cap
    if (this.elapsedTime >= HARD_CAP_SECONDS) {
      this.endRun(true, 'timeout');
    }
  }

  private calculatePhase(): RunPhase {
    for (let i = PHASE_CONFIGS.length - 1; i >= 0; i--) {
      if (this.elapsedTime >= PHASE_CONFIGS[i].startTime) {
        return PHASE_CONFIGS[i].phase;
      }
    }
    return RunPhase.EARLY;
  }

  endRun(survived: boolean, cause: 'death' | 'boss_killed' | 'timeout' | 'victory'): void {
    if (this.ended) return;
    this.ended = true;
    this.eventBus.emit(GameEvents.RUN_END, {
      survived,
      time: this.elapsedTime,
      cause,
    } satisfies RunEndPayload);
  }

  pause(): void {
    if (this._isPaused) return;
    this._isPaused = true;
    this.scene.time.paused = true;
    this.scene.physics.pause();
  }

  resume(): void {
    if (!this._isPaused) return;
    this._isPaused = false;
    this.scene.time.paused = false;
    this.scene.physics.resume();
  }

  getElapsed(): number {
    return this.elapsedTime;
  }

  getPhase(): RunPhase {
    return this.currentPhase;
  }

  isPaused(): boolean {
    return this._isPaused;
  }

  isEnded(): boolean {
    return this.ended;
  }
}
