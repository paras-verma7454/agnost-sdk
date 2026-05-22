import { AgnostConfig } from '../types';
import { getAgnostContext } from '../core/context';
import { getAgnostConfig, initAgnost } from '../agnost';
import { context, trace } from '@opentelemetry/api';
import { setUser, setSession } from '@arizeai/openinference-core';

function patchCompletions(OpenAI: any): void {
  const tempClient = new OpenAI({ apiKey: '' });
  const completions = tempClient.chat.completions;
  const proto = Object.getPrototypeOf(completions);

  const originalCreate = proto.create;
  if (!originalCreate) return;

  proto.create = async function (...args: any[]) {
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

export async function instrumentOpenAI(config?: AgnostConfig): Promise<void> {
  if (config) initAgnost(config);
  getAgnostConfig();

  try {
    const { OpenAIInstrumentation } = await import('@arizeai/openinference-instrumentation-openai');
    const openAIInstrumentation = new OpenAIInstrumentation();
    openAIInstrumentation.setTracerProvider(trace.getTracerProvider());

    const openaiModule = await import('openai');
    const OpenAI = openaiModule.OpenAI || (openaiModule as any).default?.OpenAI || openaiModule;

    openAIInstrumentation.manuallyInstrument(OpenAI as never);
    patchCompletions(OpenAI);
  } catch (err) {
    console.warn('[Agnost] OpenAI SDK not found. Skipping instrumentation.', (err as Error).message);
  }
}
