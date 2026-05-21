import 'dotenv/config';
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { withAgnost, setAgnostContext } from '@agnost/agent-mode';

const agnost = withAgnost({ orgId: process.env.AGNOST_ORG_ID! });

setAgnostContext({ userId: 'user-42', email: 'user@example.com', sessionId: 'demo-session' });

async function main() {
  // Sets up OTel exporter. In ESM (tsx), auto-patching is not supported,
  // so identity is injected via track() wrapper instead.
  await agnost.instrumentVercelAI();

  console.log('[Agnost] Sending test prompt...');

  // track() wraps the promise in an OTel span and auto-injects
  // userId/sessionId from setAgnostContext() — no need to pass them manually.
  const { text } = await agnost.track(
    generateText({
      model: openai('gpt-4o-mini'),
      prompt: 'Say hello in one word',
    }),
  );

  console.log(`[Agnost] Response: ${text}`);

  await agnost.shutdown();
}

main().catch(async (err) => {
  console.error('[Agnost] Error:', err);
  await agnost.shutdown();
  process.exit(1);
});
