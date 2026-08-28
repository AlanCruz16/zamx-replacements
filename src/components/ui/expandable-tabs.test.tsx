import { afterEach, describe, expect, test, vi } from 'vitest';
import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Globe, Home } from 'lucide-react';
import { ExpandableTabs, type TabItem } from './expandable-tabs';

/**
 * Las pestañas de la barra de navegación, pulsadas de verdad bajo jsdom.
 *
 * Lo único que se afirma aquí es el contrato que percibe quien las pulsa: una
 * pulsación, una acción. El control que más se nota es el de idioma, cuya
 * etiqueta dice `ES / en`; si hace falta pulsarlo dos veces, la etiqueta miente.
 *
 * Desde el ticket 07 el control también depende de la pantalla que lo pinta: con
 * ratón y sitio de sobra despliega la etiqueta de la pestaña elegida, y en un
 * teléfono no —desplegarla lo hacía crecer de 46px a 90px dentro de una
 * cabecera de 64px, que se partía en dos filas y recortaba los iconos—. Lo que
 * no cambia es el nombre accesible: quien no ve el icono tiene que oír de qué
 * pestaña se trata en las dos.
 */

// React 19 exige declarar el entorno de `act` antes de montar nada.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const TABS: TabItem[] = [
  { title: 'Inicio', icon: Home },
  { type: 'separator' },
  { title: 'ES / en', icon: Globe },
];

// Dos numeraciones distintas sobre la misma pestaña, y por eso van con nombre:
// el separador ocupa un hueco en `tabs` pero no pinta ningún botón.
const BOTON_IDIOMA = 1;
const INDICE_IDIOMA = 2;
const BOTON_INICIO = 0;

let montado: { root: Root; container: HTMLElement } | null = null;

/**
 * Qué pantalla pinta el control. jsdom no implementa `matchMedia`, así que sin
 * esto el control no tiene forma de saberlo y se queda en lo prudente: sólo
 * iconos. Cada prueba dice cuál de las dos pantallas le interesa.
 */
function declararPantalla(admiteEtiquetas: boolean) {
  vi.stubGlobal('matchMedia', (media: string) => ({
    media,
    matches: admiteEtiquetas,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

/** Monta las pestañas en un contenedor propio, que `afterEach` desmonta. */
function montarPestanas(
  onChange: (index: number | null) => void,
  { admiteEtiquetas = false }: { admiteEtiquetas?: boolean } = {}
) {
  declararPantalla(admiteEtiquetas);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<ExpandableTabs tabs={TABS} onChange={onChange} />);
  });
  montado = { root, container };
  return container;
}

afterEach(() => {
  vi.unstubAllGlobals();
  if (!montado) return;
  const { root, container } = montado;
  act(() => root.unmount());
  container.remove();
  montado = null;
});

/** Las pestañas reales, ya sin los separadores, que no son botones. */
function botones(container: HTMLElement) {
  return Array.from(container.querySelectorAll('button'));
}

/** El nombre que anuncia una pestaña, se vea o no su etiqueta. */
function nombreAccesible(button: HTMLElement) {
  return button.getAttribute('aria-label');
}

function pulsar(button: HTMLElement) {
  act(() => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

describe('ExpandableTabs', () => {
  test('la primera pulsación ya avisa, con el índice de la pestaña', () => {
    const onChange = vi.fn();
    const container = montarPestanas(onChange);

    pulsar(botones(container)[BOTON_IDIOMA]);

    expect(onChange).toHaveBeenCalledTimes(1);
    // El índice es el de `tabs`, separadores incluidos: el consumidor reparte
    // las acciones por esa posición.
    expect(onChange).toHaveBeenCalledWith(INDICE_IDIOMA);
  });

  test('cada pulsación avisa una sola vez, sin un `null` de propina', () => {
    const onChange = vi.fn();
    const container = montarPestanas(onChange);
    const idioma = botones(container)[BOTON_IDIOMA];

    pulsar(idioma);
    expect(onChange).toHaveBeenCalledTimes(1);

    // Volver al idioma anterior es otra pulsación sobre la misma pestaña, y
    // vale exactamente lo mismo que la primera.
    pulsar(idioma);
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenNthCalledWith(2, INDICE_IDIOMA);
    expect(onChange).not.toHaveBeenCalledWith(null);
  });

  test('con ratón y sitio de sobra, la pestaña pulsada muestra su título', () => {
    const onChange = vi.fn();
    const container = montarPestanas(onChange, { admiteEtiquetas: true });

    pulsar(botones(container)[BOTON_INICIO]);

    expect(container.textContent).toContain('Inicio');
    expect(container.textContent).not.toContain('ES / en');
  });

  test('en un teléfono, pulsar no despliega ninguna etiqueta', () => {
    const onChange = vi.fn();
    const container = montarPestanas(onChange, { admiteEtiquetas: false });

    pulsar(botones(container)[BOTON_INICIO]);

    // Ni la de la pestaña pulsada ni la de ninguna otra: la cabecera mide 64px
    // y el control tiene que caber en una sola fila pase lo que pase.
    expect(container.textContent).not.toContain('Inicio');
    expect(container.textContent).not.toContain('ES / en');
  });

  test('cada pestaña se anuncia por su nombre aunque no se vea su etiqueta', () => {
    const onChange = vi.fn();
    const container = montarPestanas(onChange, { admiteEtiquetas: false });

    expect(botones(container).map(nombreAccesible)).toEqual(['Inicio', 'ES / en']);

    // Pulsarla no le quita el nombre, que es lo único que tiene quien no ve el
    // icono.
    pulsar(botones(container)[BOTON_INICIO]);
    expect(nombreAccesible(botones(container)[BOTON_INICIO])).toBe('Inicio');
  });

  test('en un teléfono la pulsación sigue avisando a la primera', () => {
    const onChange = vi.fn();
    const container = montarPestanas(onChange, { admiteEtiquetas: false });

    pulsar(botones(container)[BOTON_IDIOMA]);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(INDICE_IDIOMA);
  });
});
