import { afterEach, describe, expect, test } from 'vitest';
import { montar } from '@/test/render-component';
import { COMPOSER_INSET, useComposerInset } from './composer-inset';

/**
 * Lo que el contenido reserva por debajo del compositor.
 *
 * La regla que se prueba no es un número —el alto del compositor depende de la
 * maquetación, y jsdom no tiene—: es que la reserva sea siempre lo medido, y que
 * un cero no cuente como medida. Ése es el único caso en el que este código
 * puede hacer daño de verdad: dar el cero por bueno dejaría al contenido sin
 * reservar nada y volvería a esconder la segunda tarjeta.
 */

/** Un compositor y el contenedor que publica lo que ocupa, como en la pantalla. */
function Pantalla() {
  const { composerRef, reserved } = useComposerInset();
  return (
    <div data-testid="contenedor" style={reserved}>
      <div ref={composerRef} data-testid="compositor" />
    </div>
  );
}

/** Lo que jsdom nunca contesta solo: un elemento con alto. */
function conAltoDe(pixeles: number) {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get: () => pixeles,
  });
}

afterEach(() => {
  Reflect.deleteProperty(HTMLElement.prototype, 'offsetHeight');
});

function reserva(container: HTMLElement): string {
  const contenedor = container.querySelector<HTMLElement>('[data-testid="contenedor"]')!;
  return contenedor.style.getPropertyValue(COMPOSER_INSET);
}

describe('el hueco que se le reserva al compositor', () => {
  test('es el alto que el compositor mide', () => {
    conAltoDe(202);

    expect(reserva(montar(<Pantalla />))).toBe('202px');
  });

  test('un cero no es una medida: no se publica nada y manda la hoja de estilos', () => {
    conAltoDe(0);

    // Vacío, no `0px`: la propiedad se queda sin escribir y el valor de partida
    // de `globals.css` sigue en pie.
    expect(reserva(montar(<Pantalla />))).toBe('');
  });
});
