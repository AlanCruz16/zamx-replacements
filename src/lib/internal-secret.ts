/**
 * La regla del secreto interno. Una sola vez, sin dependencias, para que la
 * compartan los tres sitios que la aplican: el middleware (`src/proxy.ts`), los
 * route handlers de Next y la frontera HTTP de Convex (`convex/http.ts`).
 *
 * La regla es que **una variable ausente no es una denegación**:
 *
 * - no configurada → 500 con un mensaje que dice `INTERNAL_API_SECRET`
 * - secreto equivocado o ausente en la petición → 401 «No autorizado»
 *
 * El 2026-08-02 `INTERNAL_API_SECRET` estaba puesto en Vercel pero no en el
 * despliegue de Convex, así que cada solicitud moría con «No autorizado» y el
 * chatbot le decía a cada Customer que su Replacement Request no podía
 * registrarse. Se leyó como un fallo de autorización y costó una investigación
 * entera llegar a la variable. Que las dos causas se distingan es todo el
 * asunto; que se distingan **igual en todas partes** es por lo que esto vive en
 * un solo módulo.
 */

export const MISSING_SECRET_ERROR = 'INTERNAL_API_SECRET no está configurado';
export const UNAUTHORIZED_ERROR = 'No autorizado';

/** El secreto configurado. Lanza nombrando la variable si no lo está. */
export function requireInternalSecret(): string {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) {
    throw new Error(MISSING_SECRET_ERROR);
  }
  return secret;
}

export type InternalAuthFailure = { status: 401 | 500; error: string };

/**
 * Autoriza una petición entrante de máquina a máquina. Devuelve `null` cuando
 * pasa, y si no el estado y el mensaje con los que responder.
 */
export function authorizeInternalRequest(req: Request): InternalAuthFailure | null {
  const configured = process.env.INTERNAL_API_SECRET;
  if (!configured) {
    return { status: 500, error: MISSING_SECRET_ERROR };
  }

  if (req.headers.get('x-internal-secret') !== configured) {
    return { status: 401, error: UNAUTHORIZED_ERROR };
  }

  return null;
}
