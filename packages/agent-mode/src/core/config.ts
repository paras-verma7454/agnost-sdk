import { AgnostConfig } from '../types';

const DEFAULT_ENDPOINT = 'https://otel.agnost.ai';
const OTLP_TRACES_PATH = '/v1/traces';
const ORG_ID_HEADER = 'X-Agnost-Org-ID';

export function validateConfig(config: AgnostConfig): Required<AgnostConfig> {
  if (!config.orgId || typeof config.orgId !== 'string') {
    throw new Error('[Agnost] orgId is required');
  }
  return {
    orgId: config.orgId,
    endpoint: config.endpoint || DEFAULT_ENDPOINT,
  };
}

export function getOtlpTraceUrl(config: Required<AgnostConfig>): string {
  return `${config.endpoint}${OTLP_TRACES_PATH}`;
}

export function getAgnostHeaders(config: Required<AgnostConfig>): Record<string, string> {
  return { [ORG_ID_HEADER]: config.orgId };
}
