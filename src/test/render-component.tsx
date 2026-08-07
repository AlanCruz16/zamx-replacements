import { afterEach } from 'vitest';
import type * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * Montar un componente en jsdom y leer lo que el Customer vería.
 *
 * Vive aquí porque cada componente de chat necesita exactamente el mismo
 * andamio y ya iba por su tercera copia. Importar este módulo registra el
 * `afterEach` que desmonta: quien lo use no tiene que acordarse de limpiar.
 */

// React 19 exige declarar el entorno de `act` antes de montar nada.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let montado: { root: Root; container: HTMLElement } | null = null;

export function montar(elemento: React.ReactElement): HTMLElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(elemento);
  });
  montado = { root, container };
  return container;
}

afterEach(() => {
  if (!montado) return;
  const { root, container } = montado;
  act(() => root.unmount());
  container.remove();
  montado = null;
});

/** El spinner se reconoce por su animación, que es lo que el Customer percibe. */
export function haySpinner(container: HTMLElement): boolean {
  return container.querySelector('.animate-spin') !== null;
}
