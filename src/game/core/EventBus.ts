import { GameEvents } from '../types';

interface Subscriber {
  callback: Function;
  context: object | undefined;
  priority: number;
}

export class EventBus {
  private listeners: Map<GameEvents, Subscriber[]> = new Map();
  private emitDepth = 0;
  private destroyed = false;

  private static readonly MAX_REENTRANT_DEPTH = 8;

  on(event: GameEvents, callback: Function, context?: object, priority = 0): void {
    if (this.destroyed) return;
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    const subs = this.listeners.get(event)!;
    subs.push({ callback, context, priority });
    subs.sort((a, b) => b.priority - a.priority);
  }

  off(event: GameEvents, callback: Function, context?: object): void {
    const subs = this.listeners.get(event);
    if (!subs) return;
    const idx = subs.findIndex(s => s.callback === callback && s.context === context);
    if (idx !== -1) subs.splice(idx, 1);
  }

  offAll(context: object): void {
    for (const [event, subs] of this.listeners) {
      this.listeners.set(event, subs.filter(s => s.context !== context));
    }
  }

  emit(event: GameEvents, payload: object = {}): void {
    if (this.destroyed) return;
    if (this.emitDepth >= EventBus.MAX_REENTRANT_DEPTH) {
      console.warn(`[EventBus] Max re-entrant depth (${EventBus.MAX_REENTRANT_DEPTH}) reached for ${event}. Dropping.`);
      return;
    }

    const subs = this.listeners.get(event);
    if (!subs || subs.length === 0) return;

    // Snapshot iteration — safe against unsubscribe during dispatch
    const snapshot = [...subs];
    this.emitDepth++;
    try {
      for (const sub of snapshot) {
        sub.callback.call(sub.context, payload);
      }
    } finally {
      this.emitDepth--;
    }
  }

  destroy(): void {
    this.listeners.clear();
    this.destroyed = true;
  }
}
