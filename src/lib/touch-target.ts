/**
 * El mínimo que tiene que medir cualquier cosa que un Customer toque con el
 * pulgar (ticket 10 de «usable-on-a-phone»).
 *
 * Medido antes de tocarlo: las pestañas de la barra iban a 36×36, el botón de
 * cerrar el panel a 36×36, el de enviar a 42×42 y el enlace al Quote Document a
 * 32px de alto. Ninguno llegaba a 44, y las pestañas son lo que más se pulsa.
 *
 * Lo que no se toca es cómo se ven. Crecer el control cambia el dibujo —el
 * resaltado de la pestaña elegida, el círculo del botón de enviar—, así que lo
 * que crece es el área, con un pseudoelemento centrado sobre el control que
 * llega a 44px aunque el control mida menos. Un pseudoelemento pertenece a su
 * elemento: pulsarlo es pulsar el botón.
 *
 * Este módulo no pinta; sólo pone nombre a la regla para que la clase y la
 * comprobación que la vigila digan el mismo número.
 */

/** La clase que agranda el área de un control sin agrandar el control. */
export const TOUCH_TARGET = 'touch-target';

/** El mínimo, en píxeles. Es el de las guías de iOS, que es el más exigente. */
export const MIN_TOUCH_TARGET_PX = 44;

/** Lo que la utilidad `touch-target` promete medir, leído del CSS que la define. */
export type TouchTargetMinimums = { minWidth: number | null; minHeight: number | null };

/**
 * El cuerpo de `@utility touch-target` dentro de una hoja de estilos, o cadena
 * vacía si no está. Se exporta porque la comprobación mira el bloque por dos
 * motivos distintos —cuánto promete y cómo lo consigue— y con dos copias del
 * mismo recorte una de las dos se queda atrás en cuanto cambie el espaciado.
 */
export function touchTargetBlock(css: string): string {
  return css.match(new RegExp(`@utility\\s+${TOUCH_TARGET}\\s*\\{([\\s\\S]*?)\\n\\}`))?.[1] ?? '';
}

/**
 * Los mínimos declarados dentro de `@utility touch-target` en una hoja de
 * estilos. Devuelve `null` en lo que no encuentre: una clase que promete un
 * área y no la declara es exactamente el fallo que hay que ver.
 */
export function touchTargetMinimums(css: string): TouchTargetMinimums {
  const body = touchTargetBlock(css);

  const read = (property: string) => {
    const found = body.match(new RegExp(`${property}\\s*:\\s*(\\d+(?:\\.\\d+)?)px`));
    return found ? Number(found[1]) : null;
  };

  return { minWidth: read('min-width'), minHeight: read('min-height') };
}
