import 'dotenv/config';
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { agnost, setAgnostContext } from './agnost';

setAgnostContext({ userId: 'user-42', email: 'user@example.com', sessionId: 'demo-session' });

async function main() {
  console.log('[Agnost] Sending test prompt via Vercel AI SDK...');

  const { text } = await agnost.track(
    generateText({
      model: openai('gpt-4o-mini'),
      prompt: 'Say hello in one word',
      experimental_telemetry: { isEnabled: true },
    }),
    { toolName: 'vercel_generate' },
  );

  console.log(`[Agnost] Response: ${text}`);

  await agnost.shutdown();
}

main().catch(async (err) => {
  console.error('[Agnost] Error:', err);
  await agnost.shutdown();
  process.exit(1);
});
