import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler from './ai.js';

function createResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      this.headers[name] = value;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function createRequest(body) {
  return { method: 'POST', headers: {}, body };
}

const upgradePayload = {
  operation: 'upgrade_advice',
  payload: {
    cards: [{
      name: '生命强化',
      description: '提高最大生命值',
      rarity: 'common',
      category: 'survival',
    }],
    playerState: {
      hp: 10,
      maxHp: 20,
      level: 2,
      moveSpeed: 180,
      power: 1,
      critChance: 0.1,
      critDamage: 1.5,
      cooldownRate: 1,
      pickupRadius: 80,
      shield: 0,
      hpRegen: 0,
      spellSlots: [],
    },
    elapsed: 60,
  },
};

describe('Vercel AI proxy', () => {
  beforeEach(() => {
    process.env.SILICONFLOW_API_KEY = 'server-only-test-key';
    process.env.SILICONFLOW_BASE_URL = 'https://provider.example/';
    process.env.SILICONFLOW_MODEL = 'test-model';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.SILICONFLOW_API_KEY;
    delete process.env.SILICONFLOW_BASE_URL;
    delete process.env.SILICONFLOW_MODEL;
  });

  it('returns 503 when server environment is incomplete', async () => {
    delete process.env.SILICONFLOW_BASE_URL;
    const response = createResponse();

    await handler(createRequest(upgradePayload), response);

    expect(response.statusCode).toBe(503);
    expect(JSON.stringify(response.body)).not.toContain('server-only-test-key');
  });

  it('rejects unsupported and oversized client requests', async () => {
    const unsupported = createResponse();
    await handler(createRequest({ operation: 'raw_completion' }), unsupported);
    expect(unsupported.statusCode).toBe(400);

    const oversized = createResponse();
    await handler(createRequest({ operation: 'enemy_lines', padding: 'x'.repeat(17_000) }), oversized);
    expect(oversized.statusCode).toBe(413);
  });

  it('forwards allowlisted requests without exposing credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"pick":1,"reason":"优先提高生存能力"}' } }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const response = createResponse();

    await handler(createRequest(upgradePayload), response);

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ content: '{"pick":1,"reason":"优先提高生存能力"}' });
    expect(JSON.stringify(response.body)).not.toContain('server-only-test-key');

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://provider.example/v1/chat/completions');
    expect(options.headers.Authorization).toBe('Bearer server-only-test-key');
    expect(JSON.parse(options.body).model).toBe('test-model');
    expect(options.body).not.toContain('server-only-test-key');
  });

  it('does not expose upstream errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    const response = createResponse();

    await handler(createRequest({ operation: 'enemy_lines' }), response);

    expect(response.statusCode).toBe(502);
    expect(response.body).toEqual({ error: 'AI provider request failed' });
  });
});