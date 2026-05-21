import { AgnostConfig, TrackOptions, SpanData } from './types';
import { validateConfig } from './core/config';
import { SpanBatcher } from './core/batcher';
import { getOtelProvider, shutdownOtel } from './core/otel';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { setAgnostContext, getAgnostContext } from './core/context';

export { setAgnostContext, getAgnostContext };
export { instrumentVercelAI } from './frameworks/vercel';
export { instrumentOpenAI, wrapOpenAIClient } from './frameworks/openai';
export { createMastraExporter } from './frameworks/mastra';

function toSpanName(toolName?: string): string {
  const raw = toolName || 'agent_interaction';
  return raw.startsWith('tool.') ? raw : `tool.${raw}`;
}

function getIdentity(options?: TrackOptions) {
  const ctx = getAgnostContext();
  return {
    userId: options?.userId || ctx?.userId,
    sessionId: options?.sessionId || ctx?.sessionId,
    conversationId: options?.conversationId,
  };
}

function setIdentityAttrs(span: any, options?: TrackOptions): void {
  const id = getIdentity(options);
  if (id.userId) span.setAttribute('agnost.user_id', id.userId);
  if (id.sessionId) span.setAttribute('agnost.session_id', id.sessionId);
  if (id.conversationId) span.setAttribute('agnost.conversation_id', id.conversationId);
  if (options?.input) {
    span.setAttribute(
      'input',
      typeof options.input === 'string' ? options.input : JSON.stringify(options.input),
    );
  }
}

function buildSpanData(
  span: any,
  name: string,
  startTime: number,
  endTime: number,
  status: 'ok' | 'error',
  attributes: Record<string, any>,
  options?: TrackOptions,
): SpanData {
  const id = getIdentity(options);
  return {
    traceId: span.spanContext().traceId,
    spanId: span.spanContext().spanId,
    name,
    startTime,
    endTime,
    status,
    attributes,
    userId: id.userId,
    sessionId: id.sessionId,
  };
}

export class AgnostAgent {
  private config: Required<AgnostConfig>;
  private batcher: SpanBatcher;

  constructor(config: AgnostConfig) {
    this.config = validateConfig(config);
    getOtelProvider(this.config);
    this.batcher = new SpanBatcher(async (spans) => {
      console.log(`[Agnost] Flushing ${spans.length} spans`);
    });
  }

  async track<T>(input: Promise<T> | (() => Promise<T>), options?: TrackOptions): Promise<T> {
    const startTime = Date.now();
    const name = toSpanName(options?.toolName);
    const span = trace.getTracer('agnost').startSpan(name);

    setIdentityAttrs(span, options);

    try {
      const promise = typeof input === 'function' ? input() : input;
      const result = await promise;
      span.setStatus({ code: SpanStatusCode.OK });
      span.setAttribute('output', JSON.stringify(result));
      span.end();
      this.batcher.add(buildSpanData(span, name, startTime, Date.now(), 'ok', options?.metadata || {}, options));
      return result;
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
      span.recordException(error as Error);
      span.end();
      this.batcher.add(
        buildSpanData(span, name, startTime, Date.now(), 'error', { error: (error as Error).message, ...options?.metadata }, options),
      );
      throw error;
    }
  }

  begin(name: string, options?: TrackOptions): AgnostSpanBuilder {
    const spanName = toSpanName(name);
    const span = trace.getTracer('agnost').startSpan(spanName);
    setIdentityAttrs(span, options);
    return new AgnostSpanBuilder(span, spanName, this.batcher, options);
  }

  async instrumentVercelAI(): Promise<void> {
    const { instrumentVercelAI } = await import('./frameworks/vercel');
    return instrumentVercelAI(this.config);
  }

  async instrumentOpenAI(): Promise<void> {
    const { instrumentOpenAI } = await import('./frameworks/openai');
    return instrumentOpenAI(this.config);
  }

  async flush(): Promise<void> {
    await this.batcher.flush();
  }

  async shutdown(): Promise<void> {
    await this.batcher.shutdown();
    await shutdownOtel();
  }
}

export class AgnostSpanBuilder {
  private span: any;
  private spanName: string;
  private batcher: SpanBatcher;
  private options?: TrackOptions;
  private startTime: number;

  constructor(span: any, spanName: string, batcher: SpanBatcher, options?: TrackOptions) {
    this.span = span;
    this.spanName = spanName;
    this.batcher = batcher;
    this.options = options;
    this.startTime = Date.now();
  }

  setAttribute(key: string, value: any): this {
    this.span.setAttribute(key, value);
    return this;
  }

  setAttributes(attrs: Record<string, any>): this {
    Object.entries(attrs).forEach(([k, v]) => this.span.setAttribute(k, v));
    return this;
  }

  end(output?: any): void {
    if (output !== undefined) {
      this.span.setAttribute('output', typeof output === 'string' ? output : JSON.stringify(output));
    }
    this.span.setStatus({ code: SpanStatusCode.OK });
    this.span.end();
    this.batcher.add(buildSpanData(this.span, this.spanName, this.startTime, Date.now(), 'ok', output ? { output } : {}, this.options));
  }

  fail(error: Error): void {
    this.span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    this.span.setAttribute('output', error.message);
    this.span.recordException(error);
    this.span.end();
    this.batcher.add(
      buildSpanData(this.span, this.spanName, this.startTime, Date.now(), 'error', { error: error.message }, this.options),
    );
  }
}

export function withAgnost(config: AgnostConfig): AgnostAgent {
  return new AgnostAgent(config);
}
