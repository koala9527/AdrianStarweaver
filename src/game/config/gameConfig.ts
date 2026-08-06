/**
 * Public game configuration.
 *
 * AI credentials and provider settings are server-only environment variables
 * consumed by the Vercel function at /api/ai.
 */
export const GAME_CONFIG = {
  ai: {
    enabled: true,
    endpoint: '/api/ai',
    timeout: 10000,
  },
};
