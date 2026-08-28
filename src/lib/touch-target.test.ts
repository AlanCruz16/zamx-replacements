/**
 * La guardia del mínimo de 44px.
 *
 * La clase `touch-target` es una promesa: los componentes la ponen y dan por
 * hecho que el área llega. Aquí se comprueba que la hoja de estilos la cumple,
 * porque una clase que no declara ningún mínimo no falla —no pinta nada— y
 * dejaría a las pestañas exactamente donde estaban.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { ROOT } from '@/test/source-files';
import {
  MIN_TOUCH_TARGET_PX,
  TOUCH_TARGET,
  touchTargetBlock,
  touchTargetMinimums,
} from './touch-target';

const GLOBALS = readFileSync(join(ROOT, 'src', 'app', 'globals.css'), 'utf8');

describe('el área mínima de un control', () => {
  test('la hoja de estilos define la utilidad con el nombre que usan los componentes', () => {
    expect(GLOBALS).toContain(`@utility ${TOUCH_TARGET} {`);
  });

  test('llega a 44px en los dos ejes', () => {
    expect(touchTargetMinimums(GLOBALS)).toEqual({
      minWidth: MIN_TOUCH_TARGET_PX,
      minHeight: MIN_TOUCH_TARGET_PX,
    });
  });

  test('el área crece por encima del control, sin desplazarlo', () => {
    // Centrado y fuera del flujo: es lo que separa agrandar el área de agrandar
    // el control, que es lo que el ticket prohíbe.
    const block = touchTargetBlock(GLOBALS);

    expect(block).toContain('position: absolute');
    expect(block).toContain('content: ');
  });

  test('se queda en `null` lo que una hoja no declare', () => {
    // Sin esto la comprobación de arriba pasaría el día que alguien borre los
    // mínimos y deje el bloque vacío.
    const sinMinimos = [`@utility ${TOUCH_TARGET} {`, '  position: relative;', '}'].join('\n');

    expect(touchTargetMinimums(sinMinimos)).toEqual({ minWidth: null, minHeight: null });
  });

  test('no se inventa una utilidad que la hoja no tiene', () => {
    expect(touchTargetMinimums('.otra-cosa { min-width: 44px; }')).toEqual({
      minWidth: null,
      minHeight: null,
    });
  });
});
