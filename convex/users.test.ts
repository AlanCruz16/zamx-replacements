/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';

/**
 * La fila del Customer cuando el webhook de Clerk no la trae (missing-user-row,
 * ticket 01).
 *
 * El webhook era el único que creaba la fila, y la pantalla de chat espera a
 * tenerla: si no llegaba —entrega fallida, secreto equivocado, o un preview al
 * que el webhook ni apunta— el Customer se quedaba mirando la espera para
 * siempre. Lo que se afirma es lo que ve un llamador con su identidad puesta.
 */
const modules = import.meta.glob('./**/*.ts');

const ana = { subject: 'user_ana', name: 'Ana Cliente', email: 'ana@example.com' };

describe('ensureCurrent', () => {
  test('una identidad sin fila acaba con su fila, lista para el onboarding', async () => {
    const t = convexTest(schema, modules);
    const asAna = t.withIdentity(ana);

    expect(await asAna.query(api.users.current, {})).toBeNull();

    await asAna.mutation(api.users.ensureCurrent, {});

    expect(await asAna.query(api.users.current, {})).toMatchObject({
      clerkId: 'user_ana',
      fullName: 'Ana Cliente',
      email: 'ana@example.com',
      companyName: 'Pendiente',
      preferredLanguage: 'es',
    });
  });

  test('sin nombre ni correo en el token la fila se crea igual', async () => {
    const t = convexTest(schema, modules);
    const asBeto = t.withIdentity({ subject: 'user_beto' });

    await asBeto.mutation(api.users.ensureCurrent, {});

    expect(await asBeto.query(api.users.current, {})).toMatchObject({
      clerkId: 'user_beto',
      fullName: '',
      email: '',
    });
  });

  test('con la fila ya puesta no la toca ni la duplica', async () => {
    // Lo que el Customer ya dijo en el onboarding no lo pisa lo que traiga el
    // token, y llamarla dos veces —dos pestañas, un re-render— deja una fila.
    const t = convexTest(schema, modules);
    const asAna = t.withIdentity(ana);

    await asAna.mutation(api.users.ensureCurrent, {});
    await asAna.mutation(api.users.updateProfile, {
      fullName: 'Ana María Cliente',
      companyName: 'Refrigeración del Norte',
    });
    await asAna.mutation(api.users.ensureCurrent, {});

    const rows = await t.run((ctx) => ctx.db.query('users').collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      fullName: 'Ana María Cliente',
      companyName: 'Refrigeración del Norte',
    });
  });

  test('el webhook que llega después actualiza la misma fila', async () => {
    const t = convexTest(schema, modules);
    await t.withIdentity(ana).mutation(api.users.ensureCurrent, {});

    await t.mutation(internal.users.upsertFromClerk, {
      clerkId: 'user_ana',
      fullName: 'Ana C.',
      email: 'ana@nuevo.example.com',
    });

    const rows = await t.run((ctx) => ctx.db.query('users').collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ fullName: 'Ana C.', email: 'ana@nuevo.example.com' });
  });

  test('sin sesión no crea nada', async () => {
    const t = convexTest(schema, modules);

    await expect(t.mutation(api.users.ensureCurrent, {})).rejects.toThrow('Unauthenticated');

    const rows = await t.run((ctx) => ctx.db.query('users').collect());
    expect(rows).toHaveLength(0);
  });
});
