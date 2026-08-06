const MAX_BODY_BYTES = 16_384;
const DEFAULT_MODEL = 'deepseek-ai/DeepSeek-V3.2';
const ALLOWED_OPERATIONS = new Set(['upgrade_advice', 'enemy_lines', 'player_lines']);

function sendJson(response, status, body) {
  response.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  return response.json(body);
}

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, '');
}

function buildUpgradePrompt(payload) {
  const cards = Array.isArray(payload.cards) ? payload.cards.slice(0, 3) : [];
  const state = payload.playerState;
  const elapsed = Number(payload.elapsed);

  if (cards.length === 0 || !state || !Number.isFinite(elapsed)) {
    throw new Error('Invalid upgrade advice payload');
  }

  const cardDescriptions = cards.map((card, index) => {
    const name = String(card.name || '').slice(0, 40);
    const description = String(card.description || '').slice(0, 120);
    const rarity = String(card.rarity || '').slice(0, 20);
    const category = String(card.category || '').slice(0, 30);
    return `${index + 1}. [${rarity}] ${name} - ${description} (类型: ${category})`;
  }).join('\n');

  const spellIds = Array.isArray(state.spellSlots)
    ? state.spellSlots.slice(0, 10).map((slot) => String(slot.spellId || '').slice(0, 40)).join(', ')
    : '';
  const stateText = [
    `HP: ${Math.ceil(Number(state.hp))}/${Number(state.maxHp)}`,
    `等级: ${Number(state.level)}`,
    `移速: ${Number(state.moveSpeed)}`,
    `力量: ${Number(state.power).toFixed(2)}`,
    `暴击率: ${(Number(state.critChance) * 100).toFixed(0)}%`,
    `暴击伤害: ${(Number(state.critDamage) * 100).toFixed(0)}%`,
    `冷却率: ${Number(state.cooldownRate).toFixed(2)}`,
    `拾取范围: ${Number(state.pickupRadius)}`,
    `护盾: ${Number(state.shield)}`,
    `生命恢复: ${Number(state.hpRegen).toFixed(1)}/s`,
    `法术栏: ${spellIds}`,
    `游戏时间: ${Math.floor(elapsed / 60)}分${Math.floor(elapsed % 60)}秒`,
  ].join(', ');

  return {
    prompt: `你是"魔导师"，艾德里安·星织中的传奇导师。请用简练、有个性的方式给玩家提供升级建议。\n\n玩家需要在5分钟内存活。请根据当前状态推荐最佳升级卡牌。\n\n当前状态: ${stateText}\n\n可选卡牌:\n${cardDescriptions}\n\n请只回复JSON: {"pick": 数字(1-${cards.length}), "reason": "30字以内的简短建议"}`,
    maxTokens: 200,
    temperature: 0.5,
  };
}

function buildEnemyLinesPrompt() {
  return {
    prompt: `你是艾德里安·星织的怪物台词生成器。请为两种怪物生成各种情况下的台词，每种情况4句，要求简短(10字以内)、有趣、符合角色性格。\n\n史莱姆(slime): 可爱、黏糊糊、天真无邪\n骷髅(skeleton): 阴森、有点中二的亡灵战士\n情况: spawn, chase, hurt, death, idle, taunt\n\n请只回复JSON: {"slime":{"spawn":["","","",""],"chase":["","","",""],"hurt":["","","",""],"death":["","","",""],"idle":["","","",""],"taunt":["","","",""]},"skeleton":{"spawn":["","","",""],"chase":["","","",""],"hurt":["","","",""],"death":["","","",""],"idle":["","","",""],"taunt":["","","",""]}}`,
    maxTokens: 800,
    temperature: 0.9,
  };
}

function buildPlayerLinesPrompt() {
  return {
    prompt: `你是艾德里安·星织的主角，一位年轻法师。请为以下情况各生成4句简短台词(10字以内)，每句以一个表情emoji开头，语气活泼、自信、有冒险精神。\n\n情况: start, levelup, lowHp, killStreak, hurt, idle, newSpell, victory, danger\n\n请只回复JSON: {"start":["","","",""],"levelup":["","","",""],"lowHp":["","","",""],"killStreak":["","","",""],"hurt":["","","",""],"idle":["","","",""],"newSpell":["","","",""],"victory":["","","",""],"danger":["","","",""]}`,
    maxTokens: 600,
    temperature: 0.9,
  };
}

function buildRequest(operation, payload) {
  if (operation === 'upgrade_advice') return buildUpgradePrompt(payload || {});
  if (operation === 'enemy_lines') return buildEnemyLinesPrompt();
  if (operation === 'player_lines') return buildPlayerLinesPrompt();
  throw new Error('Unsupported operation');
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return sendJson(response, 405, { error: 'Method not allowed' });
  }

  const contentLength = Number(request.headers['content-length'] || 0);
  if (contentLength > MAX_BODY_BYTES) {
    return sendJson(response, 413, { error: 'Request body too large' });
  }

  const apiKey = process.env.SILICONFLOW_API_KEY;
  const baseUrl = process.env.SILICONFLOW_BASE_URL;
  if (!apiKey || !baseUrl) {
    return sendJson(response, 503, { error: 'AI service is not configured' });
  }

  let body;
  try {
    body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body;
  } catch {
    return sendJson(response, 400, { error: 'Invalid JSON body' });
  }
  if (!body || !ALLOWED_OPERATIONS.has(body.operation)) {
    return sendJson(response, 400, { error: 'Unsupported operation' });
  }
  if (Buffer.byteLength(JSON.stringify(body), 'utf8') > MAX_BODY_BYTES) {
    return sendJson(response, 413, { error: 'Request body too large' });
  }

  let aiRequest;
  try {
    aiRequest = buildRequest(body.operation, body.payload);
  } catch {
    return sendJson(response, 400, { error: 'Invalid request payload' });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const upstream = await fetch(`${normalizeBaseUrl(baseUrl)}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.SILICONFLOW_MODEL || DEFAULT_MODEL,
        messages: [{ role: 'user', content: aiRequest.prompt }],
        max_tokens: aiRequest.maxTokens,
        temperature: aiRequest.temperature,
      }),
      signal: controller.signal,
    });

    if (!upstream.ok) {
      return sendJson(response, 502, { error: 'AI provider request failed' });
    }

    const data = await upstream.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.length > 20_000) {
      return sendJson(response, 502, { error: 'Invalid AI provider response' });
    }

    return sendJson(response, 200, { content });
  } catch (error) {
    const message = error instanceof Error && error.name === 'AbortError'
      ? 'AI provider request timed out'
      : 'AI provider request failed';
    return sendJson(response, 502, { error: message });
  } finally {
    clearTimeout(timeout);
  }
}
