# PRD: Build @agnost/agent-mode — AI Agent Execution Spec

**Target:** OpenCode / Claude Code / CLI coding agent  
**Output:** Working TypeScript monorepo with tests  
**Time estimate:** 2-3 hours of agent execution  
**Author:** Paras Verma | Track B: Full-Stack/FDE First

---

## 1. What to Build (One Sentence)

A zero-config TypeScript SDK (`@agnost/agent-mode`) that auto-tracks AI agent calls from Vercel AI SDK, OpenAI SDK, and Mastra — emitting OTLP spans to `otel.agnost.ai` with automatic user identity resolution.

---

## 2. Architecture Diagram

```
DEVELOPER APP
  ├── Vercel AI SDK ──→ @agnost/agent-mode ──→ otel.agnost.ai
  ├── OpenAI SDK ─────→ (OTLP spans) ────────→ Agnost Dashboard
  └── Mastra SDK ─────→ (auto identity)
```

**We are a client-side wrapper ONLY.** No backend. No database. In-memory buffer.

---

## 3. File Tree (Build These Exactly)

```
agnost-integration-mode/
├── package.json                          # Root workspace config
├── .gitignore
├── REASONING.md                          # Already written separately
├── README.md                             # Already written separately
│
├── packages/
│   └── agent-mode/
│       ├── package.json                  # Package: @agnost/agent-mode
│       ├── tsup.config.ts                # Build config (esm + cjs)
│       ├── vercel.ts                     # Subpath: @agnost/agent-mode/vercel
│       ├── openai.ts                     # Subpath: @agnost/agent-mode/openai
│       ├── mastra.ts                     # Subpath: @agnost/agent-mode/mastra
│       ├── src/
│       │   ├── index.ts                  # Main export: withAgnost(), AgnostAgent
│       │   ├── types.ts                  # All TypeScript interfaces
│       │   ├── core/
│       │   │   ├── config.ts             # validateConfig() — orgId required
│       │   │   ├── context.ts            # AsyncLocalStorage for request identity
│       │   │   ├── identity.ts           # resolveIdentity() — 7-level cascade
│       │   │   ├── batcher.ts            # SpanBatcher class — in-memory buffer
│       │   │   └── otel.ts               # getOtelProvider() — singleton NodeSDK
│       │   └── frameworks/
│       │       ├── vercel.ts             # instrumentVercelAI() — proxy ai module
│       │       ├── openai.ts             # instrumentOpenAI() — OpenInference + OTLP
│       │       └── mastra.ts             # createMastraExporter() — OtelExporter factory
│       └── test/
│           └── index.test.ts             # Vitest tests (5 test suites)
│
└── examples/
    ├── vercel-ai-app/
    │   └── app/route.ts                  # Next.js route using Vercel AI + Agnost
    ├── openai-app/
    │   └── index.ts                      # Express app using OpenAI + Agnost
    └── mastra-app/
        └── index.ts                      # Mastra agent + Agnost exporter
```

**Total files to generate: 20**

---

## 4. Per-File Specs (Copy-Pasteable for Agent)

### 4.1 Root package.json

```json
{
  "name": "agnost-integration-mode",
  "version": "0.1.0",
  "private": true,
  "workspaces": ["packages/*", "examples/*"],
  "scripts": {
    "build": "npm run build --workspace=@agnost/agent-mode",
    "test": "npm run test --workspace=@agnost/agent-mode",
    "lint": "npm run lint --workspace=@agnost/agent-mode"
  },
  "devDependencies": {
    "typescript": "^5.7.0"
  }
}
```

### 4.2 packages/agent-mode/package.json

```json
{
  "name": "@agnost/agent-mode",
  "version": "0.1.0",
  "description": "Zero-config analytics integration for AI agents",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "import": "./dist/index.js", "require": "./dist/index.cjs", "types": "./dist/index.d.ts" },
    "./vercel": { "import": "./dist/frameworks/vercel.js", "require": "./dist/frameworks/vercel.cjs", "types": "./dist/frameworks/vercel.d.ts" },
    "./openai": { "import": "./dist/frameworks/openai.js", "require": "./dist/frameworks/openai.cjs", "types": "./dist/frameworks/openai.d.ts" },
    "./mastra": { "import": "./dist/frameworks/mastra.js", "require": "./dist/frameworks/mastra.cjs", "types": "./dist/frameworks/mastra.d.ts" }
  },
  "scripts": {
    "build": "tsup",
    "test": "vitest",
    "lint": "eslint src/**/*.ts"
  },
  "dependencies": {
    "@opentelemetry/api": "^1.9.0",
    "@opentelemetry/sdk-node": "^0.57.0",
    "@opentelemetry/exporter-trace-otlp-proto": "^0.57.0",
    "@opentelemetry/sdk-trace-base": "^1.30.0",
    "@arizeai/openinference-instrumentation-openai": "^2.3.1"
  },
  "peerDependencies": {
    "ai": "^4.0.0",
    "openai": "^4.95.0",
    "@mastra/otel-exporter": "^0.1.0"
  },
  "peerDependenciesMeta": {
    "ai": { "optional": true },
    "openai": { "optional": true },
    "@mastra/otel-exporter": { "optional": true }
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "tsup": "^8.3.0",
    "vitest": "^3.0.0",
    "@types/node": "^22.0.0"
  },
  "license": "MIT"
}
```

### 4.3 packages/agent-mode/tsup.config.ts

```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/frameworks/vercel.ts',
    'src/frameworks/openai.ts',
    'src/frameworks/mastra.ts',
  ],
  format: ['esm', 'cjs'],
  dts: true,
  splitting: true,
  sourcemap: true,
  clean: true,
  external: [
    'ai', 'openai', '@mastra/otel-exporter', '@mastra/core', '@mastra/observability',
    '@arizeai/openinference-instrumentation-openai',
    '@opentelemetry/*',
  ],
});
```

### 4.4 packages/agent-mode/src/types.ts

```typescript
export interface AgnostConfig {
  orgId: string;
  endpoint?: string;
}

export interface UserIdentity {
  userId: string;
  email?: string;
  name?: string;
  organization?: string;
  plan?: string;
  [key: string]: any;
}

export interface TrackOptions {
  userId?: string;
  sessionId?: string;
  conversationId?: string;
  metadata?: Record<string, any>;
}

export interface SpanData {
  traceId: string;
  spanId: string;
  name: string;
  startTime: number;
  endTime?: number;
  status: 'ok' | 'error';
  attributes: Record<string, any>;
  userId?: string;
  sessionId?: string;
}
```

### 4.5 packages/agent-mode/src/core/config.ts

```typescript
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
```

### 4.6 packages/agent-mode/src/core/context.ts

```typescript
import { AsyncLocalStorage } from 'async_hooks';
import { UserIdentity } from '../types';

const contextStore = new AsyncLocalStorage<UserIdentity>();

export function setAgnostContext(identity: UserIdentity): void {
  contextStore.enterWith(identity);
}

export function getAgnostContext(): UserIdentity | undefined {
  return contextStore.getStore();
}
```

### 4.7 packages/agent-mode/src/core/identity.ts

```typescript
import { AgnostConfig, UserIdentity, TrackOptions } from '../types';
import { getAgnostContext } from './context';

export async function resolveIdentity(
  config: AgnostConfig,
  options?: TrackOptions,
  request?: any
): Promise<UserIdentity> {
  // Priority 1: Explicit options
  if (options?.userId) {
    return { userId: options.userId, ...options.metadata };
  }

  // Priority 2: AsyncLocalStorage context
  const ctx = getAgnostContext();
  if (ctx?.userId) {
    return ctx;
  }

  // Priority 3: HTTP headers
  if (request?.headers) {
    const userId = request.headers['x-user-id'];
    if (userId) return { userId };
  }

  // Priority 4: Cookie
  if (request?.cookies?.agnost_user_id) {
    return { userId: request.cookies.agnost_user_id };
  }

  // Priority 5: JWT from Authorization header
  if (request?.headers?.authorization) {
    try {
      const token = request.headers.authorization.replace('Bearer ', '');
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      if (payload.sub) {
        return { userId: payload.sub, email: payload.email };
      }
    } catch {
      // Invalid JWT, continue
    }
  }

  // Priority 6: Session
  if (request?.session?.userId) {
    return { userId: request.session.userId };
  }

  // Priority 7: Anonymous
  return { userId: 'anonymous' };
}
```

### 4.8 packages/agent-mode/src/core/batcher.ts

```typescript
import { SpanData } from '../types';

const MAX_BATCH_SIZE = 100;
const FLUSH_INTERVAL_MS = 5000;
const MAX_BUFFER_SIZE = 1000;

export class SpanBatcher {
  private buffer: SpanData[] = [];
  private timer: NodeJS.Timeout | null = null;
  private flushFn: (spans: SpanData[]) => Promise<void>;

  constructor(flushFn: (spans: SpanData[]) => Promise<void>) {
    this.flushFn = flushFn;
    this.startTimer();
    this.setupExitHandler();
  }

  add(span: SpanData): void {
    if (this.buffer.length >= MAX_BUFFER_SIZE) {
      this.buffer.shift();
      console.warn('[Agnost] Span buffer full, dropped oldest span');
    }
    this.buffer.push(span);
    if (this.buffer.length >= MAX_BATCH_SIZE) {
      this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const batch = this.buffer.splice(0, this.buffer.length);
    try {
      await this.flushFn(batch);
    } catch (err) {
      console.error('[Agnost] Flush failed:', (err as Error).message);
    }
  }

  private startTimer(): void {
    this.timer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);
  }

  private setupExitHandler(): void {
    process.on('SIGTERM', () => this.flush());
    process.on('SIGINT', () => this.flush());
    process.on('beforeExit', () => this.flush());
  }

  async shutdown(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await this.flush();
  }
}
```

### 4.9 packages/agent-mode/src/core/otel.ts

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { Resource } from '@opentelemetry/resources';
import { AgnostConfig } from '../types';

let sdk: NodeSDK | null = null;

export function getOtelProvider(config: AgnostConfig): NodeSDK {
  if (sdk) return sdk;

  const exporter = new OTLPTraceExporter({
    url: `${config.endpoint}/v1/traces`,
    headers: { 'X-Agnost-Org-ID': config.orgId },
  });

  sdk = new NodeSDK({
    resource: new Resource({
      'service.name': 'agnost-agent-mode',
      'agnost.org.id': config.orgId,
    }),
    traceExporter: exporter,
  });

  sdk.start();
  return sdk;
}

export function shutdownOtel(): Promise<void> {
  return sdk?.shutdown() || Promise.resolve();
}
```

### 4.10 packages/agent-mode/src/frameworks/vercel.ts

```typescript
import { AgnostConfig } from '../types';
import { getOtelProvider } from '../core/otel';
import { getAgnostContext } from '../core/context';

export function instrumentVercelAI(config: AgnostConfig): void {
  getOtelProvider(config);

  try {
    const ai = require('ai');
    const methods = ['generateText', 'generateObject', 'streamText', 'streamObject'];

    methods.forEach((method) => {
      if (!ai[method]) return;
      const original = ai[method];
      ai[method] = async function(...args: any[]) {
        const [options] = args;
        const context = getAgnostContext();
        const identity = context || { userId: 'anonymous' };

        options.experimental_telemetry = {
          isEnabled: true,
          metadata: {
            ...options.experimental_telemetry?.metadata,
            userId: identity.userId,
            sessionId: identity.sessionId || options.experimental_telemetry?.metadata?.sessionId,
            ...identity,
          },
        };

        return original.apply(this, args);
      };
    });
  } catch {
    console.warn('[Agnost] Vercel AI SDK not found. Skipping instrumentation.');
  }
}
```

### 4.11 packages/agent-mode/src/frameworks/openai.ts

```typescript
import { AgnostConfig } from '../types';
import { getOtelProvider } from '../core/otel';
import { getAgnostContext } from '../core/context';
import { trace } from '@opentelemetry/api';

function checkVersionCompatibility(): void {
  try {
    const openaiPkg = require('openai/package.json');
    const oiPkg = require('@arizeai/openinference-instrumentation-openai/package.json');
    console.log(`[Agnost] OpenAI ${openaiPkg.version} + OpenInference ${oiPkg.version}`);
  } catch {
    console.warn('[Agnost] Could not verify version compatibility');
  }
}

export function instrumentOpenAI(config: AgnostConfig): void {
  getOtelProvider(config);

  try {
    checkVersionCompatibility();
    const { OpenAIInstrumentation } = require('@arizeai/openinference-instrumentation-openai');
    const instrumentation = new OpenAIInstrumentation();
    const provider = getOtelProvider(config);
    instrumentation.setTracerProvider(provider as any);

    const originalCreate = require('openai').OpenAI.prototype.chat.completions.create;
    require('openai').OpenAI.prototype.chat.completions.create = async function(...args: any[]) {
      const ctx = getAgnostContext();
      if (ctx?.userId) {
        const span = trace.getActiveSpan();
        if (span) {
          span.setAttribute('user.id', ctx.userId);
          span.setAttribute('session.id', ctx.sessionId || '');
        }
      }
      return originalCreate.apply(this, args);
    };
  } catch (err) {
    console.warn('[Agnost] OpenAI SDK not found. Skipping instrumentation.', (err as Error).message);
  }
}
```

### 4.12 packages/agent-mode/src/frameworks/mastra.ts

```typescript
import { AgnostConfig } from '../types';

export function createMastraExporter(config: AgnostConfig) {
  try {
    const { OtelExporter } = require('@mastra/otel-exporter');
    return new OtelExporter({
      provider: {
        custom: {
          endpoint: `${config.endpoint}/v1/traces`,
          headers: { 'X-Agnost-Org-ID': config.orgId },
          protocol: 'http/protobuf',
        },
      },
    });
  } catch {
    throw new Error('[Agnost] @mastra/otel-exporter not found. Install it first.');
  }
}
```

### 4.13 packages/agent-mode/src/index.ts

```typescript
import { AgnostConfig, TrackOptions, SpanData } from './types';
import { validateConfig } from './core/config';
import { SpanBatcher } from './core/batcher';
import { getOtelProvider, shutdownOtel } from './core/otel';
import { trace } from '@opentelemetry/api';
import { setAgnostContext, getAgnostContext } from './core/context';

export { setAgnostContext, getAgnostContext };
export { instrumentVercelAI } from './frameworks/vercel';
export { instrumentOpenAI } from './frameworks/openai';
export { createMastraExporter } from './frameworks/mastra';

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

  async track<T>(promise: Promise<T>, options?: TrackOptions): Promise<T> {
    const startTime = Date.now();
    const span = trace.getTracer('agnost').startSpan('track');

    try {
      const result = await promise;
      span.setStatus({ code: 1 });
      span.end();
      this.batcher.add({
        traceId: span.spanContext().traceId,
        spanId: span.spanContext().spanId,
        name: 'agent.interaction',
        startTime,
        endTime: Date.now(),
        status: 'ok',
        attributes: options?.metadata || {},
        userId: options?.userId,
        sessionId: options?.sessionId,
      });
      return result;
    } catch (error) {
      span.setStatus({ code: 2, message: (error as Error).message });
      span.end();
      this.batcher.add({
        traceId: span.spanContext().traceId,
        spanId: span.spanContext().spanId,
        name: 'agent.interaction',
        startTime,
        endTime: Date.now(),
        status: 'error',
        attributes: { error: (error as Error).message, ...options?.metadata },
        userId: options?.userId,
        sessionId: options?.sessionId,
      });
      throw error;
    }
  }

  begin(name: string, options?: TrackOptions): AgnostSpanBuilder {
    const span = trace.getTracer('agnost').startSpan(name);
    return new AgnostSpanBuilder(span, this.batcher, options);
  }

  instrumentVercelAI(): void {
    const { instrumentVercelAI } = require('./frameworks/vercel');
    instrumentVercelAI(this.config);
  }

  instrumentOpenAI(): void {
    const { instrumentOpenAI } = require('./frameworks/openai');
    instrumentOpenAI(this.config);
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
  private batcher: SpanBatcher;
  private options?: TrackOptions;
  private startTime: number;

  constructor(span: any, batcher: SpanBatcher, options?: TrackOptions) {
    this.span = span;
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
    this.span.setStatus({ code: 1 });
    this.span.end();
    this.batcher.add({
      traceId: this.span.spanContext().traceId,
      spanId: this.span.spanContext().spanId,
      name: this.span.name,
      startTime: this.startTime,
      endTime: Date.now(),
      status: 'ok',
      attributes: output ? { output } : {},
      userId: this.options?.userId,
      sessionId: this.options?.sessionId,
    });
  }

  fail(error: Error): void {
    this.span.setStatus({ code: 2, message: error.message });
    this.span.recordException(error);
    this.span.end();
    this.batcher.add({
      traceId: this.span.spanContext().traceId,
      spanId: this.span.spanContext().spanId,
      name: this.span.name,
      startTime: this.startTime,
      endTime: Date.now(),
      status: 'error',
      attributes: { error: error.message },
      userId: this.options?.userId,
      sessionId: this.options?.sessionId,
    });
  }
}

export function withAgnost(config: AgnostConfig): AgnostAgent {
  return new AgnostAgent(config);
}
```

### 4.14 packages/agent-mode/vercel.ts (subpath entry)

```typescript
export { instrumentVercelAI } from './src/frameworks/vercel';
```

### 4.15 packages/agent-mode/openai.ts (subpath entry)

```typescript
export { instrumentOpenAI } from './src/frameworks/openai';
```

### 4.16 packages/agent-mode/mastra.ts (subpath entry)

```typescript
export { createMastraExporter } from './src/frameworks/mastra';
```

### 4.17 packages/agent-mode/test/index.test.ts

```typescript
import { describe, it, expect, vi } from 'vitest';
import { withAgnost, setAgnostContext, getAgnostContext } from '../src/index';
import { SpanBatcher } from '../src/core/batcher';

describe('AgnostAgent', () => {
  it('should create agent with orgId', () => {
    const agent = withAgnost({ orgId: 'test-org' });
    expect(agent).toBeDefined();
  });

  it('should throw without orgId', () => {
    expect(() => withAgnost({} as any)).toThrow('[Agnost] orgId is required');
  });

  it('should track successful promise', async () => {
    const agent = withAgnost({ orgId: 'test-org' });
    const result = await agent.track(
      Promise.resolve('hello'),
      { userId: 'user-1' }
    );
    expect(result).toBe('hello');
  });

  it('should track failed promise', async () => {
    const agent = withAgnost({ orgId: 'test-org' });
    await expect(
      agent.track(Promise.reject(new Error('fail')), { userId: 'user-1' })
    ).rejects.toThrow('fail');
  });
});

describe('Context', () => {
  it('should set and get context', () => {
    setAgnostContext({ userId: 'user-42', email: 'test@example.com' });
    const ctx = getAgnostContext();
    expect(ctx?.userId).toBe('user-42');
    expect(ctx?.email).toBe('test@example.com');
  });
});

describe('SpanBatcher', () => {
  it('should batch spans', async () => {
    const flushFn = vi.fn().mockResolvedValue(undefined);
    const batcher = new SpanBatcher(flushFn);
    for (let i = 0; i < 5; i++) {
      batcher.add({
        traceId: `trace-${i}`,
        spanId: `span-${i}`,
        name: 'test',
        startTime: Date.now(),
        status: 'ok',
        attributes: {},
      });
    }
    await batcher.flush();
    expect(flushFn).toHaveBeenCalledTimes(1);
  });
});

describe('Identity Resolution', () => {
  it('should resolve from explicit options', async () => {
    const { resolveIdentity } = await import('../src/core/identity');
    const identity = await resolveIdentity(
      { orgId: 'test' },
      { userId: 'explicit-user' }
    );
    expect(identity.userId).toBe('explicit-user');
  });

  it('should fallback to anonymous', async () => {
    const { resolveIdentity } = await import('../src/core/identity');
    const identity = await resolveIdentity({ orgId: 'test' });
    expect(identity.userId).toBe('anonymous');
  });
});
```

### 4.18 examples/vercel-ai-app/app/route.ts

```typescript
import { openai } from '@ai-sdk/openai';
import { generateText, streamText } from 'ai';
import { withAgnost, setAgnostContext } from '@agnost/agent-mode';

const agnost = withAgnost({ orgId: process.env.AGNOST_ORG_ID! });
agnost.instrumentVercelAI();

setAgnostContext({ userId: 'user-42', email: 'user@example.com' });

export async function POST(req: Request) {
  const { prompt } = await req.json();
  const { text } = await generateText({
    model: openai('gpt-4o'),
    prompt,
  });
  return Response.json({ text });
}
```

### 4.19 examples/openai-app/index.ts

```typescript
import OpenAI from 'openai';
import { withAgnost, setAgnostContext } from '@agnost/agent-mode';

const agnost = withAgnost({ orgId: process.env.AGNOST_ORG_ID! });
agnost.instrumentOpenAI();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
setAgnostContext({ userId: 'user-42', email: 'user@example.com' });

async function handleChat(message: string) {
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: message }],
  });
  return completion.choices[0].message.content;
}

// Express route would call handleChat
```

### 4.20 examples/mastra-app/index.ts

```typescript
import { Mastra } from '@mastra/core';
import { Observability } from '@mastra/observability';
import { createMastraExporter } from '@agnost/agent-mode/mastra';

const agnostExporter = createMastraExporter({
  orgId: process.env.AGNOST_ORG_ID!,
});

const mastra = new Mastra({
  agents: { myAgent },
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'my-mastra-app',
        exporters: [agnostExporter],
      },
    },
  }),
});

async function handleChat(message: string) {
  const result = await mastra.agent.generate(message, {
    tracingOptions: {
      metadata: {
        userId: 'user-42',
        conversationId: 'conv-abc123',
      },
    },
  });
  return result.text;
}
```

### 4.21 .gitignore

```
node_modules/
dist/
*.log
.env
.DS_Store
coverage/
```

---

## 5. Build & Test Commands (Run These)

```bash
# 1. Install deps
cd packages/agent-mode && npm install

# 2. Build
npm run build
# Should produce dist/ with .js, .cjs, .d.ts for all 4 entry points

# 3. Test
npm run test
# Should pass all 5 test suites

# 4. Verify subpath exports exist:
ls dist/frameworks/vercel.js
ls dist/frameworks/openai.js
ls dist/frameworks/mastra.js
```

---

## 6. Success Criteria (Check These)

- [ ] `withAgnost({ orgId: 'test' })` creates agent without error
- [ ] `withAgnost({})` throws `[Agnost] orgId is required`
- [ ] `agnost.track(Promise.resolve('x'))` returns `'x'`
- [ ] `agnost.track(Promise.reject(new Error('fail')))` throws but batcher still records error span
- [ ] `setAgnostContext({ userId: 'u' })` + `getAgnostContext()` returns `{ userId: 'u' }`
- [ ] `SpanBatcher` flushes after 100 spans or 5s
- [ ] `SpanBatcher` drops oldest when buffer exceeds 1000
- [ ] `instrumentVercelAI()` proxies `ai.generateText` and injects `experimental_telemetry`
- [ ] `instrumentOpenAI()` sets up OpenInstrumentation and patches `chat.completions.create`
- [ ] `createMastraExporter()` returns valid OtelExporter config
- [ ] All tests pass with `vitest`
- [ ] Build produces 4 entry points (index, vercel, openai, mastra) in both ESM and CJS

---

## 7. Out of Scope (DO NOT BUILD)

- ❌ Python SDK
- ❌ Custom backend / database (use existing otel.agnost.ai)
- ❌ PII redaction engine (just `disableInput`/`disableOutput` flags)
- ❌ VS Code extension / CLI tool
- ❌ Redis-backed persistent queue
- ❌ LangChain / LlamaIndex / CrewAI adapters
- ❌ Real-time streaming dashboard
- ❌ Cost attribution API

---

## 8. Context for Agent

This is a **take-home assignment for a startup job** (Agnost AI — first engineering hire). The bar is reasoning, taste, and judgment. The submission must include:

1. **REASONING.md** — already written separately, explains DB choices, algorithm choices, SDK choices, rejected alternatives
2. **Working repo** — this PRD describes what to build
3. **Future vision** — what with a month instead of a weekend

The core thesis: **"The best integration is the one the developer doesn't know exists until they see the dashboard."**

Build fast. Keep it simple. Tests pass = shipped.
