import { getAgnostConfig, initAgnost } from '../agnost';
import { trace } from '@opentelemetry/api';

export async function instrumentOpenAI(config?: import('../types').AgnostConfig): Promise<void> {
  if (config) initAgnost(config);
  getAgnostConfig();

  try {
    const { OpenAIInstrumentation } = await import('@arizeai/openinference-instrumentation-openai');
    const openAIInstrumentation = new OpenAIInstrumentation();
    openAIInstrumentation.setTracerProvider(trace.getTracerProvider());

    const openaiModule = await import('openai');
    const OpenAI = openaiModule.OpenAI || (openaiModule as any).default?.OpenAI || openaiModule;

    openAIInstrumentation.manuallyInstrument(OpenAI as never);
  } catch (err) {
    if (isMissingOptionalDependency(err)) {
      console.warn('[Agnost] OpenAI SDK not found. Skipping instrumentation.', (err as Error).message);
      return;
    }

    throw err;
  }
}

function isMissingOptionalDependency(err: unknown): boolean {
  const code = (err as { code?: string }).code;
  return code === 'MODULE_NOT_FOUND' || code === 'ERR_MODULE_NOT_FOUND';
}
