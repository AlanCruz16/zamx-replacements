import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

/**
 * Seam 2 — la ruta que le contesta al Approver cuando el sistema no puede actuar
 * sobre su respuesta. Se corta `resend` en la frontera del módulo y nada más;
 * esta ruta no llama a Convex.
 */

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn() }));

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: sendEmail };
  },
}));

const INTERNAL_SECRET = 'secreto-de-prueba';

async function loadHandler() {
  vi.resetModules();
  const { POST } = await import('./route');
  return POST;
}

function request(headers: Record<string, string>, body: unknown = replyBody()) {
  return new Request('http://localhost:3000/api/send-approver-reply', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

function replyBody(overrides: Record<string, unknown> = {}) {
  return {
    to: 'ventas@ziehl-abegg.mx',
    requestId: 'REQ-ABC123',
    reason: 'price_out_of_bounds',
    prices: [{ partNumber: 'P-001', priceUSD: 17_000, suggestedPriceUSD: 1000 }],
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubEnv('INTERNAL_API_SECRET', INTERNAL_SECRET);
  vi.stubEnv('APPROVER_EMAILS', 'ventas@ziehl-abegg.mx, gerencia@ziehl-abegg.mx');
  vi.stubEnv('IMAP_USER', 'cotizaciones@za.idcn.com.mx');
  vi.stubEnv('RESEND_API_KEY', 're_prueba');
  sendEmail.mockResolvedValue({ data: { id: 'email_1' }, error: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('POST /api/send-approver-reply', () => {
  test('sin el header del secreto interno responde 401 y no manda correo', async () => {
    const POST = await loadHandler();

    const res = await POST(request({ 'content-type': 'application/json' }));

    expect(res.status).toBe(401);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test('sin INTERNAL_API_SECRET configurado responde nombrando la variable, no 401', async () => {
    vi.stubEnv('INTERNAL_API_SECRET', '');
    const POST = await loadHandler();

    const res = await POST(request({ 'x-internal-secret': INTERNAL_SECRET }));

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('INTERNAL_API_SECRET'),
    });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test('a una dirección fuera de la lista de Approvers no se le escribe', async () => {
    // La dirección llega en el cuerpo: sin esta comprobación la ruta sería un
    // remitente de correo abierto para quien tuviera el secreto interno.
    const POST = await loadHandler();

    const res = await POST(
      request({ 'x-internal-secret': INTERNAL_SECRET }, replyBody({ to: 'intruso@internet.com' }))
    );

    expect(res.status).toBe(403);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test('sin Approvers configurados no se le escribe a nadie', async () => {
    vi.stubEnv('APPROVER_EMAILS', '');
    vi.stubEnv('ADMIN_EMAIL', '');
    const POST = await loadHandler();

    const res = await POST(request({ 'x-internal-secret': INTERNAL_SECRET }));

    expect(res.status).toBe(403);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test('sin folio o sin motivo responde 400', async () => {
    const POST = await loadHandler();

    for (const body of [replyBody({ requestId: '' }), replyBody({ reason: '' })]) {
      const res = await POST(request({ 'x-internal-secret': INTERNAL_SECRET }, body));
      expect(res.status).toBe(400);
    }

    expect(sendEmail).not.toHaveBeenCalled();
  });

  test('autorizado, le contesta al Approver con el folio y las cifras que se leyeron', async () => {
    const POST = await loadHandler();

    const res = await POST(request({ 'x-internal-secret': INTERNAL_SECRET }));

    expect(res.status).toBe(200);
    expect(sendEmail).toHaveBeenCalledOnce();

    const [enviado] = sendEmail.mock.calls[0];
    expect(enviado.to).toEqual(['ventas@ziehl-abegg.mx']);
    expect(enviado.subject).toContain('REQ-ABC123');
    expect(enviado.text).toContain('$17,000.00 USD');
    expect(enviado.text).toContain('$1,000.00 USD');
    // Contestar a este correo tiene que volver al buzón que sondea el sistema.
    expect(enviado.replyTo).toBe('cotizaciones@za.idcn.com.mx');
  });

  test('lo que se dice sale del cuerpo, no de un nuevo vistazo al registro', async () => {
    // Esta ruta no consulta la Replacement Request: un motivo sin precios no
    // puede sacar cifras de ninguna parte.
    const POST = await loadHandler();

    await POST(
      request(
        { 'x-internal-secret': INTERNAL_SECRET },
        replyBody({ reason: 'low_confidence', prices: undefined })
      )
    );

    const [enviado] = sendEmail.mock.calls[0];
    expect(enviado.text).not.toMatch(/\$[\d,]/);
  });
});
