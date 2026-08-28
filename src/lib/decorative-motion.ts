'use client';

import { useEffect, useState } from 'react';

/**
 * Cuánta animación decorativa admite el aparato que hay delante (ticket 11 de
 * «usable-on-a-phone»).
 *
 * Dos preguntas distintas que se contestaban por separado —o no se
 * contestaban—: si el aparato es lo bastante grande como para pagar un fondo
 * WebGL, y si quien lo usa ha pedido menos movimiento. `DottedSurface` se
 * hacía la primera a mano; el shader de las pantallas de acceso no se hacía
 * ninguna, y era el primer fondo que cualquiera carga. La segunda no se la
 * hacía nadie.
 *
 * Vive en un módulo porque los dos fondos tienen que contestarlas igual: el
 * ticket dice «la misma regla», y una regla copiada en dos sitios es una regla
 * que en el tercer cambio ya no es la misma. Lo que no cabe aquí son las
 * animaciones que pinta el CSS —el `fadeIn` de la bienvenida, el rebote del
 * indicador de escritura—: ésas las apaga `globals.css` con el mismo `@media`,
 * y este módulo sólo nombra la consulta para que ambos digan lo mismo.
 */

/** La consulta con la que el aparato dice que quiere menos movimiento. */
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * El ancho por debajo del cual un fondo WebGL no se monta. Es el que
 * `DottedSurface` ya usaba: el `md` de Tailwind, que es donde esta app deja de
 * maquetarse como un teléfono.
 */
export const MOBILE_BREAKPOINT_PX = 768;

/**
 * El tope de densidad al que se rasteriza un fondo WebGL.
 *
 * El shader es de precisión alta y pinta cada píxel de la pantalla en cada
 * fotograma, así que su coste va con el cuadrado de la densidad: a 3× son unos
 * tres millones de píxeles por fotograma, nueve veces los de 1×. Un fondo
 * borroso no se ve mejor por rasterizarlo a la densidad del aparato, y el
 * recorte no se nota en un degradado sin bordes.
 */
export const MAX_PIXEL_RATIO = 2;

/** La densidad a la que rasterizar, sin pasar de `MAX_PIXEL_RATIO`. */
export function cappedPixelRatio(devicePixelRatio: number): number {
  // Un aparato que no contesta densidad —o contesta algo que no es un número—
  // es 1×: es lo que vale un píxel CSS.
  if (!Number.isFinite(devicePixelRatio) || devicePixelRatio <= 0) return 1;
  return Math.min(devicePixelRatio, MAX_PIXEL_RATIO);
}

/**
 * Si el aparato pide menos movimiento.
 *
 * Contesta `false` hasta que hay algo montado, porque en el servidor no hay
 * aparato al que preguntar y el primer render tiene que decir lo mismo a los
 * dos lados. Quien lo use para dejar algo quieto lo dejará quieto un
 * fotograma más tarde, que es el lado por el que conviene equivocarse: lo otro
 * sería pintar en el servidor una pantalla que el cliente contradice.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;

    const query = window.matchMedia(REDUCED_MOTION_QUERY);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReduced(query.matches);

    // jsdom trae `matchMedia` pero no siempre la escucha; allí no cambia nada.
    if (typeof query.addEventListener !== 'function') return;

    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

/**
 * Si toca montar un fondo WebGL decorativo.
 *
 * Falso mientras no haya nada montado —el fondo es lo más caro que esta app
 * pinta, y montarlo en el servidor para desmontarlo al hidratar es pagarlo dos
 * veces—, falso por debajo del breakpoint y falso si se ha pedido menos
 * movimiento.
 */
export function useDecorativeBackground(): boolean {
  const reduced = usePrefersReducedMotion();
  const [wideEnough, setWideEnough] = useState(false);

  useEffect(() => {
    const measure = () => setWideEnough(window.innerWidth >= MOBILE_BREAKPOINT_PX);
    measure();

    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  return wideEnough && !reduced;
}

/**
 * El cuerpo del `@media (prefers-reduced-motion: reduce)` de una hoja de
 * estilos, o cadena vacía si no está. Lo lee la comprobación que vigila que la
 * hoja siga apagando las animaciones que no pasan por este módulo.
 */
export function reducedMotionBlock(css: string): string {
  const opening = css.indexOf(`@media ${REDUCED_MOTION_QUERY}`);
  if (opening === -1) return '';

  let depth = 0;
  for (let i = css.indexOf('{', opening); i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}' && --depth === 0) {
      return css.slice(css.indexOf('{', opening) + 1, i);
    }
  }
  return '';
}
