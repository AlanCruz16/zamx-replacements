import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

/**
 * Seam 2 — el techo del chat visto desde la ruta.
 *
 * Se cortan en la frontera del módulo las tres cosas que salen de la máquina:
 * Clerk (quién llama), la frontera interna de Convex (la cuenta) y el modelo
 * (el gasto que se quiere acotar). Lo que se comprueba es que el rechazo llega
 * antes que el modelo y que se le puede leer al Customer, no la aritmética de
 * la ventana — eso ya está en `convex/lib/rate_limit.test.ts`.
 *
 * El doble del limitador cuenta de verdad por identidad, en vez de devolver un
 * booleano fijo: así la prueba del aislamiento entre Customers afirma sobre el
 * argumento con el que la ruta llama, que es lo único suyo que hay que creer.
 */

const { authMock, consumeChatRateLimit, streamText } = vi.hoisted(() => ({
  authMock: vi.fn(),
  consumeChatRateLimit: vi.fn(),
  streamText: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: authMock }));

vi.mock('@/lib/internal-api', () => ({
  consumeChatRateLimit,
  createReplacementRequest: vi.fn(),
}));

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: vi.fn() };
  },
}));

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return { ...actual, streamText };
});

const LIMIT = 3;
const WINDOW_MS = 60 * 60 * 1000;

/**
 * Un limitador con la misma forma que el de Convex: ventana fija por identidad,
 * con un reloj que la prueba puede adelantar. Cuenta de verdad en vez de
 * devolver un booleano fijo, para que la prueba del aislamiento entre Customers
 * afirme sobre el argumento con el que la ruta llama.
 */
function limitadorPorIdentidad(clock: { now: number }) {
  const windows = new Map<string, { startedAt: number; count: number }>();
  return vi.fn(async (clerkId: string) => {
    const existing = windows.get(clerkId);
    const window =
      existing === undefined || clock.now - existing.startedAt >= WINDOW_MS
        ? { startedAt: clock.now, count: 0 }
        : existing;

    if (window.count >= LIMIT) {
      return { allowed: false as const, retryAfterMs: window.startedAt + WINDOW_MS - clock.now };
    }

    windows.set(clerkId, { startedAt: window.startedAt, count: window.count + 1 });
    return { allowed: true as const };
  });
}

async function loadHandler() {
  vi.resetModules();
  const { POST } = await import('./route');
  return POST;
}

function request(language = 'es') {
  return new Request('http://localhost:3000/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      messages: [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Hola' }] }],
      data: { userName: 'Ana', language },
    }),
  });
}

beforeEach(() => {
  vi.stubEnv('INTERNAL_API_SECRET', 'secreto-de-prueba');
  vi.stubEnv('NEXT_PUBLIC_CONVEX_SITE_URL', 'https://example.convex.site');
  vi.stubEnv('RESEND_API_KEY', 're_prueba');
  vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'clave-de-prueba');
  authMock.mockResolvedValue({ userId: 'user_ana' });
  streamText.mockReturnValue({
    toUIMessageStreamResponse: () => new Response('ok', { status: 200 }),
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('POST /api/chat', () => {
  test('sin sesión de Clerk responde 401 y no gasta cupo ni modelo', async () => {
    authMock.mockResolvedValue({ userId: null });
    const POST = await loadHandler();

    const res = await POST(request());

    expect(res.status).toBe(401);
    expect(consumeChatRateLimit).not.toHaveBeenCalled();
    expect(streamText).not.toHaveBeenCalled();
  });

  test('las peticiones dentro de la ventana pasan y la siguiente se rechaza', async () => {
    consumeChatRateLimit.mockImplementation(limitadorPorIdentidad({ now: 0 }));
    const POST = await loadHandler();

    for (let i = 0; i < LIMIT; i++) {
      expect((await POST(request())).status).toBe(200);
    }

    const res = await POST(request());

    expect(res.status).toBe(429);
    // El rechazo llega antes que el modelo: es la razón entera del techo.
    expect(streamText).toHaveBeenCalledTimes(LIMIT);
  });

  test('vencida la ventana, el Customer recupera el chat', async () => {
    const clock = { now: 0 };
    consumeChatRateLimit.mockImplementation(limitadorPorIdentidad(clock));
    const POST = await loadHandler();

    for (let i = 0; i < LIMIT; i++) await POST(request());
    expect((await POST(request())).status).toBe(429);

    clock.now += WINDOW_MS;

    // El techo es un tope de gasto, no una expulsión: pasada la hora, el mismo
    // Customer vuelve a poder cotizar.
    expect((await POST(request())).status).toBe(200);
  });

  test('el rechazo se le puede leer al Customer, en su idioma y con cuándo volver', async () => {
    consumeChatRateLimit.mockResolvedValue({ allowed: false, retryAfterMs: 30 * 60 * 1000 });
    const POST = await loadHandler();

    // `DefaultChatTransport` convierte el cuerpo en el `message` del error que
    // recibe `useChat`, así que esto es literalmente lo que ve el Customer.
    const es = await POST(request('es'));
    const textoEs = await es.text();
    expect(textoEs).toContain('demasiados mensajes');
    expect(textoEs).toContain('30 minutos');
    expect(es.headers.get('Retry-After')).toBe(String(30 * 60));

    const en = await POST(request('en'));
    expect(await en.text()).toContain('too many messages');
  });

  test('el cupo de un Customer no lo gasta otro', async () => {
    const limitador = limitadorPorIdentidad({ now: 0 });
    consumeChatRateLimit.mockImplementation(limitador);
    const POST = await loadHandler();

    authMock.mockResolvedValue({ userId: 'user_ana' });
    for (let i = 0; i < LIMIT + 1; i++) await POST(request());

    authMock.mockResolvedValue({ userId: 'user_beto' });
    const res = await POST(request());

    expect(res.status).toBe(200);
    // La identidad con la que se cuenta es la de Clerk, no nada que venga en el
    // cuerpo: un cuerpo lo escribe quien llama.
    expect(limitador).toHaveBeenLastCalledWith('user_beto');
  });

  test('si no se puede contar, no se llama al modelo', async () => {
    // Fallar abierto dejaría el techo en nada justo cuando nadie está mirando.
    consumeChatRateLimit.mockRejectedValue(new Error('Convex no responde'));
    const POST = await loadHandler();

    const res = await POST(request());

    expect(res.status).toBe(503);
    expect(streamText).not.toHaveBeenCalled();
  });
});
