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
Agent Call
   ↓
Framework Adapter ──→ Context Enrichment (userId/sessionId)
   ↓
SpanBatcher (max 1000, flush @ 100 | 5s)
   ↓
OTLP Export ──→ otel.agnost.ai ──→ Agnost Dashboard
```

**Pattern:** Client-side wrapper only. The SDK remains stateless and client-side. Persistence and analytics live entirely in Agnost infrastructure. The SDK configures an OTel exporter, instruments the AI SDK, batches spans in memory, and flushes via OTLP.

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

### Batcher Tuning (Engineering Judgment)

**Assumption:** A medium deployment may emit ~10–50 spans/request. At 500 RPS, naive sync export becomes a bottleneck. Batched async export reduces request-path latency and network overhead.

- `max 1000` — bounds memory (~50KB per batch of typical spans)
- `flush @ 100` — keeps dashboard latency under ~1s at 100 RPS
- `flush 5s` — safety valve for low-traffic periods

### Framework Adapters (Thin Wrappers)

| SDK | Approach |
|---|---|
| **Vercel AI** | Proxies `generateText`/`streamText`/etc. to inject `userId`/`sessionId` into `experimental_telemetry.metadata` |
| **OpenAI** | OpenInference `OpenAIInstrumentation` for span generation + prototype-patches `chat.completions.create` to inject identity. Patched only when explicit instrumentation APIs are unavailable; exposes an opt-out flag and per-client `wrapOpenAIClient()` for teams that prefer explicit wrapping. Known risk: SDK upgrades may break the patch. |
| **Mastra** | `createMastraExporter()` factory — returns an OTel exporter pre-configured with org credentials |

### OpenAI SDK — Real-World Integration Patterns

**A. Shared setup file:**
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

**B. Next.js API route (per-request identity from auth):**
```ts
// app/api/chat/route.ts
import OpenAI from 'openai';
import { getAuth } from '@clerk/nextjs/server';
import { setAgnostContext } from '@/agnost';

const client = new OpenAI();

export async function POST(req: Request) {
  const { userId } = getAuth(req);
  const { message } = await req.json();

  setAgnostContext({
    userId,
    sessionId: req.headers.get('x-session-id') ?? crypto.randomUUID(),
    email: req.headers.get('x-user-email'),
  });

  const completion = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: message }],
  });

  return Response.json({ reply: completion.choices[0].message.content });
}
```

**C. Express middleware (auto-attach identity to every route):**
```ts
// middleware/agnost.ts
import { setAgnostContext } from '../agnost';
import { verifyToken } from '../lib/auth';

export function agnostMiddleware(req: any, res: any, next: any) {
  const token = req.headers.authorization?.split(' ')[1];
  if (token) {
    try {
      const user = verifyToken(token);
      setAgnostContext({
        userId: user.id,
        email: user.email,
        sessionId: req.session?.id,
      });
    } catch {
      // unauthenticated requests still work — just no identity on spans
    }
  }
  next();
}
```

**D. Multi-tenant background worker (per-job identity):**
```ts
// workers/chat-processor.ts
import OpenAI from 'openai';
import { setAgnostContext } from '../agnost';

const client = new OpenAI();

async function processChatJob(job: { tenantId: string; userId: string; messages: any[] }) {
  setAgnostContext({
    userId: job.userId,
    sessionId: `job-${job.tenantId}-${Date.now()}`,
    conversationId: crypto.randomUUID(),
  });

  const completion = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: job.messages,
  });

  return completion.choices[0].message.content;
}
```

### Config Validation & Setup
`setupAgnost()` and `withAgnost()` call `validateConfig()` first, guaranteeing a clean `[Agnost] orgId is required` error instead of cryptic OTLP failures. Runtime setup lives in `src/agnost.ts`, while `core/config.ts` stays focused on defaults and validation.

### Copy-Paste Setup API
`setupAgnost()` is the primary onboarding API. It creates the agent, initializes OpenTelemetry once, creates the shared `SpanBatcher`, and runs optional integrations:

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

`withAgnost()` remains available for lower-level/manual setup and backward compatibility.

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
- **Bounded memory.** The in-memory batcher drops the oldest span when the buffer reaches 1000 spans.
- **Final flush.** `agent.shutdown()` flushes buffered spans and shuts down the OTel SDK.

---

## Future Vision (Agent Onboarding & Distribution)

**Today:** Explicit `npm install @agnost/agent-mode` + copy-paste `agnost.ts` setup file.

**Next:** Framework auto-detection. `npx @agnost/agent-mode detect` scans `package.json`, detects Vercel AI / OpenAI / Mastra, and patches the runtime with zero code changes.

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
