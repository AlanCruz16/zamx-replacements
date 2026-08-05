import { describe, expect, test } from 'vitest';
import * as React from 'react';
import { renderEmail } from '@/test/render-email';
import { ClientQuoteEmail } from './ClientQuoteEmail';
import { RejectedQuoteEmail } from './RejectedQuoteEmail';
import { NOTIFIABLE_OUTCOMES, type NotifiableOutcome } from '../../convex/lib/outcome';

/**
 * Los dos correos que ve el Customer, renderizados de verdad bajo jsdom.
 *
 * Son lo primero que le llega con la marca de la empresa después de que su
 * Replacement Request se decide, así que lo que se afirma es lo que él lee: que
 * no le llega sintaxis de Markdown en crudo, y que el código `REQ-XXXXXX`
 * aparece una sola vez y en su forma canónica. El glosario da un identificador
 * por Replacement Request; un `ZAMX-Q-REQ-A7F3K2` inventa un segundo esquema y
 * luego lo concatena con el primero.
 */

const REQUEST_ID = 'REQ-A7F3K2';

/** Cuántas veces aparece el código en el texto legible. */
function occurrences(text: string, needle: string) {
  return text.split(needle).length - 1;
}

// La lista de verdad, no una copia: un Outcome notificable nuevo entra aquí solo
// y llega sin redacción al test que exige que la tenga.
const OUTCOMES = NOTIFIABLE_OUTCOMES;

describe('el correo con el Quote Document', () => {
  test('no le manda al Customer los asteriscos de Markdown', async () => {
    const { html, text } = await renderEmail(
      React.createElement(ClientQuoteEmail, { fullName: 'Ana Márquez', requestId: REQUEST_ID })
    );

    expect(text).not.toContain('**');
    expect(html).not.toContain('**');
  });

  test('nombra la Replacement Request por su código, una sola vez en el cuerpo', async () => {
    const { text } = await renderEmail(
      React.createElement(ClientQuoteEmail, { fullName: 'Ana Márquez', requestId: REQUEST_ID })
    );

    expect(occurrences(text, REQUEST_ID)).toBe(1);
    // Y ningún segundo esquema de identificador pegado al código.
    expect(text).not.toContain('ZAMX-Q-');
  });

  test('le dice al Customer con quién hablar y a qué hacer referencia', async () => {
    const { text } = await renderEmail(
      React.createElement(ClientQuoteEmail, { fullName: 'Ana Márquez', requestId: REQUEST_ID })
    );

    expect(text).toContain('Ana Márquez');
    expect(text).toMatch(/PDF/);
  });
});

describe('el correo de un Outcome sin Quote Document', () => {
  test.each(OUTCOMES)(
    'el Outcome %s se le dice al Customer en términos accionables',
    async (outcome) => {
      const { html, text } = await renderEmail(
        React.createElement(RejectedQuoteEmail, {
          fullName: 'Ana Márquez',
          requestId: REQUEST_ID,
          outcome,
        })
      );

      expect(text).not.toContain('**');
      expect(html).not.toContain('**');
      expect(text).not.toContain('ZAMX-Q-');
      expect(occurrences(text, REQUEST_ID)).toBe(1);

      // Cada Outcome dice qué pasó y qué le toca hacer al Customer, no un genérico
      // «actualización de su cotización» que le deja sin siguiente paso.
      const accionable: Record<NotifiableOutcome, RegExp> = {
        oem_restricted: /fabricante/i,
        discontinued: /descontinuad|obsolet/i,
        blocked_pending_info: /información adicional|placa de datos/i,
      };
      expect(text).toMatch(accionable[outcome]);
    }
  );

  test('sin URL público configurado sale sin logo roto ni enlace a localhost', async () => {
    // El mismo fallo que el ticket 17 le quitó al Quote Document: el logo
    // colgaba de `NEXT_PUBLIC_APP_URL`, que sin configurar cae a
    // `http://localhost:3000`, y sólo resolvía en la máquina de quien lo
    // escribió. Al Customer le llegaba el icono de imagen rota.
    const { html } = await renderEmail(
      React.createElement(RejectedQuoteEmail, {
        fullName: 'Ana Márquez',
        requestId: REQUEST_ID,
        outcome: 'blocked_pending_info',
      })
    );

    expect(html).not.toContain('localhost');
    expect(html).not.toContain('logo_final.png');
  });

  test('con URL público configurado lleva el logo y la vuelta a la plataforma', async () => {
    const { html } = await renderEmail(
      React.createElement(RejectedQuoteEmail, {
        fullName: 'Ana Márquez',
        requestId: REQUEST_ID,
        outcome: 'blocked_pending_info',
        baseUrl: 'https://zamx.example.com',
      })
    );

    expect(html).toContain('https://zamx.example.com/logo_final.png');
    expect(html).toContain('href="https://zamx.example.com"');
  });

  test('lleva la explicación del propio Approver cuando la escribió', async () => {
    const { text } = await renderEmail(
      React.createElement(RejectedQuoteEmail, {
        fullName: 'Ana Márquez',
        requestId: REQUEST_ID,
        outcome: 'discontinued',
        explanation: 'El sustituto es el FN050; pídalo por separado.',
      })
    );

    expect(text).toContain('El sustituto es el FN050; pídalo por separado.');
  });

  test('no deja un hueco vacío cuando el Approver no explicó nada', async () => {
    const { text } = await renderEmail(
      React.createElement(RejectedQuoteEmail, {
        fullName: 'Ana Márquez',
        requestId: REQUEST_ID,
        outcome: 'oem_restricted',
      })
    );

    expect(text).not.toMatch(/Nota adicional/i);
  });
});
