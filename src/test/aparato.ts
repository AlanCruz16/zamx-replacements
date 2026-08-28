import { vi } from 'vitest';
import { REDUCED_MOTION_QUERY } from '@/lib/decorative-motion';

/**
 * El aparato que hay delante, dicho para una prueba.
 *
 * Tres pruebas del ticket 11 necesitan lo mismo —un `matchMedia` que conteste
 * a la consulta de menos movimiento, y un ancho— y cada una lo montaba a mano;
 * de las tres copias sólo se diferenciaban los campos que a cada una le
 * importan. Es el mismo caso que `sourceFiles`, y se resuelve igual: uno solo,
 * en `src/test/`, con lo que sobra opcional.
 *
 * jsdom trae `matchMedia`, pero contesta `false` a todo y no evalúa nada, así
 * que un aparato que ha pedido menos movimiento no se puede describir sin
 * sustituirlo. `vi.restoreAllMocks()` en el `afterEach` de quien lo use lo
 * devuelve a su sitio.
 */
export function aparato({
  ancho,
  quieto = false,
  densidad,
}: {
  /** El ancho de la ventana. Se deja sin tocar si no importa para la prueba. */
  ancho?: number;
  /** Si se ha pedido menos movimiento. */
  quieto?: boolean;
  /** La densidad de la pantalla. Se deja sin tocar si no importa. */
  densidad?: number;
} = {}): void {
  if (ancho !== undefined) window.innerWidth = ancho;
  if (densidad !== undefined) window.devicePixelRatio = densidad;

  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === REDUCED_MOTION_QUERY ? quieto : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}
