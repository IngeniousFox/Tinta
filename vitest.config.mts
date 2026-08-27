import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Las pruebas cubren la lógica pura: conversión de Markdown, frontmatter,
 * rutas y derivados. Nada que importe React Native entra aquí — esa parte se
 * verifica en el emulador, no en Node.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
