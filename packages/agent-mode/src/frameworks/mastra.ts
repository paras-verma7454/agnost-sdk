import { AgnostConfig } from '../types';
import { validateConfig } from '../core/config';

export async function createMastraExporter(config: AgnostConfig) {
  const resolved = validateConfig(config);
  try {
    const { OtelExporter } = await import('@mastra/otel-exporter');
    return new OtelExporter({
      provider: {
        custom: {
          endpoint: `${resolved.endpoint}/v1/traces`,
          headers: { 'X-Agnost-Org-ID': resolved.orgId },
          protocol: 'http/protobuf',
        },
      },
    });
  } catch {
    throw new Error('[Agnost] @mastra/otel-exporter not found. Install it first.');
  }
}
