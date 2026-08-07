import { describe, expect, test } from 'vitest';
import { haySpinner, montar } from '@/test/render-component';
import { MessagePart } from './MessagePart';

/**
 * El reparto de parts de la pantalla del Customer.
 *
 * Lo que el ticket 26 tenía que arreglar es la part de texto del asistente: se
 * pintaba verbatim y el Customer leía los asteriscos. Lo que no podía tocar es
 * la tarjeta de confirmación del ticket 16, que está unos pixeles más arriba.
 */

describe('MessagePart', () => {
  describe('la part de texto del asistente', () => {
    test('pinta el énfasis en lugar de los asteriscos literales', () => {
      const container = montar(
        <MessagePart
          part={{ type: 'text', text: '**Número de parte:** 175168/A01' }}
          role="assistant"
          isEs={true}
        />
      );

      expect(container.querySelector('strong')?.textContent).toBe('Número de parte:');
      expect(container.textContent).not.toContain('**');
      expect(container.textContent).toContain('175168/A01');
    });

    test('la lista que emite el modelo se pinta como lista', () => {
      const container = montar(
        <MessagePart
          part={{ type: 'text', text: '*   **Modelo:** GR45C-ZID.GG.CR' }}
          role="assistant"
          isEs={true}
        />
      );

      expect(container.querySelectorAll('li')).toHaveLength(1);
      expect(container.textContent).not.toContain('*');
    });
  });

  // Lo que el Customer escribió es suyo y se lee tal cual: si teclea un
  // `**` o un número de parte con guiones bajos, eso es lo que ve de vuelta.
  test('la part de texto del Customer se respeta literal', () => {
    const container = montar(
      <MessagePart part={{ type: 'text', text: '**GR45C**' }} role="user" isEs={true} />
    );

    expect(container.querySelector('strong')).toBeNull();
    expect(container.textContent).toBe('**GR45C**');
  });

  describe('la tarjeta del ticket 16 sigue intacta', () => {
    test('mientras se espera la salida, gira', () => {
      const container = montar(
        <MessagePart
          part={{ type: 'tool-submit_quote_request', state: 'input-available' }}
          role="assistant"
          isEs={true}
        />
      );

      expect(haySpinner(container)).toBe(true);
      expect(container.textContent).toMatch(/enviando/i);
    });

    test('con salida exitosa nombra el folio y detiene el spinner', () => {
      const container = montar(
        <MessagePart
          part={{
            type: 'tool-submit_quote_request',
            state: 'output-available',
            output: { success: true, message: 'ok', requestId: 'REQ-4B7K2Z' },
          }}
          role="assistant"
          isEs={true}
        />
      );

      expect(haySpinner(container)).toBe(false);
      expect(container.textContent).toContain('REQ-4B7K2Z');
      expect(container.textContent).toMatch(/vendedor/i);
    });

    test('con output-error dice que no se envió', () => {
      const container = montar(
        <MessagePart
          part={{ type: 'tool-submit_quote_request', state: 'output-error' }}
          role="assistant"
          isEs={true}
        />
      );

      expect(haySpinner(container)).toBe(false);
      expect(container.textContent).toMatch(/no se envió/i);
    });

    // El nombre puede venir por `part.toolName` cuando la herramienta es
    // dinámica; el reparto tiene que dar con la misma tarjeta.
    test('llega igual por dynamic-tool', () => {
      const container = montar(
        <MessagePart
          part={{
            type: 'dynamic-tool',
            toolName: 'submit_quote_request',
            state: 'output-available',
            output: { success: true, message: 'ok', requestId: 'REQ-4B7K2Z' },
          }}
          role="assistant"
          isEs={true}
        />
      );

      expect(container.textContent).toContain('REQ-4B7K2Z');
    });
  });

  test('la guía de la placa de datos sigue pintándose', () => {
    const container = montar(
      <MessagePart
        part={{ type: 'tool-show_dataplate_guide', state: 'output-available' }}
        role="assistant"
        isEs={true}
      />
    );

    expect(container.textContent).toMatch(/placa de datos/i);
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/images/dataplate-guide.jpg');
  });

  test('una herramienta que no reconocemos no pinta nada', () => {
    const container = montar(
      <MessagePart
        part={{ type: 'tool-algo_que_no_existe', state: 'output-available' }}
        role="assistant"
        isEs={true}
      />
    );

    expect(container.textContent).toBe('');
  });

  test('una part de otro tipo no pinta nada', () => {
    const container = montar(
      <MessagePart part={{ type: 'step-start' }} role="assistant" isEs={true} />
    );

    expect(container.textContent).toBe('');
  });
});
