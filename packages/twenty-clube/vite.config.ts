import react from '@vitejs/plugin-react-swc';
import { copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Cloudflare's asset handler normalises a directory path, so asking it for
// /clube/index.html answers 307 -> /clube/ and the Worker's own rewrite sends it
// straight back. A plain file name has no directory semantics and no redirect.
const shellSemRedirect = () => ({
  name: 'shell-sem-redirect',
  closeBundle() {
    const saida = fileURLToPath(new URL('../twenty-front/build/clube/', import.meta.url));

    copyFileSync(`${saida}index.html`, `${saida}app.html`);
  },
});

export default defineConfig({
  base: '/clube/',
  plugins: [react(), shellSemRedirect()],
  resolve: {
    alias: { src: fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: { outDir: '../twenty-front/build/clube', emptyOutDir: true },
});
