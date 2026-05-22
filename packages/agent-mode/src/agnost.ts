import { AgnostConfig } from './types';
import { validateConfig } from './core/config';
import { getOtelProvider, shutdownOtel } from './core/otel';

let resolvedConfig: Required<AgnostConfig> | null = null;

export function initAgnost(config: AgnostConfig): void {
  const resolved = validateConfig(config);
  if (resolvedConfig) return;

  resolvedConfig = resolved;
  getOtelProvider(resolvedConfig);
}

export function isAgnostInitialized(): boolean {
  return resolvedConfig !== null;
}

export function getAgnostConfig(): Required<AgnostConfig> {
  if (!resolvedConfig) {
    throw new Error('[Agnost] Not initialized. Call setupAgnost() or withAgnost() first.');
  }
  return resolvedConfig;
}

export async function shutdownAgnost(): Promise<void> {
  await shutdownOtel();
  resolvedConfig = null;
}
