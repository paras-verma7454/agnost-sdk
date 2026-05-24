import { AgnostConfig, AgnostSetupConfig, TrackOptions } from './types';
import { trace, context, SpanStatusCode, Span, Tracer, AttributeValue } from '@opentelemetry/api';
import { setUser, setSession } from '@arizeai/openinference-core';
import { getAgnostConfig, initAgnost, shutdownAgnost } from './agnost';
import { getAgnostContext } from './core/context';

export { setAgnostContext, getAgnostContext } from './core/context';
export { createVercelTelemetry, instrumentVercelAI } from './frameworks/vercel';
export type { VercelTelemetryConfig } from './frameworks/vercel';
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
    const identity = getAgnostContext();

    const userId = options?.userId || identity?.userId;
    const sessionId = options?.sessionId || identity?.sessionId;

    const activeCtx = context.active();
    if (userId || sessionId) {
      let ctx = activeCtx;
      if (userId) ctx = setUser(ctx, { userId });
      if (sessionId) ctx = setSession(ctx, { sessionId });
      return context.with(ctx, () => this._doTrack(tracer, spanName, input, options, userId, sessionId));
    }

    return this._doTrack(tracer, spanName, input, options, userId, sessionId);
  }

  private async _doTrack<T>(
    tracer: Tracer,
    spanName: string,
    input: Promise<T> | (() => Promise<T>),
    options?: TrackOptions,
    userId?: string,
    sessionId?: string,
  ): Promise<T> {
    const span = tracer.startSpan(spanName) as Span;
    this.applyTrackAttributes(span, options, userId, sessionId);

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

  private applyTrackAttributes(
    span: Span,
    options?: TrackOptions,
    userId?: string,
    sessionId?: string,
  ): void {
    if (userId) span.setAttribute('user.id', userId);
    if (sessionId) span.setAttribute('session.id', sessionId);
    if (options?.conversationId) span.setAttribute('conversation.id', options.conversationId);
    if (options?.input !== undefined) span.setAttribute('input.value', normalizeAttributeValue(options.input));

    for (const [key, value] of Object.entries(options?.metadata || {})) {
      span.setAttribute(`metadata.${key}`, normalizeAttributeValue(value));
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

function normalizeAttributeValue(value: unknown): AttributeValue {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  return JSON.stringify(value) ?? String(value);
}
