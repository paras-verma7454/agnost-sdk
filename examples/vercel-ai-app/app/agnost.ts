import 'dotenv/config';
import { setupAgnost, setAgnostContext } from '@agnost/agent-mode';

export const agnost = await setupAgnost({
  orgId: process.env.AGNOST_ORG_ID!,
  integrations: {
    vercelAI: true,
  },
});

export { setAgnostContext };
