import { AgnostConfig } from '../types';
import { validateConfig } from '../core/config';
import { getOtelProvider } from '../core/otel';
import { getAgnostContext } from '../core/context';
import { context, trace } from '@opentelemetry/api';
import { setUser, setSession } from '@arizeai/openinference-core';

function patchPrototype(OpenAI: any): void {
  const originalCreate = OpenAI.prototype.chat?.completions?.create;
  if (!originalCreate) return;

  OpenAI.prototype.chat.completions.create = async function (...args: any[]) {
    const ctx = getAgnostContext();
    if (ctx?.userId) {
      let otelCtx = context.active();
      otelCtx = setUser(otelCtx, { userId: ctx.userId });
      if (ctx.sessionId) {
        otelCtx = setSession(otelCtx, { sessionId: ctx.sessionId });
      }
      return context.with(otelCtx, () => originalCreate.apply(this, args));
    }
    return originalCreate.apply(this, args);
  };
}

export function wrapOpenAIClient(client: any): void {
  if (!client || !client.chat?.completions?.create) return;

  const completions = client.chat.completions;
  const originalCreate = completions.create.bind(completions);
  completions.create = async function (...args: any[]) {
    const ctx = getAgnostContext();
    if (ctx?.userId) {
      let otelCtx = context.active();
      otelCtx = setUser(otelCtx, { userId: ctx.userId });
      if (ctx.sessionId) {
        otelCtx = setSession(otelCtx, { sessionId: ctx.sessionId });
      }
      return context.with(otelCtx, () => originalCreate(...args));
    }
    return originalCreate(...args);
  };
}

export async function instrumentOpenAI(config: AgnostConfig): Promise<void> {
  const resolved = validateConfig(config);
  getOtelProvider(resolved);

  try {
    const { OpenAIInstrumentation } = await import('@arizeai/openinference-instrumentation-openai');
    const openAIInstrumentation = new OpenAIInstrumentation();
    openAIInstrumentation.setTracerProvider(trace.getTracerProvider());

    const openaiModule = await import('openai');
    const OpenAI = openaiModule.OpenAI || (openaiModule as any).default?.OpenAI || openaiModule;

    openAIInstrumentation.manuallyInstrument(OpenAI as never);
    patchPrototype(OpenAI);
  } catch (err) {
    console.warn('[Agnost] OpenAI SDK not found. Skipping instrumentation.', (err as Error).message);
  }
}
