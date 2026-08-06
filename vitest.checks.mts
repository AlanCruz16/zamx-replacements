import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Las comprobaciones que llaman al modelo de verdad. Fuera de `vitest.config.mts`
 * a propósito: son lentas, cuestan dinero y dependen de la red, así que no
 * pueden bloquear la suite ni CI. Se corren a mano cuando cambia el prompt del
 * intérprete o el correo al Approver — ver `src/lib/reply-vocabulary.check.ts`.
 */
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    name: 'checks',
    environment: 'node',
    include: ['src/**/*.check.ts'],
    testTimeout: 120_000,
    // En serie: son llamadas a un modelo con cuota, y un fallo se lee mejor
    // cuando no compite con otros cinco.
    fileParallelism: false,
  },
});
