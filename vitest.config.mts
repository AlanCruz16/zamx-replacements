import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Dos proyectos, porque el código se divide limpiamente en dos:
 *
 * - `convex` — funciones de Convex ejecutadas con `convex-test` sobre una base
 *   de datos en memoria. Requiere el entorno `edge-runtime`; el entorno Node
 *   por defecto no sirve (ver `convex/_generated/ai/guidelines.md`).
 * - `web` — todo lo que importa React, es decir los route handlers que
 *   renderizan componentes de email o de PDF. Requiere `jsdom`.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'convex',
          environment: 'edge-runtime',
          include: ['convex/**/*.test.ts'],
          server: { deps: { inline: ['convex-test'] } },
        },
      },
      {
        resolve: {
          alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
          },
        },
        test: {
          name: 'web',
          environment: 'jsdom',
          include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
        },
      },
    ],
  },
});
