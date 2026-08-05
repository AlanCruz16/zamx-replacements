import { afterEach, describe, expect, test, vi } from 'vitest';
import { approverAddresses } from './approvers';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('la lista de Approvers configurada', () => {
  test('admite varias direcciones separadas por coma', () => {
    vi.stubEnv('APPROVER_EMAILS', ' ventas@zamx.mx , gerencia@zamx.mx ');

    expect(approverAddresses()).toEqual(['ventas@zamx.mx', 'gerencia@zamx.mx']);
  });

  test('sin APPROVER_EMAILS cae en la dirección a la que se manda la solicitud', () => {
    vi.stubEnv('APPROVER_EMAILS', '');
    vi.stubEnv('ADMIN_EMAIL', 'ventas@zamx.mx');

    expect(approverAddresses()).toEqual(['ventas@zamx.mx']);
  });

  test('sin ninguna de las dos la lista queda vacía, y una lista vacía no autoriza a nadie', () => {
    vi.stubEnv('APPROVER_EMAILS', '');
    vi.stubEnv('ADMIN_EMAIL', '');

    // Falla cerrado: el buzón deja de mover Replacement Requests en vez de
    // quedar abierto a cualquiera que sepa un folio.
    expect(approverAddresses()).toEqual([]);
  });
});
