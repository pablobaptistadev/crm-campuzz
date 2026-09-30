import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { src: fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    // graphql ships both CJS and ESM entries. Loading @graphql-tools through a
    // different one than the test file yields two graphql realms, and every
    // instanceof check across them fails.
    server: { deps: { inline: [/graphql/, /@graphql-tools/] } },
  },
});
