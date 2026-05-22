# REASONING.md — Architecture & Design Decisions

## Core Thesis

> **"The best integration is the one the developer doesn't know exists until they see the dashboard."**

`@agnost/agent-mode` is a copy-paste TS SDK that instruments AI agents (Vercel AI SDK, OpenAI SDK, Mastra), enriches OpenTelemetry spans with user identity, and ships them to `otel.agnost.ai`. The goal: users copy one `agnost.ts` setup file from the website, then import `{ agnost, setAgnostContext }` anywhere they call models.

---

## Data Flow

```
agnost.ts setup
   ↓
setupAgnost({ integrations })
   ↓
Agent Call (wrapped in agnost.track() or native Vercel/Mastra telemetry)
   ↓
Identity Injection (AsyncLocalStorage → OpenInference setUser/setSession → OTel context)
   ↓
OTel BatchSpanProcessor (max 1000, flush @ 5s)
   ↓
OTLP Export ──→ otel.agnost.ai ──→ Agnost Dashboard
```

**Pattern:** Client-side wrapper only. The SDK remains stateless and client-side. Persistence and analytics live entirely in Agnost infrastructure. The SDK configures an OTel exporter, instruments the AI SDK, and flushes via OTLP. Batching is handled by the standard OTel `BatchSpanProcessor` — no custom transport layer.

---

## SDK Choices

### TypeScript First
Target audience ships AI agents in Node.js/Next.js/Edge. TypeScript gives safety for config and identity APIs.

### OpenTelemetry as Transport
- Zero custom HTTP protocols to maintain
- Works with any OTel-aware backend (Jaeger, Zipkin, Grafana)
- Developers can inspect spans locally without Agnost

### AsyncLocalStorage for Identity
`setAgnostContext`/`getAgnostContext` propagates user identity across async chains without threading it through every call. At call boundaries, identity is bridged into OTel context via OpenInference's `setUser`/`setSession`, making it compose with any OTel-aware instrumentation.

### Span Naming Convention
Manual spans → `tool.<name>` (default `tool.agent_interaction`). Identity attrs are set by OpenInference as `user.id` and `session.id`, matching the OpenInference semantic convention standard.

### Framework Adapters (Thin Wrappers)

| SDK | Approach |
|---|---|
| **OpenAI** | `@arizeai/openinference-instrumentation-openai` `OpenAIInstrumentation` for automatic span generation. Identity is injected via `agent.track()` → OTel context → OpenInference picks it up. No prototype patching. |
| **Vercel AI** | Vercel AI SDK emits `ai.*` spans natively when `experimental_telemetry.isEnabled` is set. Agnost wires the OTel exporter and provides `agent.track()` for identity injection. |
| **Mastra** | `createMastraExporter()` factory — returns an OTel exporter pre-configured with org credentials. |

### Removed: SpanBatcher (Custom Buffering)

The original implementation included a custom `SpanBatcher` class that accumulated `SpanData` objects with separate buffering logic. This was removed for the following reasons:

1. **Redundant with OTel SDK.** The standard OTel `BatchSpanProcessor` already handles buffering (max queue size, scheduled delay, export batching). A second buffering layer added complexity without observable benefit.
2. **No actual export path.** The custom batcher's flush callback only logged to console (`console.log('[Agnost] Flushing ${n} spans')`). Real export was handled by the standard OTel pipeline.
3. **Dual SpanData type.** Maintaining a parallel `SpanData` type that mirrors OTel's span model added maintenance burden and type confusion.

The removal simplifies the SDK to a single export pipeline (OTel SDK → `BatchSpanProcessor` → `OTLPTraceExporter`), which matches the official Agnost integration pattern.

### Removed: OpenAI Prototype Patching

The original implementation patched `OpenAI.prototype.chat.completions.create` to inject identity from `AsyncLocalStorage` into OTel context. This was replaced with the `agent.track()` wrapper approach because:

1. **SDK version fragility.** Prototype patching depends on internal SDK structure and breaks between versions. The `openai` SDK's `^4.x` → `^5.x` → `^6.x` migration introduced signature changes that break prototype patches.
2. **Maintenance burden.** The patch must track changes to the protobuf/HTTP client implementation inside the SDK.
3. **Alternative exists.** OpenInference `OpenAIInstrumentation` handles span generation automatically; identity injection through `agent.track()` is a clean, explicit alternative that does not depend on internals.

### Removed: Vercel AI SDK Monkey-Patching

The original implementation patched `require('ai')` to inject `experimental_telemetry` into every `generateText`/`streamText` call. This was replaced with a log message pointing users to `agent.track()` because:

1. **CJS-only.** `require('ai')` fails in ESM environments (tsx, Next.js App Router). Users in those environments received a confusing fallback instruction.
2. **SDK instability.** The `experimental_telemetry` flag is unstable (pre-1.0 Vercel AI SDK). A monkey-patch that depends on this field risks silent breakage.
3. **Native support exists.** The Vercel AI SDK emits `ai.*` spans natively when the flag is set. Users only need the OTel exporter (which Agnost provides) and to set `isEnabled: true` on calls they want traced.

### Config Validation & Setup
`setupAgnost()` and `withAgnost()` call `validateConfig()` first, guaranteeing a clean `[Agnost] orgId is required` error instead of cryptic OTLP failures. Runtime setup lives in `src/agnost.ts`, while `core/config.ts` stays focused on defaults and validation.

### Copy-Paste Setup API
`setupAgnost()` is the primary onboarding API. It creates the agent, initializes OpenTelemetry once, and runs optional integrations:

```ts
import 'dotenv/config';
import { setupAgnost } from '@agnost/agent-mode';

export const agnost = await setupAgnost({
  orgId: process.env.AGNOST_ORG_ID!,
  integrations: {
    openai: true,
    vercelAI: true,
  },
});
```

### Rejected Alternatives

| Alternative | Why Rejected |
|---|---|
| Custom HTTP analytics protocol | Duplicates OTel; Agnost already speaks OTLP |
| Global monkey-patching | Too invasive; per-framework adapters are predictable |
| Backend proxy agent | Adds latency, complexity, deployment dependency |
| Separate packages per framework | Monorepo with subpath exports is simpler |
| Python first | PRD targets TypeScript/Node.js ecosystem |

---

## Failure Handling

- **Export failures do not block inference.** The SDK catches OTLP errors and logs a warning; the calling application is unaffected.
- **Bounded memory.** The OTel SDK's `BatchSpanProcessor` drops spans when the buffer exceeds its limit.
- **Final flush.** `agent.shutdown()` flushes buffered spans and shuts down the OTel SDK.

---

## Future Vision (Agent Onboarding & Distribution)

**Today:** Explicit `npm install @agnost/agent-mode` + copy-paste `agnost.ts` setup file + wrap calls with `agent.track()`.

**Next:** Framework auto-detection. `npx @agnost/agent-mode detect` scans `package.json`, detects Vercel AI / OpenAI / Mastra, and configures the runtime with zero code changes.

**Later:** One-click onboarding from Vercel dashboard or OpenAI project settings. Flip a toggle → spans appear in Agnost.

**End state:** Agent frameworks emit standard OTel telemetry natively (via OpenInference / Semantic Conventions). Agnost becomes a plug-and-play observability layer — no SDK install required, just a collector endpoint.

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
