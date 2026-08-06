import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { INTERNAL_API_ROUTES } from './internal-routes';

/**
 * La lista del proxy contra las rutas que de verdad piden el secreto interno.
 *
 * Esta prueba existe por un fallo concreto: el ticket 10 añadió
 * `/api/send-approver-reply`, nadie la añadió a la lista del proxy, y en
 * producción todas las llamadas a esa ruta contestaron 404 —`auth.protect()`
 * ante una petición de API sin sesión— sin que se ejecutara una sola línea del
 * manejador. El manejador sí tenía pruebas; lo que no las tenía era el proxy
 * que decide si llega a correr.
 *
 * Por eso la fuente de verdad no es otra lista escrita a mano, sino el propio
 * árbol de rutas: una ruta que llama a `authorizeInternalRequest` es una ruta
 * interna, y tiene que estar. Añadir la siguiente y olvidarse rompe aquí.
 */

const API_DIR = join(process.cwd(), 'src', 'app', 'api');

/** Las rutas bajo `src/app/api` cuyo manejador exige el secreto interno. */
function routesRequiringInternalSecret(): string[] {
  return readdirSync(API_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => {
      const handler = join(API_DIR, entry.name, 'route.ts');
      try {
        return readFileSync(handler, 'utf8').includes('authorizeInternalRequest');
      } catch {
        // Un directorio sin `route.ts` no es una ruta.
        return false;
      }
    })
    .map((entry) => `/api/${entry.name}`)
    .sort();
}

describe('la lista de rutas internas del proxy', () => {
  test('cubre todas las rutas que exigen el secreto interno', () => {
    expect([...INTERNAL_API_ROUTES].sort()).toEqual(routesRequiringInternalSecret());
  });

  test('incluye la ruta que contesta al Approver', () => {
    // Nombrada aparte del contraste de arriba: es la que faltaba, y la decisión
    // 10 entera —contestarle al Approver en vez de callar— depende de ella.
    expect(INTERNAL_API_ROUTES).toContain('/api/send-approver-reply');
  });

  test('no declara interna ninguna ruta que no pida el secreto', () => {
    // El otro sentido del mismo error: una ruta en la lista que no compruebe el
    // secreto se saltaría Clerk sin nada que ocupe su lugar.
    const requiring = routesRequiringInternalSecret();
    for (const route of INTERNAL_API_ROUTES) {
      expect(requiring).toContain(route);
    }
  });
});
