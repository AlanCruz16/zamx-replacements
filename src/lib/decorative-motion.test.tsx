/**
 * La regla que deciden los dos fondos y el mínimo que la hoja de estilos
 * promete cumplir (ticket 11 de «usable-on-a-phone»).
 *
 * Lo que se prueba no es que un shader se vea de una manera: jsdom no tiene
 * WebGL ni motor de maquetación. Es lo que puede volver a romperse —que un
 * teléfono monte el fondo caro, que la densidad se coja del aparato sin tope, y
 * que la hoja de estilos deje de apagar las animaciones que no pasan por este
 * módulo—.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { aparato } from '@/test/aparato';
import { montar } from '@/test/render-component';
import { ROOT } from '@/test/source-files';
import {
  MAX_PIXEL_RATIO,
  MOBILE_BREAKPOINT_PX,
  REDUCED_MOTION_QUERY,
  cappedPixelRatio,
  reducedMotionBlock,
  useDecorativeBackground,
  usePrefersReducedMotion,
} from './decorative-motion';

const GLOBALS = readFileSync(join(ROOT, 'src', 'app', 'globals.css'), 'utf8');

afterEach(() => {
  vi.restoreAllMocks();
});

/** Lee un hook booleano montándolo. */
function leer(hook: () => boolean): boolean {
  function Sonda() {
    return <span data-testid="respuesta">{String(hook())}</span>;
  }
  const contenido = montar(<Sonda />).querySelector('[data-testid="respuesta"]')!.textContent;
  return contenido === 'true';
}

describe('si toca montar un fondo decorativo', () => {
  test('no en un teléfono, por ancho que sea el aparato de al lado', () => {
    aparato({ ancho: MOBILE_BREAKPOINT_PX - 1, quieto: false });

    expect(leer(useDecorativeBackground)).toBe(false);
  });

  test('sí en un escritorio que no ha pedido menos movimiento', () => {
    aparato({ ancho: MOBILE_BREAKPOINT_PX, quieto: false });

    expect(leer(useDecorativeBackground)).toBe(true);
  });

  test('no en un escritorio que ha pedido menos movimiento', () => {
    aparato({ ancho: 1440, quieto: true });

    expect(leer(useDecorativeBackground)).toBe(false);
  });
});

describe('la petición de menos movimiento', () => {
  test('se le pregunta al aparato', () => {
    aparato({ ancho: 1440, quieto: true });

    expect(leer(usePrefersReducedMotion)).toBe(true);
  });

  test('un navegador sin `matchMedia` no deja la pantalla sin pintar', () => {
    // Contestar «quieto» aquí apagaría el movimiento en un navegador que no ha
    // pedido nada; contestar «no» es lo que ese navegador hacía antes.
    Reflect.deleteProperty(window, 'matchMedia');

    expect(leer(usePrefersReducedMotion)).toBe(false);
  });
});

describe('la densidad a la que se rasteriza un fondo', () => {
  test('se recorta en el tope', () => {
    expect(cappedPixelRatio(3)).toBe(MAX_PIXEL_RATIO);
  });

  test('un aparato por debajo del tope se queda como está', () => {
    expect(cappedPixelRatio(1)).toBe(1);
  });

  test('lo que no es una densidad vale 1×', () => {
    expect(cappedPixelRatio(0)).toBe(1);
    expect(cappedPixelRatio(Number.NaN)).toBe(1);
  });
});

describe('lo que la hoja de estilos apaga', () => {
  test('tiene un bloque para quien pide menos movimiento', () => {
    expect(GLOBALS).toContain(`@media ${REDUCED_MOTION_QUERY}`);
  });

  test('deja las animaciones sin duración, sin espera y en una sola vuelta', () => {
    const bloque = reducedMotionBlock(GLOBALS);

    // `!important` no es adorno: las animaciones vienen de utilidades de
    // Tailwind y de estilos en línea, y sin él pierde contra los dos.
    expect(bloque).toMatch(/animation-duration:\s*0\.01ms\s*!important/);
    expect(bloque).toMatch(/animation-delay:\s*0m?s\s*!important/);
    expect(bloque).toMatch(/animation-iteration-count:\s*1\s*!important/);
    expect(bloque).toMatch(/transition-duration:\s*0\.01ms\s*!important/);
  });

  test('alcanza a todo, no a una lista de clases', () => {
    // El `fadeIn` de la bienvenida y el rebote del indicador de escritura no
    // comparten ninguna clase; enumerarlas dejaría fuera la siguiente.
    expect(reducedMotionBlock(GLOBALS)).toMatch(/\*\s*,/);
  });

  test('los indicadores de progreso siguen girando', () => {
    // Un `animate-spin` congelado no es «menos movimiento», es una app colgada:
    // es la única señal de que algo sigue en marcha. Se piden por su clase
    // porque no hay nada más que los distinga de un adorno.
    const bloque = reducedMotionBlock(GLOBALS);

    for (const utilidad of ['.animate-spin', '.animate-pulse']) {
      expect(bloque).toContain(utilidad);
    }
    expect(bloque).toMatch(/animation-iteration-count:\s*infinite\s*!important/);
  });

  test('no se inventa un bloque que la hoja no tiene', () => {
    expect(reducedMotionBlock('body { color: red; }')).toBe('');
  });

  test('lee el bloque entero aunque lleve reglas anidadas', () => {
    const hoja = [
      `@media ${REDUCED_MOTION_QUERY} {`,
      '  .a { animation: none; }',
      '  .b { transition: none; }',
      '}',
      '.fuera { color: red; }',
    ].join('\n');

    const bloque = reducedMotionBlock(hoja);
    expect(bloque).toContain('.b');
    expect(bloque).not.toContain('.fuera');
  });
});
