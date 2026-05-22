import 'dotenv/config';
import OpenAI from 'openai';
import { agnost, setAgnostContext } from './agnost.js';

const client = new OpenAI();

async function main() {
  setAgnostContext({ userId: 'user-42', sessionId: 'demo-session', email: 'user@example.com' });

  console.log('[Agnost] Sending test prompt via OpenAI...');

  const completion = await agnost.track(
    client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'how are you?' }],
    }),
    { toolName: 'chat_completion' },
  );

  console.log(`[Agnost] Response: ${completion.choices[0].message.content}`);

  console.log('[Agnost] Shutting down — flushing OTel spans to otel.agnost.ai...');
  await agnost.shutdown();
  console.log('[Agnost] Done.');
}

main().catch(async (err) => {
  console.error('[Agnost] Error:', err);
  await agnost.shutdown();
  process.exit(1);
});
