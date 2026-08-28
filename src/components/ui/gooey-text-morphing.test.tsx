/**
 * La palabra que cambia en la bienvenida (ticket 11 de «usable-on-a-phone»).
 *
 * Quien ha pedido menos movimiento tiene que seguir pudiendo leerla, y eso no
 * es lo mismo que cortar el bucle: los `span` de la versión animada nacen
 * vacíos y es el bucle quien les pone el texto, así que cortarlo sin más deja
 * la bienvenida en blanco. Eso es lo que se comprueba aquí —que hay una
 * palabra— y no cuántos `requestAnimationFrame` se piden.
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { aparato } from '@/test/aparato';
import { montar } from '@/test/render-component';
import { GooeyText } from './gooey-text-morphing';

const PALABRAS = ['Ventiladores', 'Motores', 'Refacciones'];

/**
 * Un reloj de fotogramas del que se puede preguntar si queda alguien esperando.
 * Contar llamadas no distingue un bucle vivo de uno arrancado y cortado, que es
 * justo lo que pasa aquí en el primer render.
 */
function relojFalso(): Map<number, FrameRequestCallback> {
  const pendientes = new Map<number, FrameRequestCallback>();
  let siguiente = 1;

  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    const id = siguiente++;
    pendientes.set(id, callback);
    return id;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
    pendientes.delete(id);
  });

  return pendientes;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('la palabra que cambia', () => {
  test('quieta, se lee', () => {
    aparato({ quieto: true });

    const contenedor = montar(<GooeyText texts={PALABRAS} />);

    expect(contenedor.textContent).toContain(PALABRAS[0]);
  });

  test('quieta, no pasa por el filtro que sólo es legible con desenfoque', () => {
    aparato({ quieto: true });

    const contenedor = montar(<GooeyText texts={PALABRAS} />);

    expect(contenedor.innerHTML).not.toContain('url(#threshold)');
  });

  test('quieta, no queda ningún bucle pidiendo fotogramas', () => {
    aparato({ quieto: true });
    const pendientes = relojFalso();

    montar(<GooeyText texts={PALABRAS} />);

    // El primer render todavía no sabe lo que pide el aparato —en el servidor
    // no hay a quién preguntar—, así que el bucle puede llegar a arrancar; lo
    // que no puede es seguir. Cero pendientes es eso: nadie va a repintar.
    expect(pendientes.size).toBe(0);
  });

  test('sin pedir nada, sigue animándose como antes', () => {
    aparato({ quieto: false });
    const pendientes = relojFalso();

    const contenedor = montar(<GooeyText texts={PALABRAS} />);

    expect(pendientes.size).toBeGreaterThan(0);
    expect(contenedor.querySelector('[style*="threshold"]')).not.toBeNull();
  });
});
