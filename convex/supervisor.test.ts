/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { api } from './_generated/api';
import { requireSupervisor } from './lib/supervisors';
import schema from './schema';

/**
 * Quién entra al panel del Supervisor, preguntado como lo pregunta la página:
 * por la consulta pública, con una identidad como la que firma Clerk.
 *
 * La lista sale de `SUPERVISOR_EMAILS` en el entorno de la prueba, como en las
 * pruebas de los Approvers. A diferencia de aquella, aquí no hay respaldo en
 * `ADMIN_EMAIL`, y una prueba lo fija.
 */
const modules = import.meta.glob('./**/*.ts');

afterEach(() => {
  vi.unstubAllEnvs();
});

type Identity = { subject: string; email?: string; emailVerified?: boolean };

const SUPERVISOR: Identity = {
  subject: 'user_sofia',
  email: 'sofia@zamx.mx',
  emailVerified: true,
};

/** La respuesta que la página recibe para esta identidad. */
function isSupervisor(identity: Identity) {
  const t = convexTest(schema, modules);
  return t.withIdentity(identity).query(api.supervisor.amISupervisor, {});
}

describe('quién es Supervisor', () => {
  test('una dirección verificada de la lista es Supervisor', async () => {
    vi.stubEnv('SUPERVISOR_EMAILS', 'sofia@zamx.mx');

    expect(await isSupervisor(SUPERVISOR)).toBe(true);
  });

  test('la comparación no mira mayúsculas ni espacios, ni en la lista ni en la identidad', async () => {
    vi.stubEnv('SUPERVISOR_EMAILS', ' gerencia@zamx.mx ,  Sofia@ZAMX.mx ');

    expect(await isSupervisor({ ...SUPERVISOR, email: ' SOFIA@zamx.MX ' })).toBe(true);
  });

  test('una dirección que no está en la lista no lo es', async () => {
    vi.stubEnv('SUPERVISOR_EMAILS', 'gerencia@zamx.mx');

    expect(await isSupervisor(SUPERVISOR)).toBe(false);
  });

  test('una dirección de la lista sin verificar no lo es', async () => {
    vi.stubEnv('SUPERVISOR_EMAILS', 'sofia@zamx.mx');

    // Cualquiera puede darse de alta con una dirección ajena; sólo la
    // verificación dice que es suya.
    expect(await isSupervisor({ ...SUPERVISOR, emailVerified: false })).toBe(false);
    expect(await isSupervisor({ ...SUPERVISOR, emailVerified: undefined })).toBe(false);
  });

  test('una identidad sin correo no lo es', async () => {
    vi.stubEnv('SUPERVISOR_EMAILS', 'sofia@zamx.mx');

    // Es lo que llegaría si la plantilla de Clerk dejara de mandar el claim:
    // falla cerrado.
    expect(await isSupervisor({ subject: 'user_sofia', emailVerified: true })).toBe(false);
  });

  test('con la lista vacía o sin configurar, nadie lo es', async () => {
    vi.stubEnv('SUPERVISOR_EMAILS', '');
    expect(await isSupervisor(SUPERVISOR)).toBe(false);

    vi.stubEnv('SUPERVISOR_EMAILS', ' , ');
    expect(await isSupervisor(SUPERVISOR)).toBe(false);

    vi.stubEnv('SUPERVISOR_EMAILS', undefined);
    expect(await isSupervisor(SUPERVISOR)).toBe(false);
  });

  test('no hereda la lista de Approvers ni su respaldo', async () => {
    vi.stubEnv('SUPERVISOR_EMAILS', '');
    vi.stubEnv('APPROVER_EMAILS', 'sofia@zamx.mx');
    vi.stubEnv('ADMIN_EMAIL', 'sofia@zamx.mx');

    expect(await isSupervisor(SUPERVISOR)).toBe(false);
  });

  test('sin sesión no lo es', async () => {
    vi.stubEnv('SUPERVISOR_EMAILS', 'sofia@zamx.mx');
    const t = convexTest(schema, modules);

    expect(await t.query(api.supervisor.amISupervisor, {})).toBe(false);
  });
});

/**
 * La guarda por la que pasará cada consulta del panel. Se prueba directa porque
 * todavía no hay consulta del panel que la use; las que lleguen la heredan.
 */
describe('la guarda del Supervisor', () => {
  test('deja pasar a un Supervisor', async () => {
    vi.stubEnv('SUPERVISOR_EMAILS', 'sofia@zamx.mx');
    const t = convexTest(schema, modules);

    const reached = await t.withIdentity(SUPERVISOR).run(async (ctx) => {
      await requireSupervisor(ctx);
      return 'dentro';
    });

    expect(reached).toBe('dentro');
  });

  test('rechaza a un Customer cualquiera', async () => {
    vi.stubEnv('SUPERVISOR_EMAILS', 'sofia@zamx.mx');
    const t = convexTest(schema, modules);
    const customer = { subject: 'user_ana', email: 'ana@example.com', emailVerified: true };

    await expect(t.withIdentity(customer).run((ctx) => requireSupervisor(ctx))).rejects.toThrow(
      'No autorizado'
    );
  });

  test('rechaza a quien no tiene sesión', async () => {
    vi.stubEnv('SUPERVISOR_EMAILS', 'sofia@zamx.mx');
    const t = convexTest(schema, modules);

    await expect(t.run((ctx) => requireSupervisor(ctx))).rejects.toThrow('No autorizado');
  });
});
