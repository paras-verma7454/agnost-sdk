# REASONING.md — Architecture & Design Decisions

## Core Thesis

> **"The best integration is the one the developer doesn't know exists until they see the dashboard."**

`@agnost/agent-mode` is a zero-config TS SDK that instruments AI agents (Vercel AI SDK, OpenAI SDK, Mastra), enriches OpenTelemetry spans with user identity, and ships them to `otel.agnost.ai`. The goal: 3 function calls (`withAgnost`, `setAgnostContext`, `.track`) cover 90% of use cases without reading docs.

---

## Architecture (One Diagram)

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

**Pattern:** Client-side wrapper only. No backend, no DB, no persistent storage. The SDK configures an OTel exporter, instruments the AI SDK, batches spans in memory (`SpanBatcher`, max 1000, flush @ 100 | 5s), and flushes via OTLP. Clustering/analysis is backend-only — the SDK enriches spans with `userId`/`sessionId` and ships them; Agnost's dashboard does the grouping.

---

## SDK Choices

### TypeScript First
Target audience ships AI agents in Node.js/Next.js/Edge. TypeScript gives safety for config and identity APIs.

### OpenTelemetry as Transport
- Zero custom HTTP protocols to maintain
- Works with any OTel-aware backend (Jaeger, Zipkin, Grafana)
- Developers can inspect spans locally without Agnost

### AsyncLocalStorage for Identity
`setAgnostContext`/`getAgnostContext` propagates user identity across async chains without threading it through every call. Per-request identity auto-attaches to all spans in that request.

### Span Naming Convention
Manual spans → `tool.<name>` (default `tool.agent_interaction`). Identity attrs → `agnost.user_id`, `agnost.session_id`, `agnost.conversation_id`. Matching the Agnost OTel ingestion spec.

### Framework Adapters (Thin Wrappers)

| SDK | Approach |
|---|---|
| **Vercel AI** | Proxies `generateText`/`streamText`/etc. to inject `userId`/`sessionId` into `experimental_telemetry.metadata` |
| **OpenAI** | OpenInference `OpenAIInstrumentation` for span generation + prototype-patches `chat.completions.create` to inject identity via `setUser`/`setSession` |
| **Mastra** | `createMastraExporter()` factory — returns an OTel exporter pre-configured with org credentials |

### Config Validation
All entry points call `validateConfig()` first, guaranteeing a clean `[Agnost] orgId is required` error instead of cryptic OTLP failures.

### Rejected Alternatives

| Alternative | Why Rejected |
|---|---|
| Custom HTTP analytics protocol | Duplicates OTel; Agnost already speaks OTLP |
| Global monkey-patching | Too invasive; per-framework adapters are predictable |
| Backend proxy agent | Adds latency, complexity, deployment dependency |
| Separate packages per framework | Monorepo with subpath exports is simpler |
| Python first | PRD targets TypeScript/Node.js ecosystem |
| Per-client wrapping of OpenAI | Prototype-level patching covers all instances with no extra arg |

---

## What I'd Do With A Month Instead Of A Weekend

| Area | What |
|---|---|
| **SDK version matrix CI** | Test every adapter against real SDK versions in CI |
| **PII redaction** | `disableInput`/`disableOutput` flags + regex field stripping |
| **Retry queue** | Optional persistent retry buffer for failed exports (IndexedDB in browser, fs in Node) |
| **Identity auto-detection** | Cookie/session/JWT extractors for Next.js, Express, Fastify |
| **More adapters** | LangChain, LlamaIndex, CrewAI, Genkit, Haystack |
| **Cost attribution** | Token usage → estimated cost per span, per user, per model |
| **E2E dashboard test** | Automated test that Agnost dashboard shows expected signals |
| **Streaming spans** | First-chunk latency, finish reason, token-timed spans for streaming |
| **OTLP compression** | gzip for large batches |
| **Browser SDK** | Web OTel exporter for browser-based AI agents |
| **OpenAPI / docs** | Generated API reference + interactive playground |
