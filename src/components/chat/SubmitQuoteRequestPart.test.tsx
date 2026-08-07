import { describe, expect, test } from 'vitest';
import { haySpinner, montar } from '@/test/render-component';
import { SubmitQuoteRequestPart } from './SubmitQuoteRequestPart';

/**
 * Lo que el Customer ve mientras se envía su Replacement Request, y después.
 *
 * El spinner sólo tiene sentido mientras se espera la salida de la herramienta:
 * si sigue girando cuando ya hay salida, el Customer no sabe si su Replacement
 * Request llegó. Y nada de lo que se pinte aquí puede mencionar precio ni
 * entrega — a esta altura ya existe un Suggested Price, que no debe llegarle
 * nunca.
 */

const SALIDA_EXITOSA = {
  success: true,
  message: 'Datos recibidos y cotización generada exitosamente.',
  requestId: 'REQ-4B7K2Z',
};

describe('SubmitQuoteRequestPart', () => {
  describe('mientras se espera la salida', () => {
    for (const state of [
      'input-streaming',
      'input-available',
      'approval-requested',
      'approval-responded',
    ] as const) {
      test(`${state} gira y dice que se está enviando`, () => {
        const container = montar(<SubmitQuoteRequestPart state={state} isEs={true} />);

        expect(haySpinner(container)).toBe(true);
        expect(container.textContent).toMatch(/enviando/i);
      });
    }
  });

  describe('cuando la herramienta termina bien', () => {
    test('detiene el spinner', () => {
      const container = montar(
        <SubmitQuoteRequestPart state="output-available" output={SALIDA_EXITOSA} isEs={true} />
      );

      expect(haySpinner(container)).toBe(false);
    });

    test('nombra el folio y dice que un vendedor lo revisará', () => {
      const container = montar(
        <SubmitQuoteRequestPart state="output-available" output={SALIDA_EXITOSA} isEs={true} />
      );

      expect(container.textContent).toContain('REQ-4B7K2Z');
      expect(container.textContent).toMatch(/vendedor/i);
    });

    test('en inglés también nombra el folio y a quien la revisará', () => {
      const container = montar(
        <SubmitQuoteRequestPart state="output-available" output={SALIDA_EXITOSA} isEs={false} />
      );

      expect(container.textContent).toContain('REQ-4B7K2Z');
      expect(container.textContent).toMatch(/salesperson/i);
    });

    // Ni el Suggested Price ni la entrega pueden asomarse en la confirmación,
    // por mucho que ambos existan ya cuando ésta se pinta (ticket 07).
    for (const isEs of [true, false]) {
      test(`no menciona precio ni entrega (isEs=${isEs})`, () => {
        const container = montar(
          <SubmitQuoteRequestPart state="output-available" output={SALIDA_EXITOSA} isEs={isEs} />
        );

        expect(container.textContent).not.toMatch(
          /precio|costo|total|USD|\$|entrega|price|cost|delivery|lead time/i
        );
      });
    }

    // Un envío que salió bien salió bien: la Replacement Request ya está
    // registrada, así que decirle al Customer que reintente le costaría un
    // duplicado. Sin folio se confirma igual, sólo que sin código.
    test('el éxito sin folio se confirma igual, no se convierte en fallo', () => {
      const container = montar(
        <SubmitQuoteRequestPart
          state="output-available"
          output={{ success: true, message: 'ok' }}
          isEs={true}
        />
      );

      expect(haySpinner(container)).toBe(false);
      expect(container.textContent).not.toMatch(/no se envió/i);
      expect(container.textContent).toMatch(/vendedor/i);
    });
  });

  describe('cuando la Replacement Request no se envía', () => {
    test('la salida con success falso detiene el spinner y lo dice', () => {
      const container = montar(
        <SubmitQuoteRequestPart
          state="output-available"
          output={{ success: false, message: 'Hubo un error al procesar tu solicitud.' }}
          isEs={true}
        />
      );

      expect(haySpinner(container)).toBe(false);
      expect(container.textContent).toMatch(/no se envió/i);
      expect(container.textContent).toMatch(/intenta de nuevo/i);
    });

    test('output-error detiene el spinner y lo dice', () => {
      const container = montar(<SubmitQuoteRequestPart state="output-error" isEs={true} />);

      expect(haySpinner(container)).toBe(false);
      expect(container.textContent).toMatch(/no se envió/i);
      expect(container.textContent).toMatch(/intenta de nuevo/i);
    });

    test('output-error en inglés dice que no se envió y que reintente', () => {
      const container = montar(<SubmitQuoteRequestPart state="output-error" isEs={false} />);

      expect(container.textContent).toMatch(/was not submitted/i);
      expect(container.textContent).toMatch(/try again/i);
    });
  });

  // El bug que arregla el ticket 16 es un spinner que nunca para. Un estado que
  // no reconocemos no puede volver a caer en él por descuido, ni afirmar nada.
  test('un estado desconocido no pinta nada, ni siquiera el spinner', () => {
    const container = montar(
      <SubmitQuoteRequestPart
        state={undefined as unknown as undefined}
        output={undefined}
        isEs={true}
      />
    );

    expect(haySpinner(container)).toBe(false);
    expect(container.textContent).toBe('');
  });
});
