import { GAME_CONFIG } from '../config/gameConfig';
import { UpgradeCard, PlayerState } from '../types';

export interface AiAdvice {
  recommendedIndex: number;
  reason: string;
}

export class AiAdvisor {
  private abortController: AbortController | null = null;

  async getAdvice(
    cards: UpgradeCard[],
    playerState: PlayerState,
    elapsed: number,
  ): Promise<AiAdvice | null> {
    const cfg = GAME_CONFIG.ai;
    if (!cfg.enabled) return null;

    this.abort();
    this.abortController = new AbortController();

    try {
      const resp = await fetch(cfg.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'upgrade_advice',
          payload: { cards, playerState, elapsed },
        }),
        signal: this.abortController.signal,
      });

      if (!resp.ok) return null;

      const data = await resp.json();
      const content: string = data.content ?? '';

      const match = content.match(/\{[\s\S]*\}/);
      if (!match) return null;

      const parsed = JSON.parse(match[0]);
      const pick = Number(parsed.pick);
      if (pick < 1 || pick > cards.length) return null;

      return {
        recommendedIndex: pick - 1,
        reason: String(parsed.reason || '老夫建议选这个'),
      };
    } catch {
      return null;
    }
  }

  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }
}
