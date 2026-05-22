import { AgnostConfig, AgnostSetupConfig, TrackOptions } from './types';
import { trace, context, SpanStatusCode, Span } from '@opentelemetry/api';
import { setUser, setSession } from '@arizeai/openinference-core';
import { getAgnostConfig, initAgnost, shutdownAgnost } from './agnost';
import { getAgnostContext } from './core/context';

export { setAgnostContext, getAgnostContext } from './core/context';
export { instrumentVercelAI } from './frameworks/vercel';
export { instrumentOpenAI } from './frameworks/openai';
export { createMastraExporter } from './frameworks/mastra';
export type { AgnostConfig, AgnostSetupConfig, UserIdentity, TrackOptions } from './types';

export class AgnostAgent {
  constructor(config: AgnostConfig) {
    initAgnost(config);
  }

  async track<T>(input: Promise<T> | (() => Promise<T>), options?: TrackOptions): Promise<T> {
    const name = options?.toolName || 'agent_interaction';
    const spanName = name.startsWith('tool.') ? name : `tool.${name}`;
    const tracer = trace.getTracer('agnost');

    const userId = options?.userId || getAgnostContext()?.userId;
    const sessionId = options?.sessionId || getAgnostContext()?.sessionId;

    const activeCtx = context.active();
    if (userId || sessionId) {
      let ctx = activeCtx;
      if (userId) ctx = setUser(ctx, { userId });
      if (sessionId) ctx = setSession(ctx, { sessionId });
      return context.with(ctx, () => this._doTrack(tracer, spanName, input));
    }

    return this._doTrack(tracer, spanName, input);
  }

  private async _doTrack<T>(
    tracer: any,
    spanName: string,
    input: Promise<T> | (() => Promise<T>),
  ): Promise<T> {
    const span = tracer.startSpan(spanName) as Span;

    try {
      const promise = typeof input === 'function' ? input() : input;
      const result = await promise;
      span.setStatus({ code: SpanStatusCode.OK });
      span.end();
      return result;
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
      span.recordException(error as Error);
      span.end();
      throw error;
    }
  }

  async instrumentOpenAI(): Promise<void> {
    const { instrumentOpenAI } = await import('./frameworks/openai');
    return instrumentOpenAI();
  }

  async instrumentVercelAI(): Promise<void> {
    const { instrumentVercelAI } = await import('./frameworks/vercel');
    return instrumentVercelAI();
  }

  async shutdown(): Promise<void> {
    await shutdownAgnost();
  }
}

export function withAgnost(config: AgnostConfig): AgnostAgent {
  return new AgnostAgent(config);
}

export const createAgnost = withAgnost;

export async function setupAgnost(config: AgnostSetupConfig): Promise<AgnostAgent> {
  const agent = withAgnost(config);

  if (config.integrations?.openai) {
    await agent.instrumentOpenAI();
  }
  if (config.integrations?.vercelAI) {
    await agent.instrumentVercelAI();
  }

  return agent;
}
