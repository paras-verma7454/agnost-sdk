import { AgnostConfig } from './types';
import { validateConfig } from './core/config';
import { SpanBatcher } from './core/batcher';
import { getOtelProvider, shutdownOtel } from './core/otel';

let resolvedConfig: Required<AgnostConfig> | null = null;
let batcher: SpanBatcher | null = null;

export function initAgnost(config: AgnostConfig): void {
  const resolved = validateConfig(config);
  if (resolvedConfig && batcher) return;

  resolvedConfig = resolved;
  getOtelProvider(resolvedConfig);
  batcher = new SpanBatcher(async (spans) => {
    console.log(`[Agnost] Flushing ${spans.length} spans`);
  });
}

export function isAgnostInitialized(): boolean {
  return resolvedConfig !== null && batcher !== null;
}

export function getAgnostConfig(): Required<AgnostConfig> {
  if (!resolvedConfig) {
    throw new Error('[Agnost] Not initialized. Call setupAgnost() or withAgnost() first.');
  }
  return resolvedConfig;
}

export function getAgnostBatcher(): SpanBatcher {
  if (!batcher) {
    throw new Error('[Agnost] Not initialized. Call setupAgnost() or withAgnost() first.');
  }
  return batcher;
}

export async function shutdownAgnost(): Promise<void> {
  if (batcher) {
    await batcher.shutdown();
  }
  await shutdownOtel();
  resolvedConfig = null;
  batcher = null;
}
