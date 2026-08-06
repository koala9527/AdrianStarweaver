import { GAME_CONFIG } from '../config/gameConfig';

export type BubbleSituation = 'spawn' | 'chase' | 'hurt' | 'death' | 'idle' | 'taunt';

interface BubbleCache {
  slime: Record<BubbleSituation, string[]>;
  skeleton: Record<BubbleSituation, string[]>;
}

const FALLBACK_LINES: Record<string, Record<BubbleSituation, string[]>> = {
  slime: {
    spawn: ['咕噜~', '黏黏的来啦!', '嘿嘿~', '又是新的一天~'],
    chase: ['等等我~', '别跑!', '我要抱抱!', '黏住你!'],
    hurt: ['好痛!', '呜呜...', '我的果冻!', '不要打我!'],
    death: ['我化了...', '咕噜噜...', '下次再来~', '变成水了...'],
    idle: ['弹弹弹~', '好无聊~', '哪里有吃的?', '...zzZ'],
    taunt: ['你打不到我~', '来呀来呀~', '太慢了!', '嘻嘻~'],
  },
  skeleton: {
    spawn: ['嘎吱嘎吱...', '骨头响了', '又活了...', '谁叫醒我的?'],
    chase: ['交出灵魂!', '站住!', '骨剑出鞘!', '无处可逃!'],
    hurt: ['只是骨头!', '嘎吱!', '这点伤...', '我没有痛觉!'],
    death: ['散架了...', '骨头...碎了', '下次拼好再来', '嘎...'],
    idle: ['...咔咔', '好冷...', '我的骨头呢?', '...'],
    taunt: ['怕了吗?', '颤抖吧!', '你也会变骨头', '哼哼哼...'],
  },
};

export class BubbleTextGenerator {
  private cache: BubbleCache;
  private generating = false;
  private generated = false;

  constructor() {
    this.cache = {
      slime: { ...FALLBACK_LINES.slime },
      skeleton: { ...FALLBACK_LINES.skeleton },
    };
  }

  async preGenerate(): Promise<void> {
    const cfg = GAME_CONFIG.ai;
    if (!cfg.enabled || this.generating || this.generated) return;

    this.generating = true;

    try {
      const resp = await fetch(cfg.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation: 'enemy_lines' }),
      });

      if (!resp.ok) return;

      const data = await resp.json();
      const content: string = data.content ?? '';
      const match = content.match(/\{[\s\S]*\}/);
      if (!match) return;

      const parsed = JSON.parse(match[0]);

      // Merge AI lines with fallbacks
      for (const enemy of ['slime', 'skeleton'] as const) {
        if (parsed[enemy]) {
          for (const sit of ['spawn', 'chase', 'hurt', 'death', 'idle', 'taunt'] as BubbleSituation[]) {
            if (Array.isArray(parsed[enemy][sit]) && parsed[enemy][sit].length > 0) {
              this.cache[enemy][sit] = [
                ...this.cache[enemy][sit],
                ...parsed[enemy][sit].filter((s: unknown) => typeof s === 'string' && s.length > 0),
              ];
            }
          }
        }
      }

      this.generated = true;
    } catch {
      // Fallback lines are already loaded
    } finally {
      this.generating = false;
    }
  }

  getLine(enemyType: string, situation: BubbleSituation): string {
    const type = enemyType as keyof BubbleCache;
    const lines = this.cache[type]?.[situation] ?? FALLBACK_LINES.slime[situation];
    return lines[Math.floor(Math.random() * lines.length)];
  }
}
