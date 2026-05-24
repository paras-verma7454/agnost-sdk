# @agnost/agent-mode SDK Skill

Copy-paste OpenTelemetry instrumentation for AI agents. Works with **OpenAI SDK**, **Vercel AI SDK**, and **Mastra**.

**When to use this skill:** Any task involving `@agnost/agent-mode` — instrumenting AI SDKs, setting up telemetry, tracking agent spans, writing integration tests, or extending the SDK.

---

## Architecture

```
┌──────────────────────────────────────────────┐
│                  agnost.ts                     │
│  setupAgnost({ orgId, integrations })         │
└──────────────────┬───────────────────────────┘
                   ↓
┌──────────────────────────────────────────────┐
│         Agent Call Pipeline                    │
│  agnost.track( sdk.call(...) )                 │
│         │                                      │
│         ├── AsyncLocalStorage  →  setUser      │
│         │                       setSession     │
│         │                       (→ OTel ctx)   │
│         │                                      │
│         └── OpenInference / native telemetry   │
│             →  OTel Span                       │
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

## Core API

Full API reference in [README.md](./README.md#usage).

Key exports:

| Export | Description |
|---|---|
| `setupAgnost(config)` | Create agent, init telemetry, instrument integrations |
| `withAgnost(config)` / `createAgnost(config)` | Create agent without automatic instrumentation |
| `setAgnostContext(identity)` | Set user identity for current async chain |
| `agent.track(promise, options?)` | Wrap a call in an OTel span with identity |
| `agent.instrumentOpenAI()` | Configure OpenInference for OpenAI SDK |
| `agent.instrumentVercelAI()` | Configure OTel exporter for Vercel AI SDK |
| `agent.shutdown()` | Flush and shut down OTel SDK |
| `createMastraExporter(config)` | Create OtelExporter for Mastra |

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

Uses **vitest**. Tests in `packages/agent-mode/test/index.test.ts`.

```bash
npm run test               # from root
cd packages/agent-mode && npx vitest run   # direct
```

---

## Common Pitfalls

1. **`orgId` is required** — Calling `setupAgnost({})` or `withAgnost({})` throws `[Agnost] orgId is required`.
2. **Always call `shutdown()`** — Buffered spans are lost if the process exits without flushing. Call before `process.exit()`.
3. **Optional peer deps** — `openai`, `ai`, and `@mastra/otel-exporter` are all optional. Missing ones log a warning and skip instrumentation.
4. **Subpath imports require the full package** — `@agnost/agent-mode/mastra` works only when `@agnost/agent-mode` is installed (it's not a separate package).
5. **Span name prefixing** — Names are auto-prefixed with `tool.` unless they already start with `tool.`.
6. **OpenAI instrumentation uses OpenInference** — `instrumentOpenAI()` configures `@arizeai/openinference-instrumentation-openai`, not a custom patch. Identity injection requires wrapping calls with `agent.track()`.
