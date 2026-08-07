/**
 * El único camino desde el servidor de Next hacia una función interna de Convex.
 *
 * Las funciones internas no existen en la API pública, así que el cliente de
 * Convex no puede alcanzarlas: se llega a ellas por su frontera HTTP, con el
 * secreto en una cabecera. La regla del secreto vive en `./internal-secret`,
 * compartida con el middleware y con la propia frontera.
 */

import type { FunctionArgs, FunctionReturnType } from 'convex/server';
import type { Id } from '../../convex/_generated/dataModel';
import type { internal } from '../../convex/_generated/api';
import { requireInternalSecret } from './internal-secret';

export {
  authorizeInternalRequest,
  requireInternalSecret,
  type InternalAuthFailure,
} from './internal-secret';

/**
 * La URL de las HTTP Actions de Convex — el dominio `.site`, distinto del
 * `.cloud` que usa el cliente de consultas públicas.
 */
function convexSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
  if (configured) return configured.replace(/\/$/, '');

  const cloudUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!cloudUrl) {
    throw new Error('NEXT_PUBLIC_CONVEX_SITE_URL no está configurado');
  }

  return cloudUrl.replace(/\/$/, '').replace(/\.convex\.cloud$/, '.convex.site');
}

/**
 * Llama a una función interna de Convex a través de su frontera HTTP. Es el
 * único camino desde el servidor de Next hacia una función interna: no existen
 * como API pública, así que el cliente de Convex no puede alcanzarlas.
 */
export async function callInternalConvex<T>(path: string, body: unknown): Promise<T> {
  const secret = requireInternalSecret();

  const res = await fetch(`${convexSiteUrl()}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-secret': secret,
    },
    body: JSON.stringify(body),
  });

  const payload = await res.json().catch(() => null);

  if (!res.ok) {
    const detail = payload && typeof payload.error === 'string' ? payload.error : res.statusText;
    throw new Error(`Convex rechazó ${path} (${res.status}): ${detail}`);
  }

  return (payload?.result ?? null) as T;
}

/**
 * Las llamadas internas que existen, tipadas con el tipo de retorno de la
 * propia función de Convex, de modo que cambiarla rompa aquí en el typecheck.
 */

export function createReplacementRequest(
  args: FunctionArgs<typeof internal.quotes.create>
): Promise<FunctionReturnType<typeof internal.quotes.create>> {
  return callInternalConvex('/internal/quotes/create', args);
}

export function fetchQuoteDetails(
  requestId: string
): Promise<FunctionReturnType<typeof internal.quotes.getFullQuoteDetails>> {
  return callInternalConvex('/internal/quotes/details', { requestId });
}

export function markQuoteDocumentSent(quoteId: Id<'quotes'>): Promise<null> {
  return callInternalConvex('/internal/quotes/quote-document-sent', { quoteId });
}

export function markRejectionExplained(quoteId: Id<'quotes'>): Promise<null> {
  return callInternalConvex('/internal/quotes/rejection-explained', { quoteId });
}

/**
 * Apunta una petición del Customer contra su techo del chat. Pasa por la
 * frontera interna como todo lo demás: la cuenta tiene que estar fuera del
 * alcance del navegador al que limita.
 */
export function consumeChatRateLimit(
  clerkId: string
): Promise<FunctionReturnType<typeof internal.rate_limit.consumeChat>> {
  return callInternalConvex('/internal/rate-limit/consume', { clerkId });
}
