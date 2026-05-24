# @agnost/agent-mode

Copy-paste OpenTelemetry instrumentation for AI agents. Works with **OpenAI SDK**, **Vercel AI SDK**, and **Mastra**.

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

Create an `agnost.ts` file once, like you would create `prisma.ts`, `db.ts`, or a Tailwind config. Then import it anywhere you call AI models.

```ts
// agnost.ts
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

```ts
import OpenAI from 'openai';
import { agnost, setAgnostContext } from './agnost';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

setAgnostContext({ userId: 'user-42', sessionId: 'demo-session' });

const completion = await agnost.track(
  client.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: 'Hello' }],
  }),
  { toolName: 'chat_completion' },
);

await agnost.shutdown();
```

## Chosen Approach

This SDK integrates AI agent observability through a three-layer architecture designed to minimize cognitive overhead while remaining compatible with the broader OpenTelemetry ecosystem.

**Layer 1 — OTel Exporter Bootstrap.** A single `NodeSDK` instance is configured with an `OTLPTraceExporter` pointed at `otel.agnost.ai` and authenticated via `X-Agnost-Org-ID`. This layer runs once at startup and serves all subsequent agent calls. The standard OTel `BatchSpanProcessor` handles buffering and export — no custom transport, no collector, no database.

**Layer 2 — Framework Adapters.** Each supported AI SDK gets a dedicated adapter that wires into the SDK's existing instrumentation story:

- **OpenAI SDK:** Uses `@arizeai/openinference-instrumentation-openai` — the OpenInference project's official `OpenAIInstrumentation` — which wraps `OpenAI.prototype.chat.completions.create` to emit OpenTelemetry spans. This matches Agnost's documented integration pattern exactly and is maintained by the Arize AI team, not by us.

- **Vercel AI SDK:** The Vercel AI SDK emits `ai.*` spans natively when `experimental_telemetry.isEnabled` is set. Agnost's role is to wire the OTel exporter and provide a thin `agent.track()` wrapper that pushes identity attributes (userId, sessionId) into the OTel context alongside the Vercel SDK's existing traces.

- **Mastra:** Mastra ships an `OtelExporter` class. Agnost's `createMastraExporter()` is a thin factory that configures this exporter with org credentials — no wrapping, no patching.

**Layer 3 — Identity Propagation.** Identity (userId, sessionId) is stored via `AsyncLocalStorage` and bridged into OTel context at call boundaries using OpenInference's `setUser`/`setSession` from `@arizeai/openinference-core`. This means identity propagates through OTel's native `context.with()` and composes with any other OTel-instrumented middleware.

## Minimizing Friction

Every design decision in this SDK is aimed at reducing the distance between "I want to instrument my agent" and "I see traces in the dashboard."

**Single-file setup.** The integration is one file (`agnost.ts`) pasted from documentation. No config file, no environment bootstrap script, no collector deployment. Install one npm package, create one file, import two symbols.

**Pay-as-you-go dependencies.** Each SDK adapter (`openai`, `ai`, `@mastra/otel-exporter`) is an optional peer dependency. If you use only OpenAI, you install only OpenAI's packages. There is no forced dependency chain.

**No backend, no collector, no database.** The SDK exposes a stateless OTLP exporter that ships spans directly to `otel.agnost.ai` over HTTPS. There is nothing to self-host, no persistence layer, no queue to manage.

**Explicit wrapper over magic.** The primary API for identity injection is `agent.track()`, which is a deliberate choice over SDK prototype patching or monkey-patching. This makes the instrumentation boundary visible in code, debuggable, and resistant to SDK version changes. The `instrumentOpenAI()` adapter uses OpenInference's well-maintained instrumentation under the hood — we don't maintain our own patches.

**Identity auto-attachment.** `setAgnostContext()` called once at the top of a request handler attaches to every `agent.track()` call in the same async chain. No threading identity through function arguments or middleware wrapping.

**Graceful failure.** Missing peer dependencies emit a warning and skip that adapter. OTLP export errors are caught and logged without affecting the application. The SDK never blocks inference.

## Vision for the Future of Agent Onboarding and Distribution

Agent observability today requires developers to understand their framework's telemetry API, wire an exporter, configure identity propagation, and handle batching — repeated for every project. This is the same gap that application monitoring tools filled fifteen years ago, and the solution follows a similar arc.

**Today (single-file setup).** Developers install `@agnost/agent-mode`, paste a setup file, and wrap agent calls with `agent.track()`. This is explicit, debuggable, and works with any deployment target. The friction is low but not zero.

**Near-term (auto-detection).** The next step is environment-aware bootstrap — `npx @agnost/agent-mode detect` scans `package.json`, detects installed SDKs (OpenAI, Vercel AI, Mastra), and configures the right exporters without manual setup. This moves onboarding from "paste a file" to "run one command."

**Medium-term (platform integration).** As agent frameworks standardize around OpenTelemetry semantics (OpenInference Semantic Conventions), the role of an instrumentation SDK shifts from patching SDK internals to providing a collector endpoint. Platform-level onboarding — a toggle in Vercel dashboard, a webhook in OpenAI project settings — eliminates the SDK install entirely.

**End state (native telemetry).** Agent frameworks emit standard OTel spans natively with identity, model metadata, token counts, and tool calls. Agnost becomes a plug-and-play observability layer — no SDK, no wrapper, no config. Developers ship their agents, and traces arrive at the dashboard automatically. The integration is the one the developer doesn't know exists until they see the data.

## Usage

All three integrations share the same pattern — import `{ agnost, setAgnostContext }` from your
`agnost.ts` setup file (see Quick Start above), then wrap calls with `agent.track()`.

### OpenAI SDK

```ts
import OpenAI from 'openai';
import { agnost, setAgnostContext } from './agnost';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

setAgnostContext({ userId: 'user-42', sessionId: 'demo-session' });

const completion = await agnost.track(
  client.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: 'Hello' }],
  }),
  { toolName: 'chat_completion' },
);

await agnost.shutdown();
```

`setupAgnost({ integrations: { openai: true } })` configures OpenInference's `OpenAIInstrumentation` which generates OTel spans from every `chat.completions.create` call. `agent.track()` injects identity into OTel context; the instrumentation picks it up automatically.

### Vercel AI SDK

```ts
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { agnost, setAgnostContext } from './agnost';

setAgnostContext({ userId: 'user-42', sessionId: 'demo-session' });

const { text } = await agnost.track(
  generateText({
    model: openai('gpt-4o-mini'),
    prompt: 'Hello',
    experimental_telemetry: { isEnabled: true },
  }),
  { toolName: 'vercel_generate' },
);

await agnost.shutdown();
```

The Vercel AI SDK emits `ai.*` spans natively when `experimental_telemetry.isEnabled` is set. `agent.track()` pushes identity into the OTel context alongside those spans. No monkey-patching.

### Mastra

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

Use `createMastraExporter()` from the `@agnost/agent-mode/mastra` subpath export. Pass `userId` / `conversationId` via Mastra's `tracingOptions.metadata` when calling agents.

<details>
<summary>Full API Reference</summary>

### `setupAgnost(config)`

Creates an `AgnostAgent`, initializes telemetry, and optionally instruments integrations. This is the recommended API for copy-paste `agnost.ts` setup files.

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

```ts
interface AgnostSetupConfig {
  orgId: string;
  endpoint?: string;
  integrations?: {
    openai?: boolean;
    vercelAI?: boolean;
  };
}
```

`integrations.openai: true` sets up OpenInference `OpenAIInstrumentation`. `integrations.vercelAI: true` configures the OTel exporter for Vercel AI SDK calls.

### `withAgnost(config)` / `createAgnost(config)`

Creates an `AgnostAgent` instance without automatically instrumenting integrations.

```ts
interface AgnostConfig {
  orgId: string;          // Required. Get yours at https://app.agnost.ai
  endpoint?: string;      // Optional. Defaults to https://otel.agnost.ai
}
```

### `setAgnostContext(identity)`

Sets user identity for the current async context. All `agent.track()` calls within the same async chain inherit these attributes.

```ts
interface UserIdentity {
  userId: string;
  email?: string;
  name?: string;
  sessionId?: string;
  [key: string]: any;
}
```

### `agent.track(promise, options?)`

Wraps a Promise or function in an OTel span with identity attributes. Identity is read from `setAgnostContext()` automatically and injected into OTel context via OpenInference's `setUser`/`setSession`.

```ts
const result = await agnost.track(
  someAsyncOperation(),
  { toolName: 'search_web' }
);

// Function form (lazy evaluation):
const result = await agnost.track(
  () => someAsyncOperation(),
  { toolName: 'search_web' },
);
```

```ts
interface TrackOptions {
  userId?: string;
  sessionId?: string;
  conversationId?: string;
  metadata?: Record<string, any>;
  toolName?: string;
  input?: string | Record<string, any>;
}
```

### `agent.instrumentOpenAI()`

Configures the OpenInference `OpenAIInstrumentation` to automatically generate OTel spans from OpenAI SDK calls. Identity injection is handled by `agent.track()`.

### `agent.instrumentVercelAI()`

Configures the OTel exporter for Vercel AI SDK. Use `agent.track()` to wrap `generateText`/`streamText` calls for identity injection.

### `agent.shutdown()`

Flushes buffered spans and shuts down the OTel SDK. Call before process exit.

### `createMastraExporter(config)`

Returns an OTel exporter pre-configured with org credentials for use with Mastra's `Observability`.

```ts
import { createMastraExporter } from '@agnost/agent-mode/mastra';

const exporter = await createMastraExporter({
  orgId: process.env.AGNOST_ORG_ID!,
});
```

</details>

## Examples

- [`examples/openai-app/`](examples/openai-app/) — OpenAI + Express
- [`examples/vercel-ai-app/`](examples/vercel-ai-app/) — Vercel AI SDK
- [`examples/mastra-app/`](examples/mastra-app/) — Mastra

## How it Works

```
┌──────────────────────────────────────────────┐
│                  agnost.ts                     │
│  setupAgnost({ orgId, integrations })         │
└──────────────────┬───────────────────────────┘
                   ↓
┌──────────────────────────────────────────────┐
│         Agent Call Pipeline                    │
│                                                │
│  agnost.track( client.chat.completions... )    │
│         │                                      │
│         ├── AsyncLocalStorage  →  setUser      │
│         │                       setSession     │
│         │                       (→ OTel ctx)   │
│         │                                      │
│         └── OpenInference / native Vercel      │
│             telemetry  →  OTel Span            │
│                                                │
└──────────────────┬───────────────────────────┘
                   ↓
┌──────────────────────────────────────────────┐
│     OTel BatchSpanProcessor (flush @ 5s)       │
└──────────────────┬───────────────────────────┘
                   ↓
┌──────────────────────────────────────────────┐
│       OTLP Export  →  otel.agnost.ai           │
│                  (Agnost Dashboard)             │
└──────────────────────────────────────────────┘
```

- No database. No collector. No custom transport.
- Built on OpenTelemetry — works with any OTel-aware backend.
- Identity flows: `AsyncLocalStorage` → OpenInference → OTel context.
