import { query } from './_generated/server';
import { callerIsSupervisor } from './lib/supervisors';

/**
 * El panel del Supervisor: sólo mira, nunca actúa. Cada consulta de aquí pasa
 * por `requireSupervisor`, salvo esta, que es la pregunta misma.
 */

/**
 * Si quien llama es Supervisor. La usa la ruta del panel para decidir entre
 * pintarlo o contestar «no encontrado»; no protege nada por sí sola.
 */
export const amISupervisor = query({
  args: {},
  handler: async (ctx) => callerIsSupervisor(ctx),
});
