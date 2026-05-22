import { getAgnostConfig, initAgnost } from '../agnost';

export async function instrumentVercelAI(config?: import('../types').AgnostConfig): Promise<void> {
  if (config) initAgnost(config);
  getAgnostConfig();

  console.log('[Agnost] Vercel AI SDK OTel exporter configured.');
  console.log('[Agnost] Set experimental_telemetry.isEnabled: true on each call to emit ai.* spans.');
  console.log('[Agnost] Use agnost.track() to wrap calls for identity injection:');
  console.log('[Agnost]   const result = await agnost.track(generateText({ ... }));');
}
