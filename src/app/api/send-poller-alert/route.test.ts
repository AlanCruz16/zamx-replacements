import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

/**
 * Seam 2 — la ruta que avisa de un sondeo que no puede leer el buzón. Se corta
 * `resend` en la frontera del módulo y nada más; esta ruta no llama a Convex.
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

function request(headers: Record<string, string>, body: unknown = alertBody()) {
  return new Request('http://localhost:3000/api/send-poller-alert', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

function alertBody(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'authentication',
    detail: '3 NO [ALERT] Invalid credentials (Failure)',
    failures: 225,
    silentForMs: 19 * 60 * 60 * 1000,
    lastSuccessAt: Date.UTC(2026, 7, 4, 21, 35),
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubEnv('INTERNAL_API_SECRET', INTERNAL_SECRET);
  vi.stubEnv('ADMIN_EMAIL', 'ventas@ziehl-abegg.mx');
  vi.stubEnv('RESEND_API_KEY', 're_prueba');
  sendEmail.mockResolvedValue({ data: { id: 'email_1' }, error: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('POST /api/send-poller-alert', () => {
  test('sin el header del secreto interno responde 401 y no manda correo', async () => {
    const POST = await loadHandler();

    const res = await POST(request({ 'content-type': 'application/json' }));

    expect(res.status).toBe(401);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test('avisa a ADMIN_EMAIL con el error y el tiempo en silencio', async () => {
    const POST = await loadHandler();

    const res = await POST(request({ 'x-internal-secret': INTERNAL_SECRET }));

    expect(res.status).toBe(200);
    const [email] = sendEmail.mock.calls[0];
    expect(email.to).toEqual(['ventas@ziehl-abegg.mx']);
    expect(email.subject).toContain('credenciales');
    expect(email.text).toContain('Invalid credentials');
    expect(email.text).toContain('225');
  });

  test('sin ADMIN_EMAIL configurado nombra la variable en vez de fallar en silencio', async () => {
    // El aviso que no tiene a dónde ir es el mismo silencio que la ruta viene a
    // quitar; al menos queda en el registro y en la respuesta.
    vi.stubEnv('ADMIN_EMAIL', '');
    const POST = await loadHandler();

    const res = await POST(request({ 'x-internal-secret': INTERNAL_SECRET }));

    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining('ADMIN_EMAIL') });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test('un cuerpo sin clase de fallo se rechaza', async () => {
    const POST = await loadHandler();

    const res = await POST(
      request({ 'x-internal-secret': INTERNAL_SECRET }, alertBody({ kind: undefined }))
    );

    expect(res.status).toBe(400);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test('un fallo de conexión manda un correo distinto al de credenciales', async () => {
    const POST = await loadHandler();

    await POST(
      request(
        { 'x-internal-secret': INTERNAL_SECRET },
        alertBody({ kind: 'connection', detail: 'connect ETIMEDOUT' })
      )
    );

    const [email] = sendEmail.mock.calls[0];
    expect(email.subject).toContain('no responde');
    expect(email.text).not.toContain('IMAP_PASSWORD');
  });
});
