import { AgnostConfig } from '../types';

const DEFAULT_ENDPOINT = 'https://otel.agnost.ai';

export function validateConfig(config: AgnostConfig): Required<AgnostConfig> {
  if (!config.orgId || typeof config.orgId !== 'string') {
    throw new Error('[Agnost] orgId is required');
  }
  return {
    orgId: config.orgId,
    endpoint: config.endpoint || DEFAULT_ENDPOINT,
  };
}
