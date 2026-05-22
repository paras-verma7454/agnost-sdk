import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { Resource } from '@opentelemetry/resources';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { AgnostConfig } from '../types';

let sdk: NodeSDK | null = null;

export function getOtelProvider(config: AgnostConfig): NodeSDK {
  if (sdk) return sdk;

  const exporter = new OTLPTraceExporter({
    url: `${config.endpoint}/v1/traces`,
    headers: { 'X-Agnost-Org-ID': config.orgId },
  });

  const processor = new BatchSpanProcessor(exporter, {
    scheduledDelayMillis: 1000,
  });

  sdk = new NodeSDK({
    resource: new Resource({
      'service.name': 'agnost-agent-mode',
      'agnost.org.id': config.orgId,
    }),
    spanProcessor: processor,
  });

  sdk.start();
  return sdk;
}

export function shutdownOtel(): Promise<void> {
  const activeSdk = sdk;
  sdk = null;
  return activeSdk?.shutdown() || Promise.resolve();
}
