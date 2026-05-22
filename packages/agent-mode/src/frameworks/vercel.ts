import { AgnostConfig } from '../types';
import { getAgnostContext } from '../core/context';
import { getAgnostConfig, initAgnost } from '../agnost';

export async function instrumentVercelAI(config?: AgnostConfig): Promise<void> {
  if (config) initAgnost(config);
  getAgnostConfig();

  try {
    const ai = require('ai');
    const methods = ['generateText', 'generateObject', 'streamText', 'streamObject'];
    for (const method of methods) {
      if (typeof ai[method] !== 'function') continue;
      const original = ai[method];
      ai[method] = async function (...args: any[]) {
        const [options] = args;
        const context = getAgnostContext();
        const identity = context || { userId: 'anonymous' };
        options.experimental_telemetry = {
          isEnabled: true,
          metadata: {
            ...options.experimental_telemetry?.metadata,
            ...identity,
            sessionId: identity.sessionId || options.experimental_telemetry?.metadata?.sessionId,
          },
        };
        return original.apply(this, args);
      };
    }
  } catch {
    console.warn('[Agnost] Vercel AI SDK not found.');
    console.warn('[Agnost] In ESM, use agnost.track() instead of auto-patching.');
    console.warn('[Agnost]   const result = await agnost.track(generateText({...}));');
  }
}
