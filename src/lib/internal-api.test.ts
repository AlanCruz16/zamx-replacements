import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { stubInternalConvex } from '@/test/internal-convex';
import { callInternalConvex } from './internal-api';
import { authorizeInternalRequest, requireInternalSecret } from './internal-secret';

/**
 * La regla del secreto interno, en el módulo que la comparten los route
 * handlers y el middleware: **una variable ausente no es una denegación**.
 */

const INTERNAL_SECRET = 'secreto-de-prueba';

beforeEach(() => {
  vi.stubEnv('INTERNAL_API_SECRET', INTERNAL_SECRET);
  vi.stubEnv('NEXT_PUBLIC_CONVEX_SITE_URL', '');
  vi.stubEnv('NEXT_PUBLIC_CONVEX_URL', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function request(headers: Record<string, string> = {}) {
  return new Request('http://localhost:3000/api/send-client-quote', { headers });
}

describe('authorizeInternalRequest', () => {
  test('con el secreto correcto deja pasar', () => {
    expect(authorizeInternalRequest(request({ 'x-internal-secret': INTERNAL_SECRET }))).toBeNull();
  });

  test('sin cabecera o con el secreto equivocado es una denegación 401', () => {
    expect(authorizeInternalRequest(request())).toEqual({ status: 401, error: 'No autorizado' });
    expect(authorizeInternalRequest(request({ 'x-internal-secret': 'otro' }))).toEqual({
      status: 401,
      error: 'No autorizado',
    });
  });

  test('sin la variable configurada es un fallo del servidor que la nombra', () => {
    vi.stubEnv('INTERNAL_API_SECRET', '');

    const denied = authorizeInternalRequest(request({ 'x-internal-secret': INTERNAL_SECRET }));

    // Un 401 aquí diría que el llamador se equivocó, cuando quien está mal
    // configurado es el despliegue. Distinguirlas es el ticket entero.
    expect(denied?.status).toBe(500);
    expect(denied?.error).toContain('INTERNAL_API_SECRET');
  });
});

describe('requireInternalSecret', () => {
  test('lanza nombrando la variable cuando no está configurada', () => {
    vi.stubEnv('INTERNAL_API_SECRET', '');

    expect(() => requireInternalSecret()).toThrow('INTERNAL_API_SECRET');
  });
});

describe('callInternalConvex', () => {
  test('llama al dominio .site con el secreto en la cabecera', async () => {
    // Las HTTP Actions viven en `.convex.site`, no en el `.convex.cloud` que
    // usan las consultas: derivarlo mal deja la llamada sin destino.
    vi.stubEnv('NEXT_PUBLIC_CONVEX_URL', 'https://veloz-perro-123.convex.cloud');
    const convex = stubInternalConvex();

    await callInternalConvex('/internal/quotes/details', { requestId: 'REQ-ABC' });

    expect(convex.calls).toMatchObject([
      {
        path: '/internal/quotes/details',
        body: { requestId: 'REQ-ABC' },
        secret: INTERNAL_SECRET,
      },
    ]);
    expect(convex.fetchUrls[0]).toBe('https://veloz-perro-123.convex.site/internal/quotes/details');
  });

  test('sin el secreto configurado no llega a llamar a nadie', async () => {
    vi.stubEnv('INTERNAL_API_SECRET', '');
    vi.stubEnv('NEXT_PUBLIC_CONVEX_SITE_URL', 'https://convex.example.site');
    const convex = stubInternalConvex();

    await expect(callInternalConvex('/internal/quotes/details', {})).rejects.toThrow(
      'INTERNAL_API_SECRET'
    );
    expect(convex.calls).toEqual([]);
  });
});
