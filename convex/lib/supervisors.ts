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
 * La guarda de toda consulta del panel. Contesta `'signed_out'` a quien no
 * tiene sesión, y la consulta no devuelve nada; a quien la tiene sin ser
 * Supervisor, lanza.
 *
 * Sin sesión no se lanza porque ese es el hueco del handshake, no un intruso:
 * al cargar la página, Clerk le entrega a Convex un `getToken` nuevo y el
 * proveedor se reautentica pasando por `clearAuth()`, así que las consultas ya
 * suscritas se reejecutan un instante sin identidad. Lanzar ahí tumbaba el panel
 * de un Supervisor de verdad. Es lo mismo que hacen las consultas del Customer.
 *
 * A quien sí tiene sesión se le lanza en vez de devolverle vacío: una lista
 * vacía le diría a un Customer que husmea «no hay nada», y lo que tiene que oír
 * es que no puede preguntar. La página ya no se pinta para quien no es
 * Supervisor, así que esto sólo lo ve quien llama a la consulta a mano.
 */
export async function requireSupervisor(ctx: QueryCtx): Promise<'supervisor' | 'signed_out'> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return 'signed_out';
  if (!isSupervisorIdentity(identity, supervisorAddresses())) {
    throw new Error('No autorizado');
  }
  return 'supervisor';
}
