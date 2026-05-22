# @agnost/agent-mode SDK Skill

Zero-config OpenTelemetry instrumentation for AI agents. Works with **OpenAI SDK**, **Vercel AI SDK**, and **Mastra**.

**When to use this skill:** Any task involving `@agnost/agent-mode` — instrumenting AI SDKs, setting up telemetry, tracking agent spans, writing integration tests, or extending the SDK.

---

## Architecture

```
DEV APP
  ├── Vercel AI SDK ──→ @agnost/agent-mode ────→ otel.agnost.ai
  ├── OpenAI SDK ─────→ (OTLP spans + identity) ─→ Agnost Dashboard
  └── Mastra SDK ─────→ (auto context)
                         │
                    ┌────┴────┐
                    │ In-mem  │ ← SpanBatcher (max 1000, flush @ 100 | 5s)
                    └─────────┘
```

- No database. No backend. In-memory buffer flushed via OTLP to `otel.agnost.ai`.
- Built on OpenTelemetry — works with any OTel-aware backend.
- Identity propagates via `AsyncLocalStorage` — no manual threading.

---

## Installation

```bash
npm install @agnost/agent-mode
```

Peer dependencies (all optional — only install what you use):
- `openai` ^4.95.0
- `ai` ^4.0.0 || ^5.0.0 || ^6.0.0
- `@mastra/otel-exporter`

---

## Core API — Full Reference

### `AgnostConfig`

| Field      | Type     | Required | Default                  |
|------------|----------|----------|--------------------------|
| `orgId`    | `string` | yes      | —                        |
| `endpoint` | `string` | no       | `https://otel.agnost.ai` |

### `UserIdentity`

```ts
interface UserIdentity {
  userId: string;
  email?: string;
  name?: string;
  sessionId?: string;
  organization?: string;
  plan?: string;
  [key: string]: any;       // Custom metadata
}
```

### `TrackOptions`

```ts
interface TrackOptions {
  userId?: string;
  sessionId?: string;
  conversationId?: string;
  metadata?: Record<string, any>;
  toolName?: string;        // Auto-prefixed with "tool."
  input?: string | Record<string, any>;
}
```

### `SpanData`

```ts
interface SpanData {
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

### `withAgnost(config)` → `AgnostAgent`

Creates an `AgnostAgent` instance. Validates config (throws if `orgId` missing), sets up OTel provider, creates `SpanBatcher`.

```ts
import { withAgnost } from '@agnost/agent-mode';

const agnost = withAgnost({ orgId: process.env.AGNOST_ORG_ID! });
// or with custom endpoint:
const agnost = withAgnost({ orgId: '...', endpoint: 'https://my-otel-backend.com' });
```

### `setAgnostContext(identity)` / `getAgnostContext()`

Sets/gets user identity in `AsyncLocalStorage`. All spans within the same async chain inherit these attributes.

```ts
import { setAgnostContext, getAgnostContext } from '@agnost/agent-mode';

setAgnostContext({ userId: 'user-42', sessionId: 'demo-session', email: 'user@example.com' });
const ctx = getAgnostContext(); // { userId: 'user-42', ... }
```

### `AgnostAgent` Methods

#### `agent.track<T>(input, options?)` → `Promise<T>`

Wraps a Promise or function in an OTel span. Auto-injects identity from context. Records output on success, error on failure. Span name defaults to `tool.agent_interaction` (or `tool.<toolName>`).

```ts
// Promise form
const result = await agnost.track(
  someAsyncOperation(),
  { toolName: 'search_web', userId: 'user-1' }
);

// Function form (lazy evaluation)
const result = await agnost.track(
  () => someAsyncOperation(),
  { toolName: 'search_web' }
);

// With identity from context (setAgnostContext already called)
const result = await agnost.track(
  generateText({ model: openai('gpt-4o'), prompt: 'Hello' })
);
```

#### `agent.begin(name, options?)` → `AgnostSpanBuilder`

Creates a span and returns a builder for manual lifecycle. Span name is auto-prefixed with `tool.`.

```ts
const span = agnost.begin('process_message', { userId: 'user-1' });
span.setAttribute('input_length', msg.length);
// ... do work ...
span.end(output);
// or on error:
span.fail(new Error('processing failed'));
```

#### `AgnostSpanBuilder` Methods

| Method                              | Description                           |
|-------------------------------------|---------------------------------------|
| `setAttribute(key, value)`          | Set a single span attribute           |
| `setAttributes(attrs)`              | Set multiple attributes               |
| `end(output?)`                      | End span with optional output         |
| `fail(error: Error)`                | End span with error status            |

#### `agent.instrumentOpenAI()` → `Promise<void>`

Sets up OpenInference OpenAI instrumentation and patches `OpenAI.prototype.chat.completions.create` at the class level. Every client instance inherits the instrumentation.

```ts
await agnost.instrumentOpenAI();
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
setAgnostContext({ userId: 'user-42', sessionId: 'demo-session' });
const completion = await client.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello' }],
});
```

Uses `@arizeai/openinference-instrumentation-openai` under the hood. Also available as standalone function via `@agnost/agent-mode/openai` subpath:

```ts
import { instrumentOpenAI } from '@agnost/agent-mode/openai';
```

#### `agent.instrumentVercelAI()` → `Promise<void>`

Sets up OTel exporter for Vercel AI SDK. In CJS, auto-patches `generateText`, `streamText`, `generateObject`, `streamObject` to inject `experimental_telemetry` with identity metadata. In ESM (tsx), auto-patching is not supported — use `agent.track()` wrapper instead.

```ts
await agnost.instrumentVercelAI();
setAgnostContext({ userId: 'user-42', sessionId: 'demo-session' });

// CJS: auto-patches, identity is injected automatically
const { text } = await generateText({ model: openai('gpt-4o'), prompt: 'Hello' });

// ESM: must wrap with track() for identity injection
const { text } = await agnost.track(
  generateText({ model: openai('gpt-4o'), prompt: 'Hello' })
);
```

Also available via `@agnost/agent-mode/vercel` subpath.

#### `agent.flush()` → `Promise<void>`

Forces flush of buffered spans to the OTLP endpoint.

#### `agent.shutdown()` → `Promise<void>`

Flushes buffered spans and shuts down the OTel SDK. **Always call before process exit.**

```ts
await agnost.shutdown();
```

### `createMastraExporter(config)` (from `@agnost/agent-mode/mastra`)

Creates an OTel exporter for use with Mastra's `Observability`.

```ts
import { Mastra } from '@mastra/core';
import { Observability } from '@mastra/observability';
import { createMastraExporter } from '@agnost/agent-mode/mastra';

const agnostExporter = await createMastraExporter({
  orgId: process.env.AGNOST_ORG_ID!,
});

const mastra = new Mastra({
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'my-mastra-app',
        exporters: [agnostExporter],
      },
    },
  }),
});
```

### `wrapOpenAIClient(client)` (from `@agnost/agent-mode/openai`)

Per-instance OpenAI client wrapping. Useful when you can't or don't want class-level patching.

```ts
import { wrapOpenAIClient } from '@agnost/agent-mode/openai';
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
wrapOpenAIClient(client);
```

---

## Identity Resolution (7-level Cascade)

When a span is created, identity is resolved in this priority order:

1. **Explicit `TrackOptions`** — `userId`, `sessionId`, `conversationId` passed directly to `track()`, `begin()`, etc.
2. **`AsyncLocalStorage` context** — Set via `setAgnostContext()` within the same async chain
3. **HTTP headers** — `x-user-id` header from incoming request
4. **Cookies** — `agnost_user_id` cookie
5. **JWT** — Decoded from `Authorization: Bearer <token>` header (extracts `sub` and `email`)
6. **Express session** — `req.session.userId`
7. **Anonymous fallback** — `userId: 'anonymous'`

The identity resolution logic is in `packages/agent-mode/src/core/identity.ts`.

---

## Span Batching

| Property           | Value                        |
|--------------------|------------------------------|
| Max buffer size    | 1000 spans (drops oldest)    |
| Batch flush size   | 100 spans                    |
| Flush interval     | 5 seconds                    |
| Exit handlers      | SIGTERM, SIGINT, beforeExit  |

The `SpanBatcher` class (`packages/agent-mode/src/core/batcher.ts`) handles all buffering logic. Call `agent.shutdown()` for a guaranteed final flush.

---

## Subpath Exports

| Import path                          | Exports                                    |
|--------------------------------------|--------------------------------------------|
| `@agnost/agent-mode`                 | `withAgnost`, `AgnostAgent`, `AgnostSpanBuilder`, `setAgnostContext`, `getAgnostContext`, `instrumentVercelAI`, `instrumentOpenAI`, `createMastraExporter` |
| `@agnost/agent-mode/openai`          | `instrumentOpenAI`, `wrapOpenAIClient`      |
| `@agnost/agent-mode/vercel`          | `instrumentVercelAI`                        |
| `@agnost/agent-mode/mastra`          | `createMastraExporter`                      |

---

## Testing

The SDK uses `vitest`. Tests are in `packages/agent-mode/test/index.test.ts`.

### Patterns

```ts
import { describe, it, expect, vi } from 'vitest';
import { withAgnost, setAgnostContext, getAgnostContext } from '@agnost/agent-mode';
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
    const result = await agent.track(Promise.resolve('hello'), { userId: 'user-1' });
    expect(result).toBe('hello');
  });

  it('should track failed promise', async () => {
    const agent = withAgnost({ orgId: 'test-org' });
    await expect(
      agent.track(Promise.reject(new Error('fail')), { userId: 'user-1' })
    ).rejects.toThrow('fail');
  });

  it('should track function form', async () => {
    const agent = withAgnost({ orgId: 'test-org' });
    const fn = vi.fn().mockResolvedValue('from-fn');
    const result = await agent.track(fn, { userId: 'user-1' });
    expect(result).toBe('from-fn');
    expect(fn).toHaveBeenCalledTimes(1);
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
  it('should batch and flush spans', async () => {
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
```

Run tests:

```bash
npm run test
# or directly:
cd packages/agent-mode && npx vitest run
```

---

## Common Pitfalls

1. **`orgId` is required** — Calling `withAgnost({})` throws `[Agnost] orgId is required`.
2. **Vercel AI auto-patching is CJS-only** — In ESM (e.g. with tsx), use `agent.track()` to wrap calls for identity injection.
3. **Always call `shutdown()`** — Buffered spans are lost if the process exits without flushing. Call before `process.exit()`.
4. **Optional peer deps** — `openai`, `ai`, and `@mastra/otel-exporter` are all optional. Missing ones log a warning and skip instrumentation.
5. **Subpath imports require the full package** — `@agnost/agent-mode/mastra` works only when `@agnost/agent-mode` is installed (it's not a separate package).
6. **Span name prefixing** — Names are auto-prefixed with `tool.` unless they already start with `tool.`.
7. **OpenAI instrumentation is class-level** — `instrumentOpenAI()` patches `OpenAI.prototype`, so all instances are affected. Use `wrapOpenAIClient(client)` for per-instance control.
