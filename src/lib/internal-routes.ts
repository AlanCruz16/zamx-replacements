/**
 * Las rutas que Convex llama de servidor a servidor, con el secreto interno y
 * sin sesión de Clerk.
 *
 * Vive en su propio módulo, y no dentro de `proxy.ts`, para que se pueda leer
 * sin arrastrar `clerkMiddleware` —que se construye al cargar el módulo y pide
 * credenciales— a una prueba que sólo quiere comprobar una lista.
 *
 * Una ruta interna que falte en esta lista no falla como un permiso denegado:
 * cae en `auth.protect()`, que a una petición de API sin sesión le responde
 * **404**. Así estuvo `/api/send-approver-reply` desde el ticket 10 hasta que
 * un `REQ-` real lo destapó: la ruta existía, se desplegaba y no llegaba a
 * ejecutarse nunca, y con ella callaba en producción el mecanismo entero de la
 * decisión 10 —contestarle al Approver en vez de no hacer nada.
 *
 * `internal-routes.test.ts` contrasta esta lista contra las rutas que de verdad
 * piden el secreto, de modo que añadir una ruta interna y olvidarse de aquí
 * rompe una prueba en vez de devolver 404 en producción.
 */
export const INTERNAL_API_ROUTES = [
  '/api/send-client-quote',
  '/api/send-rejection-email',
  '/api/send-approver-reply',
] as const;
