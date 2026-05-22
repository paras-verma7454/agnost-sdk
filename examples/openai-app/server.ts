import 'dotenv/config';
import express from 'express';
import OpenAI from 'openai';
import { agnost, setAgnostContext } from './agnost.js';

const client = new OpenAI();
const app = express();

app.use(express.json());

app.post('/chat', async (req, res) => {
  const { userId, message } = req.body;
  if (!message) return res.status(400).json({ error: 'message is required' });

  setAgnostContext({ userId: userId ?? 'anonymous', sessionId: crypto.randomUUID() });

  const completion = await agnost.track(
    client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: message }],
    }),
    { toolName: 'chat_completion' },
  );

  res.json({ reply: completion.choices[0].message.content });
});

const server = app.listen(3000, () => console.log('[Agnost] Server running on :3000'));

process.on('SIGINT', async () => {
  console.log('\n[Agnost] Shutting down...');
  server.close();
  await agnost.shutdown();
  process.exit(0);
});
