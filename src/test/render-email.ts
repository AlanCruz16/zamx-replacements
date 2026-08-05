import type { ReactElement } from 'react';
import { render } from 'react-email';

/**
 * Un correo renderizado de verdad, y el texto que su destinatario llega a leer.
 *
 * Compartido por los tests de las tres plantillas porque las tres afirman sobre
 * lo mismo: lo que se ve. Un dato que llega al componente y no se pinta no le
 * sirve a nadie, y una prop no dice si el `**` de un Markdown a medio hacer
 * salió como énfasis o como dos asteriscos.
 *
 * La línea de Preview se descuenta: `react-email` la repite en el `<title>` y en
 * un bloque oculto marcado `data-skip-in-text`, que es lo que asoma en la
 * bandeja pero no es cuerpo del correo. Contarla haría que «el folio aparece una
 * sola vez» dependiera de un detalle del renderizador.
 */
export async function renderEmail(element: ReactElement) {
  const html = await render(element);
  const doc = new DOMParser().parseFromString(html, 'text/html');

  for (const hidden of doc.querySelectorAll('[data-skip-in-text]')) {
    hidden.remove();
  }

  // Los nodos de texto unidos por un espacio, y no `textContent` a secas: cada
  // frontera de etiqueta cuenta como espacio, porque si no dos elementos
  // contiguos pegan sus palabras y un «30 semanas» partido en dos no se
  // encuentra. Salen ya sin entidades, que es como el destinatario los lee.
  const chunks: string[] = [];
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    chunks.push(walker.currentNode.textContent ?? '');
  }

  const text = chunks
    .join(' ')
    // Los caracteres invisibles con los que el Preview rellena la bandeja.
    .replace(/[​-‏⁠﻿]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return { html, text };
}
