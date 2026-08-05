import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { INTERNAL_PATHS, stubInternalConvex } from '@/test/internal-convex';

/**
 * Seam 2 — la ruta interna que le explica al Customer por qué no hay Quote
 * Document. Sigue la convención de stubs de
 * `../send-client-quote/route.test.ts`: se corta `resend` y el `fetch` con el
 * que se alcanzan las funciones internas de Convex, nada más.
 */

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn() }));

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: sendEmail };
  },
}));

const INTERNAL_SECRET = 'secreto-de-prueba';

let convex: ReturnType<typeof stubInternalConvex>;

async function loadHandler() {
  vi.resetModules();
  const { POST } = await import('./route');
  return POST;
}

function request(headers: Record<string, string>, body: unknown = {}) {
  return new Request('http://localhost:3000/api/send-rejection-email', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

function quoteDetails() {
  return {
    quote: {
      _id: 'quote_1',
      _creationTime: Date.UTC(2026, 6, 30),
      requestId: 'REQ-V59X9B',
      expiresAt: Date.UTC(2026, 7, 30),
      products: [],
      outcome: 'discontinued',
      approverExplanation: 'La pieza está descontinuada.',
    },
    user: {
      fullName: 'Ana Cliente',
      companyName: 'Refrigeración del Norte',
      email: 'ana@example.com',
    },
  };
}

function rejectionBody() {
  return {
    requestId: 'REQ-V59X9B',
    outcome: 'discontinued',
    explanation: 'La pieza está descontinuada.',
  };
}

beforeEach(() => {
  vi.stubEnv('INTERNAL_API_SECRET', INTERNAL_SECRET);
  vi.stubEnv('NEXT_PUBLIC_CONVEX_SITE_URL', 'https://convex.example.site');
  vi.stubEnv('RESEND_API_KEY', 're_prueba');
  convex = stubInternalConvex();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('POST /api/send-rejection-email', () => {
  test('sin el header del secreto interno responde 401 y no toca Convex ni Resend', async () => {
    const POST = await loadHandler();

    const res = await POST(request({ 'content-type': 'application/json' }, rejectionBody()));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ success: false, error: 'No autorizado' });
    expect(convex.calls).toEqual([]);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test('con un secreto interno equivocado responde 401', async () => {
    const POST = await loadHandler();

    const res = await POST(request({ 'x-internal-secret': 'secreto-equivocado' }, rejectionBody()));

    expect(res.status).toBe(401);
    expect(convex.calls).toEqual([]);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test('sin INTERNAL_API_SECRET configurado responde nombrando la variable, no 401', async () => {
    vi.stubEnv('INTERNAL_API_SECRET', '');
    const POST = await loadHandler();

    const res = await POST(request({ 'x-internal-secret': INTERNAL_SECRET }, rejectionBody()));

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('INTERNAL_API_SECRET'),
    });
    expect(convex.calls).toEqual([]);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test('autorizado, explica el Outcome y lo registra como rechazo, no como Quote Document', async () => {
    convex.reply(INTERNAL_PATHS.details, quoteDetails());
    sendEmail.mockResolvedValue({ data: { id: 'email_1' }, error: null });
    const POST = await loadHandler();

    const res = await POST(request({ 'x-internal-secret': INTERNAL_SECRET }, rejectionBody()));

    expect(res.status).toBe(200);

    expect(sendEmail).toHaveBeenCalledOnce();
    const [enviado] = sendEmail.mock.calls[0];
    expect(enviado.to).toEqual(['ana@example.com']);
    // Un solo identificador, el mismo que el cuerpo y el resto del recorrido:
    // sin el `ZAMX-Q-` que le inventaba un segundo esquema delante.
    expect(enviado.subject).toContain('REQ-V59X9B');
    expect(enviado.subject).not.toContain('ZAMX-Q-');
    expect(enviado.subject).toMatch(/(^|\s)REQ-V59X9B(\s|$)/);
    expect(enviado.attachments).toBeUndefined();

    // El hecho registrado es «se le explicó», no «se le envió el Quote
    // Document»: compartir una sola mutación es lo que hacía que un camino
    // registrara el hecho del otro.
    expect(convex.to(INTERNAL_PATHS.rejectionExplained)).toMatchObject([
      { body: { quoteId: 'quote_1' }, secret: INTERNAL_SECRET },
    ]);
    expect(convex.to(INTERNAL_PATHS.quoteDocumentSent)).toEqual([]);
  });

  test('un Outcome que esta ruta no sabe explicar no le llega al Customer', async () => {
    convex.reply(INTERNAL_PATHS.details, quoteDetails());
    const POST = await loadHandler();

    // `priced_as_suggested` lleva Quote Document; por aquí sólo salen los tres
    // Outcomes que se le explican al Customer sin él. La plantilla caía en su
    // rama por defecto y mandaba un correo con encabezado genérico y cuerpo
    // vacío: el Customer se enteraba de que pasó algo, pero no de qué.
    const res = await POST(
      request(
        { 'x-internal-secret': INTERNAL_SECRET },
        { ...rejectionBody(), outcome: 'priced_as_suggested' }
      )
    );

    expect(res.status).toBe(400);
    expect(sendEmail).not.toHaveBeenCalled();
    // Y no se registra como explicado algo que nunca se explicó.
    expect(convex.to(INTERNAL_PATHS.rejectionExplained)).toEqual([]);
  });
});
