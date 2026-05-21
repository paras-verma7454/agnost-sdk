# @agnost/agent-mode

Zero-config OpenTelemetry instrumentation for AI agents. Works with **OpenAI SDK**, **Vercel AI SDK**, and **Mastra**.

> **Not published on npm yet.** Try it locally:

```bash
git clone https://github.com/paras-verma7454/agnost-sdk.git
cd agnost
npm install
npm run build

# Run an example:
cd examples/openai-app
# Edit .env with your API keys (AGNOST_ORG_ID, OPENAI_API_KEY)
npm run dev
```

## Quick Start

```ts
import OpenAI from 'openai';
import { withAgnost, setAgnostContext } from '@agnost/agent-mode';

const agnost = withAgnost({ orgId: process.env.AGNOST_ORG_ID! });
await agnost.instrumentOpenAI();

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

setAgnostContext({ userId: 'user-42', sessionId: 'demo-session' });

const completion = await client.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello' }],
});

await agnost.shutdown();
```

## Why

Every AI agent call emits an OpenTelemetry span enriched with `userId`, `sessionId`, and custom metadata — shipped to `otel.agnost.ai` automatically. No custom HTTP protocols, no backend setup, no config.

## Usage

### OpenAI SDK

```ts
import OpenAI from 'openai';
import { withAgnost, setAgnostContext } from '@agnost/agent-mode';

const agnost = withAgnost({ orgId: process.env.AGNOST_ORG_ID! });
await agnost.instrumentOpenAI();

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

setAgnostContext({ userId: 'user-42', sessionId: 'demo-session' });

const completion = await client.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello' }],
});

await agnost.shutdown();
```

`instrumentOpenAI()` patches `OpenAI.prototype.chat.completions.create` at the class level — every client instance automatically injects user context from `setAgnostContext()`.

### Vercel AI SDK

```ts
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { withAgnost, setAgnostContext } from '@agnost/agent-mode';

const agnost = withAgnost({ orgId: process.env.AGNOST_ORG_ID! });
await agnost.instrumentVercelAI();

setAgnostContext({ userId: 'user-42', sessionId: 'demo-session' });

const { text } = await agnost.track(
  generateText({
    model: openai('gpt-4o-mini'),
    prompt: 'Hello',
  }),
);

await agnost.shutdown();
```

Use `agnost.track()` to wrap calls — it auto-injects identity from `setAgnostContext()` into the span.

### Mastra

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

## API

### `withAgnost(config)`

Creates an `AgnostAgent` instance.

```ts
interface AgnostConfig {
  orgId: string;          // Required. Get yours at https://app.agnost.ai
  endpoint?: string;      // Optional. Defaults to https://otel.agnost.ai
}
```

### `setAgnostContext(identity)`

Sets user identity for the current async context. All spans created within the same async chain inherit these attributes.

```ts
interface UserIdentity {
  userId: string;
  email?: string;
  name?: string;
  sessionId?: string;
  [key: string]: any;
}
```

### `agent.instrumentOpenAI()`

Patches the OpenAI SDK to auto-inject user context and generate OTel spans.

### `agent.instrumentVercelAI()`

Configures the OTel exporter for Vercel AI SDK. In CJS, auto-patches `generateText`/`streamText` to inject `experimental_telemetry`. In ESM, use `agent.track()` for identity injection.

### `agent.track(promise, options?)`

Wraps a Promise or function in an OTel span with identity attributes.

```ts
const result = await agent.track(
  someAsyncOperation(),
  { toolName: 'search_web' }
);
```

### `agent.shutdown()`

Flushes buffered spans and shuts down the OTel SDK. Call before process exit.

### `createMastraExporter(config)`

Returns an OTel exporter pre-configured with org credentials for use with Mastra's `Observability`.

## Examples

- [`examples/openai-app/`](examples/openai-app/) — OpenAI + Groq
- [`examples/vercel-ai-app/`](examples/vercel-ai-app/) — Vercel AI SDK
- [`examples/mastra-app/`](examples/mastra-app/) — Mastra

## How it Works

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

- No database. No backend. In-memory buffer flushed via OTLP.
- Built on OpenTelemetry — works with any OTel-aware observability backend.
- Identity propagates via `AsyncLocalStorage` — no manual threading.
