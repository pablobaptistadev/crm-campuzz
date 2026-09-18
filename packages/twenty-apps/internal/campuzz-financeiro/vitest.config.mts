import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

/**
 * Os testes ficam num projeto nomeado `unit` de proposito.
 *
 * A CI descobre o que rodar pelo NOME dos scripts do package.json
 * (`.github/workflows/discover-apps.yaml`): `hasUnit` e
 * `Boolean(scripts['test:unit'])`. Sem esse script, o job de unit e pulado e a
 * suite inteira passa despercebida — testes que nao rodam na CI sao testes que
 * so protegem quem lembra de roda-los na mao.
 */
export default defineConfig({
  plugins: [tsconfigPaths({ ignoreConfigErrors: true })],
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts'],
        },
      },
    ],
  },
});
