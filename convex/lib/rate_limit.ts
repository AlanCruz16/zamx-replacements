/**
 * Cuántas veces puede una identidad llamar a un recurso caro, y qué se le
 * contesta cuando se pasa.
 *
 * Existe por el endpoint del chat: cada petición corre `streamText` contra
 * Gemini con hasta cinco pasos de modelo, y un Customer autenticado —o un
 * script con una sesión válida— podía invocarlo sin tope ninguno. El propósito
 * es un **techo de gasto**, no estrangular a nadie: una Replacement Request de
 * varias piezas se resuelve en decenas de mensajes y nunca debe tropezar con
 * esto.
 *
 * La cuenta no puede vivir en el proceso del route handler —la ruta es una
 * función serverless: el contador no sobrevive entre invocaciones ni se
 * comparte entre instancias, así que no limitaría nada—, sino en una tabla de
 * Convex. Lo que vive aquí es sólo la aritmética, para poder pincharla sin base
 * de datos delante; quien la aplica transaccionalmente es `convex/rate_limit.ts`.
 */

/** Cuántas peticiones caben en cuánto tiempo. */
export type RateLimitPolicy = { limit: number; windowMs: number };

/** Lo que se recuerda de una identidad entre peticiones. Vive en una tabla. */
export type RateLimitWindow = {
  /** La primera petición de la ventana en curso. La ventana es fija, no deslizante. */
  windowStartedAt: number;
  count: number;
};

/**
 * El veredicto. Cuando se rechaza va `retryAfterMs`, que es lo que hace falta
 * para decirle al Customer cuándo volver en vez de sólo que no.
 */
export type RateLimitVerdict = { allowed: true } | { allowed: false; retryAfterMs: number };

/**
 * Cuarenta peticiones por hora e identidad. Una conversación honesta larga
 * —cuatro o cinco piezas, con correcciones de por medio— ronda los veinte
 * mensajes, así que el techo queda al doble: por debajo de eso limitaría al
 * Customer en vez de al gasto.
 */
export const CHAT_POLICY: RateLimitPolicy = { limit: 40, windowMs: 60 * 60 * 1000 };

/**
 * La clave de la tabla: la identidad de Clerk bajo el nombre del recurso. El
 * prefijo va porque la tabla es de todo el sistema y el chat es sólo el primero
 * que necesitó techo; sin él, el segundo recurso pisaría la ventana del chat.
 */
export function chatRateLimitKey(clerkId: string): string {
  return `chat:${clerkId}`;
}

/**
 * Apunta una petición contra la ventana de una identidad y devuelve la ventana
 * que hay que guardar junto con el veredicto.
 *
 * Devuelve la ventana en vez de escribirla para que la escritura y la lectura
 * queden dentro de una misma transacción de Convex: dos peticiones simultáneas
 * de la misma identidad no pueden colarse ambas por el mismo hueco.
 */
export function consumeWindow(
  existing: RateLimitWindow | undefined,
  policy: RateLimitPolicy,
  now: number
): { window: RateLimitWindow; verdict: RateLimitVerdict } {
  const expired = existing === undefined || now - existing.windowStartedAt >= policy.windowMs;

  if (expired) {
    return { window: { windowStartedAt: now, count: 1 }, verdict: { allowed: true } };
  }

  if (existing.count >= policy.limit) {
    // La ventana se devuelve intacta: si un rechazo contara o moviera el
    // arranque, quien insiste no recuperaría el acceso nunca.
    return {
      window: existing,
      verdict: { allowed: false, retryAfterMs: existing.windowStartedAt + policy.windowMs - now },
    };
  }

  return {
    window: { windowStartedAt: existing.windowStartedAt, count: existing.count + 1 },
    verdict: { allowed: true },
  };
}
