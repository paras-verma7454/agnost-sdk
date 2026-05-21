import 'dotenv/config';
import { Mastra } from '@mastra/core';
import { Observability } from '@mastra/observability';
import { createMastraExporter } from '@agnost/agent-mode/mastra';

async function main() {
  const agnostExporter = await createMastraExporter({
    orgId: process.env.AGNOST_ORG_ID!,
  });

  const mastra = new Mastra({
    observability: new Observability({
      configs: {
        default: {
          serviceName: 'my-mastra-app',
          exporters: [agnostExporter],
        },
      },
    }),
  });

  console.log('Agnost agent-mode is instrumenting Mastra.');
  console.log('Exporter configured for org:', process.env.AGNOST_ORG_ID!);
}

main().catch((err) => {
  console.error('[Agnost] Error:', err);
  process.exit(1);
});
