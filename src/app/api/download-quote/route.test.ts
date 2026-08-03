import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { INTERNAL_PATHS, stubInternalConvex } from '@/test/internal-convex';

/**
 * Seam 2 — la descarga del Quote Document es una superficie del Customer, así
 * que autoriza sobre la identidad de Clerk y comprueba que esa identidad es
 * dueña de la Replacement Request. La lectura contra Convex es interna
 * justamente para que esta comprobación sea la única puerta.
 */

const { getAuth } = vi.hoisted(() => ({ getAuth: vi.fn() }));

vi.mock('@clerk/nextjs/server', () => ({ auth: getAuth }));

let convex: ReturnType<typeof stubInternalConvex>;

async function loadHandler() {
  vi.resetModules();
  const { GET } = await import('./route');
  return GET;
}

function request(quoteId = 'REQ-V59X9B') {
  return new Request(`http://localhost:3000/api/download-quote?quoteId=${quoteId}`);
}

function quoteDetails() {
  return {
    quote: {
      _id: 'quote_1',
      _creationTime: Date.UTC(2026, 6, 30),
      requestId: 'REQ-V59X9B',
      expiresAt: Date.UTC(2026, 7, 30),
      products: [
        {
          partNumber: 'P-001',
          model: 'MK137-4DZ.07.U',
          quantity: 2,
          deliveryLocation: 'Monterrey',
          suggestedPriceUSD: 3000,
          confirmedPriceUSD: 3125,
          suggestedDeliveryWeeksMin: 25,
          suggestedDeliveryWeeksMax: 30,
        },
      ],
      outcome: 'priced_differently',
    },
    user: {
      clerkId: 'user_ana',
      fullName: 'Ana Cliente',
      companyName: 'Refrigeración del Norte',
      email: 'ana@example.com',
    },
  };
}

beforeEach(() => {
  vi.stubEnv('INTERNAL_API_SECRET', 'secreto-de-prueba');
  vi.stubEnv('NEXT_PUBLIC_CONVEX_SITE_URL', 'https://convex.example.site');
  convex = stubInternalConvex();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('GET /api/download-quote', () => {
  test('un llamador sin identidad de Clerk es rechazado y no llega a leer nada', async () => {
    getAuth.mockResolvedValue({ userId: null });
    const GET = await loadHandler();

    const res = await GET(request());

    expect(res.status).toBe(401);
    expect(convex.calls).toEqual([]);
  });

  test('un Customer no puede descargar la Replacement Request de otro', async () => {
    getAuth.mockResolvedValue({ userId: 'user_beto' });
    convex.reply(INTERNAL_PATHS.details, quoteDetails());
    const GET = await loadHandler();

    const res = await GET(request());

    expect(res.status).toBe(401);
    expect(res.headers.get('Content-Type')).not.toBe('application/pdf');
  });

  test('el Customer dueño recibe su Quote Document', async () => {
    getAuth.mockResolvedValue({ userId: 'user_ana' });
    convex.reply(INTERNAL_PATHS.details, quoteDetails());
    const GET = await loadHandler();

    const res = await GET(request());

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
  });
});
