# @agnost/agent-mode SDK Skill

Copy-paste OpenTelemetry instrumentation for AI agents. Works with **OpenAI SDK**, **Vercel AI SDK**, and **Mastra**.

**When to use this skill:** Any task involving `@agnost/agent-mode` — instrumenting AI SDKs, setting up telemetry, tracking agent spans, writing integration tests, or extending the SDK.

---

## Architecture

```
DEV APP
  ├── Vercel AI SDK ──→ agnost.track() ──→ OTel context ──→ otel.agnost.ai
  ├── OpenAI SDK ─────→ OpenInference ───→ (identity via   ─→ Agnost Dashboard
  └── Mastra SDK ─────→ OtelExporter        setUser/setSession)
                          │
                     ┌────┴────┐
                     │ Batch   │ ← OTel BatchSpanProcessor
                     │ Span    │    (max 1000, flush @ 5s)
                     │ Proc    │
                     └─────────┘
```

- No database. No backend. In-memory buffer flushed via OTLP to `otel.agnost.ai`.
- Built on OpenTelemetry — works with any OTel-aware backend.
- Identity propagates via `AsyncLocalStorage` → OpenInference `setUser`/`setSession` → OTel context.

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

### Recommended setup file

Users should create one `agnost.ts` file, then import it anywhere they call AI models.

```ts
import 'dotenv/config';
import { setupAgnost, setAgnostContext } from '@agnost/agent-mode';

export const agnost = await setupAgnost({
  orgId: process.env.AGNOST_ORG_ID!,
  integrations: {
    openai: true,
  },
});

export { setAgnostContext };
```

### `AgnostConfig`

| Field      | Type     | Required | Default                  |
|------------|----------|----------|--------------------------|
| `orgId`    | `string` | yes      | —                        |
| `endpoint` | `string` | no       | `https://otel.agnost.ai` |

### `AgnostSetupConfig`

```ts
interface AgnostSetupConfig extends AgnostConfig {
  integrations?: {
    openai?: boolean;
    vercelAI?: boolean;
  };
}
```

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

### `setupAgnost(config)` → `Promise<AgnostAgent>`

Creates an `AgnostAgent`, initializes telemetry, and optionally instruments integrations. This is the primary API for website copy-paste snippets.

```ts
import 'dotenv/config';
import { setupAgnost } from '@agnost/agent-mode';

const agnost = await setupAgnost({
  orgId: process.env.AGNOST_ORG_ID!,
  integrations: {
    openai: true,
    vercelAI: true,
  },
});
```

### `withAgnost(config)` / `createAgnost(config)` → `AgnostAgent`

Creates an `AgnostAgent` instance without automatically instrumenting integrations.

```ts
import 'dotenv/config';
import { withAgnost } from '@agnost/agent-mode';

const agnost = withAgnost({ orgId: process.env.AGNOST_ORG_ID! });
```

### `setAgnostContext(identity)`

Sets user identity in `AsyncLocalStorage`. All `agent.track()` calls within the same async chain inherit these attributes.

```ts
import { setAgnostContext } from '@agnost/agent-mode';

setAgnostContext({ userId: 'user-42', sessionId: 'demo-session', email: 'user@example.com' });
```

### `AgnostAgent` Methods

#### `agent.track<T>(input, options?)` → `Promise<T>`

Wraps a Promise or function in an OTel span. Identity is auto-injected from `setAgnostContext()` into OTel context via OpenInference. Span name defaults to `tool.agent_interaction` (or `tool.<toolName>`).

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
  generateText({ model: openai('gpt-4o'), prompt: 'Hello', experimental_telemetry: { isEnabled: true } })
);
```

#### `agent.instrumentOpenAI()` → `Promise<void>`

Configures OpenInference `OpenAIInstrumentation` to generate OTel spans from all OpenAI SDK calls. Identity is injected via `agent.track()`.

```ts
import 'dotenv/config';

await agnost.instrumentOpenAI();
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
setAgnostContext({ userId: 'user-42', sessionId: 'demo-session' });
const completion = await agnost.track(
  client.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: 'Hello' }],
  }),
  { toolName: 'chat_completion' },
);
```

Uses `@arizeai/openinference-instrumentation-openai` under the hood. Also available as standalone function via `@agnost/agent-mode/openai` subpath:

```ts
import { instrumentOpenAI } from '@agnost/agent-mode/openai';
```

#### `agent.instrumentVercelAI()` → `Promise<void>`

Configures the OTel exporter for Vercel AI SDK calls. Use `agent.track()` to wrap calls for identity injection.

```ts
await agnost.instrumentVercelAI();
setAgnostContext({ userId: 'user-42', sessionId: 'demo-session' });

const { text } = await agnost.track(
  generateText({
    model: openai('gpt-4o'),
    prompt: 'Hello',
    experimental_telemetry: { isEnabled: true },
  }),
  { toolName: 'vercel_generate' },
);
```

Also available via `@agnost/agent-mode/vercel` subpath.

#### `agent.shutdown()` → `Promise<void>`

Flushes buffered spans and shuts down the OTel SDK. **Always call before process exit.**

```ts
await agnost.shutdown();
```

### `createMastraExporter(config)` (from `@agnost/agent-mode/mastra`)

Creates an OTel exporter for use with Mastra's `Observability`.

```ts
import 'dotenv/config';
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

---

## Identity Resolution

When `agent.track()` is called, identity is resolved in this priority order:

1. **Explicit `TrackOptions`** — `userId`, `sessionId` passed directly to `track()`
2. **`AsyncLocalStorage` context** — Set via `setAgnostContext()` within the same async chain

Resolved identity is injected into OTel context via `@arizeai/openinference-core`'s `setUser`/`setSession`, making it available to any OTel-aware instrumentation downstream.

---

## Subpath Exports

| Import path                          | Exports                                    |
|--------------------------------------|--------------------------------------------|
| `@agnost/agent-mode`                 | `setupAgnost`, `withAgnost`, `createAgnost`, `AgnostAgent`, `setAgnostContext`, `getAgnostContext`, `instrumentVercelAI`, `instrumentOpenAI`, `createMastraExporter` |
| `@agnost/agent-mode/openai`          | `instrumentOpenAI`                         |
| `@agnost/agent-mode/vercel`          | `instrumentVercelAI`                       |
| `@agnost/agent-mode/mastra`          | `createMastraExporter`                     |

---

## Testing

The SDK uses `vitest`. Tests are in `packages/agent-mode/test/index.test.ts`.

### Patterns

```ts
import { describe, it, expect, vi } from 'vitest';
import { setupAgnost, withAgnost, setAgnostContext, getAgnostContext } from '@agnost/agent-mode';

describe('AgnostAgent', () => {
  it('should create agent with orgId', () => {
    const agent = withAgnost({ orgId: 'test-org' });
    expect(agent).toBeDefined();
  });

  it('should setup agent with integrations config', async () => {
    const agent = await setupAgnost({ orgId: 'test-org', integrations: {} });
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
```

Run tests:

```bash
npm run test
# or directly:
cd packages/agent-mode && npx vitest run
```

---

## Common Pitfalls

1. **`orgId` is required** — Calling `setupAgnost({})` or `withAgnost({})` throws `[Agnost] orgId is required`.
2. **Always call `shutdown()`** — Buffered spans are lost if the process exits without flushing. Call before `process.exit()`.
3. **Optional peer deps** — `openai`, `ai`, and `@mastra/otel-exporter` are all optional. Missing ones log a warning and skip instrumentation.
4. **Subpath imports require the full package** — `@agnost/agent-mode/mastra` works only when `@agnost/agent-mode` is installed (it's not a separate package).
5. **Span name prefixing** — Names are auto-prefixed with `tool.` unless they already start with `tool.`.
6. **OpenAI instrumentation uses OpenInference** — `instrumentOpenAI()` configures `@arizeai/openinference-instrumentation-openai`, not a custom patch. Identity injection requires wrapping calls with `agent.track()`.
