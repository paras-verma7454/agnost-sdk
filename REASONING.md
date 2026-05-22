# REASONING.md — Architecture & Design Decisions

**Track B:** Integration mode for OpenAI SDK, Vercel AI SDK, and Mastra.

> *"The best integration is the one the developer doesn't know exists until they see the dashboard."*

## Data Flow

```
agnost.ts setup → setupAgnost({ integrations }) → Agent Call (wrapped in agnost.track())
  → Identity Injection (AsyncLocalStorage → OpenInference setUser/setSession → OTel context)
  → OTel BatchSpanProcessor → OTLP Export → otel.agnost.ai → Agnost Dashboard
```

**No database, no collector, no custom transport.** Stateless client-side SDK. Persistence lives entirely in Agnost's infrastructure.

## SDK Choices

| Decision | Choice | Why |
|---|---|---|
| **Language** | TypeScript | Target audience ships agents in Node.js/Next.js/Edge. Safety for config and identity APIs. |
| **Transport** | OpenTelemetry (OTLP) | Zero custom protocols. Works with any OTel backend (Jaeger, Zipkin, Grafana). Developers can inspect spans locally without Agnost. |
| **Identity propagation** | AsyncLocalStorage → OpenInference `setUser`/`setSession` | Bridges into OTel's native `context.with()` so identity composes with any OTel-aware middleware. |
| **Span naming** | `tool.<name>` prefix | Matches OpenInference semantic convention for tool calls. |

## Framework Adapters

| SDK | Approach |
|---|---|
| **OpenAI** | `@arizeai/openinference-instrumentation-openai` (`OpenAIInstrumentation`). Identity via `agent.track()` → OTel context → OpenInference picks it up. No prototype patching. |
| **Vercel AI** | Vercel SDK emits `ai.*` spans natively when `experimental_telemetry.isEnabled` is set. Agnost wires the OTel exporter + provides `agent.track()` for identity. No monkey-patching. |
| **Mastra** | `createMastraExporter()` factory — thin wrapper over Mastra's native `OtelExporter`. |

## Rejected Alternatives

| Alternative | Why Rejected |
|---|---|
| Custom HTTP analytics protocol | Duplicates OTel. Agnost already speaks OTLP. |
| Global monkey-patching | Too invasive. Per-framework adapters are predictable and maintainable. |
| Backend proxy agent | Adds latency, complexity, deployment dependency. |
| Separate packages per framework | Monorepo with subpath exports (`@agnost/agent-mode/openai`) is simpler. |
| Python first | Assignment targets TypeScript/Node.js ecosystem. |
| Custom span buffer (SpanBatcher) | Redundant — OTel SDK's `BatchSpanProcessor` already handles buffering. Dual buffer added complexity with no export benefit. |
| CJS `require('ai')` monkey-patch | CJS-only. Breaks in ESM (tsx, Next.js). Fragile against pre-1.0 API changes. |

## What I'd Do With A Month Instead Of A Weekend

| Area | What |
|---|---|
| **SDK version matrix CI** | Test every adapter against real SDK versions in CI |
| **PII redaction** | `disableInput`/`disableOutput` flags + regex field stripping |
| **Retry queue** | Optional persistent retry buffer for failed exports |
| **Identity auto-detection** | Cookie/session/JWT extractors for Next.js, Express, Fastify |
| **More adapters** | LangChain, LlamaIndex, CrewAI, Genkit, Haystack |
| **Cost attribution** | Token usage → estimated cost per span, per user, per model |
| **E2E dashboard test** | Automated test verifying Agnost dashboard shows expected signals |
| **Streaming spans** | First-chunk latency, finish reason, token-timed spans for streaming |
| **OTLP compression** | gzip for large batches |
| **Browser SDK** | Web OTel exporter for browser-based AI agents |
| **OpenAPI / docs** | Generated API reference + interactive playground |
