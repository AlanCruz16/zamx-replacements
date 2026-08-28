'use client';

import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';

/**
 * El nombre por el que el contenido lee el alto que el compositor le quita
 * (ticket 05 de «usable-on-a-phone»).
 *
 * El compositor flota fijo al fondo, así que el contenido que pasa por debajo
 * tiene que reservarle sitio. Hasta aquí eran dos números escritos por separado
 * —el alto del compositor y el hueco que el contenido dejaba— que nadie obligaba
 * a coincidir, y no coincidían: en un teléfono de 390px la segunda tarjeta de la
 * bienvenida quedaba entera por detrás. Es la misma clase de defecto que un
 * total guardado que hay que recalcular a la vez que sus partes, y se arregla
 * igual: derivando en vez de duplicar.
 *
 * El valor de partida lo pone `globals.css`, porque en el primer render todavía
 * no hay nada medido y el servidor no mide nada nunca.
 */
export const COMPOSER_INSET = '--composer-inset';

/**
 * Medir el compositor y publicar lo que ocupa.
 *
 * Se mide en vez de sumarse a mano porque el compositor cambia de alto por su
 * cuenta: enseña un campo o un botón según la conversación esté abierta o
 * enviada, y su línea de copyright pasa a dos renglones en las pantallas más
 * estrechas de la lista. Cualquier suma escrita aquí sería otra vez un número
 * que se cae de acuerdo con lo que describe.
 *
 * `offsetHeight` ya incluye el `env(safe-area-inset-bottom)` que el compositor
 * se pone como padding, así que lo medido no vuelve a sumarlo.
 *
 * **Un cero no es una medida.** Es lo que contesta jsdom, que no tiene motor de
 * maquetación, y lo que contestaría un compositor todavía sin pintar; darlo por
 * bueno dejaría al contenido sin reservar nada. Mientras no haya medida de
 * verdad manda el valor de partida de la hoja de estilos.
 */
export function useComposerInset(): {
  composerRef: RefObject<HTMLDivElement | null>;
  reserved: CSSProperties | undefined;
} {
  const composerRef = useRef<HTMLDivElement>(null);
  const [occupied, setOccupied] = useState<number | null>(null);

  useEffect(() => {
    const composer = composerRef.current;
    if (!composer) return;

    const measure = () => setOccupied(composer.offsetHeight || null);
    measure();

    // jsdom no lo implementa, y allí no hay nada que volver a medir.
    if (typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(measure);
    observer.observe(composer);
    return () => observer.disconnect();
  }, []);

  return {
    composerRef,
    reserved:
      occupied === null ? undefined : ({ [COMPOSER_INSET]: `${occupied}px` } as CSSProperties),
  };
}
