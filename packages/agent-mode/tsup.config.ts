import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/frameworks/vercel.ts',
    'src/frameworks/openai.ts',
    'src/frameworks/mastra.ts',
  ],
  format: ['esm', 'cjs'],
  dts: true,
  splitting: true,
  sourcemap: true,
  clean: true,
  external: [
    'ai', 'openai', '@mastra/otel-exporter', '@mastra/core', '@mastra/observability',
    '@arizeai/openinference-instrumentation-openai',
    '@opentelemetry/*',
  ],
});
