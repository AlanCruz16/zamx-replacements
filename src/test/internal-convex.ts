import { vi } from 'vitest';

/**
 * Doble de la frontera HTTP interna de Convex, compartido por los tests de
 * route handlers (Seam 2).
 *
 * Se corta en `fetch` — la I/O de red — y no en `@/lib/internal-api`, que lleva
 * reglas propias (nombrar `INTERNAL_API_SECRET` cuando falta, derivar el dominio
 * `.site`) que son parte de lo que se prueba.
 */
export const INTERNAL_PATHS = {
  create: '/internal/quotes/create',
  details: '/internal/quotes/details',
  quoteDocumentSent: '/internal/quotes/quote-document-sent',
  rejectionExplained: '/internal/quotes/rejection-explained',
} as const;

export type InternalCall = {
  path: string;
  body: Record<string, unknown>;
  secret: string | null;
};

export function stubInternalConvex() {
  const replies = new Map<string, unknown>();
  const calls: InternalCall[] = [];

  // Sólo se interceptan las rutas internas de Convex. Lo demás pasa al `fetch`
  // real: el renderizador de PDF carga su WebAssembly por ahí, y cortárselo
  // haría fallar el test por una razón que no tiene que ver con lo que prueba.
  const realFetch = globalThis.fetch;

  const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const path = new URL(url instanceof Request ? url.url : String(url)).pathname;
    if (!path.startsWith('/internal/')) {
      return realFetch(url, init);
    }

    const headers = new Headers(init?.headers);

    calls.push({
      path,
      body: JSON.parse(String(init?.body ?? '{}')),
      secret: headers.get('x-internal-secret'),
    });

    return new Response(JSON.stringify({ result: replies.get(path) ?? null }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });

  vi.stubGlobal('fetch', fetchMock);

  return {
    calls,
    /** Las URL completas pedidas, para comprobar el dominio de destino. */
    get fetchUrls() {
      return fetchMock.mock.calls.map(([url]) => String(url));
    },
    /** Lo que devolverá la función interna detrás de `path`. */
    reply(path: string, result: unknown) {
      replies.set(path, result);
    },
    /** Las llamadas hechas a una ruta interna concreta. */
    to(path: string) {
      return calls.filter((call) => call.path === path);
    },
  };
}
