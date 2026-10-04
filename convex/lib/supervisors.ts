import type { QueryCtx } from '../_generated/server';
import { isSupervisorIdentity } from './supervisor_authority';

/**
 * De dónde sale la autoridad del Supervisor: de estar en `SUPERVISOR_EMAILS`,
 * separadas por coma, y de nada más. Es el único sitio que lee el entorno para
 * esto; la regla que compara vive en `supervisor_authority.ts`.
 *
 * A diferencia de la lista de Approvers (`approvers.ts`) **no** hay respaldo en
 * `ADMIN_EMAIL`: quien recibe las solicitudes no tiene por qué ver a todos los
 * Customers. Sin la variable la lista queda vacía y no autoriza a nadie, de modo
 * que un despliegue mal configurado cierra el panel en vez de abrirlo.
 */
export function supervisorAddresses(): string[] {
  return (process.env.SUPERVISOR_EMAILS || '')
    .split(',')
    .map((address) => address.trim())
    .filter((address) => address.length > 0);
}

/** Si quien llama es Supervisor. Sin sesión, no lo es. */
export async function callerIsSupervisor(ctx: QueryCtx): Promise<boolean> {
  const identity = await ctx.auth.getUserIdentity();
  return isSupervisorIdentity(identity, supervisorAddresses());
}

/**
 * La guarda de toda consulta del panel. Lanza en vez de devolver vacío: una
 * lista vacía le diría a un Customer que husmea «no hay nada», y lo que tiene
 * que oír es que no puede preguntar. La página ya no se pinta para quien no es
 * Supervisor, así que esto sólo lo ve quien llama a la consulta a mano.
 */
export async function requireSupervisor(ctx: QueryCtx): Promise<void> {
  if (!(await callerIsSupervisor(ctx))) {
    throw new Error('No autorizado');
  }
}
