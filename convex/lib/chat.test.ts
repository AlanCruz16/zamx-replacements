import { describe, expect, test } from 'vitest';
import { findSubmission, toStoredMessages, toolNameOfPart } from './chat';

/**
 * Seam 1 — la aritmética de la conversación, sin base de datos delante.
 *
 * Lo que se afirma aquí es lo que decide dos cosas irreversibles: si una
 * conversación ya produjo una Replacement Request (y por tanto no puede
 * producir otra), y qué se guarda de cada mensaje.
 */

/** Una tool part de v6 tal y como la emite el AI SDK. */
function submitPart(overrides: Record<string, unknown> = {}) {
  return {
    type: 'tool-submit_quote_request',
    toolCallId: 'call_1',
    state: 'output-available',
    input: { products: [] },
    output: { success: true, quoteId: 'k17abc', requestId: 'REQ-ABC123' },
    ...overrides,
  };
}

describe('de qué herramienta es una part', () => {
  test('el nombre viaja en el tipo de una tool part estática', () => {
    expect(toolNameOfPart({ type: 'tool-show_dataplate_guide' })).toBe('show_dataplate_guide');
  });

  test('y en `toolName` cuando la part es dinámica', () => {
    expect(toolNameOfPart({ type: 'dynamic-tool', toolName: 'submit_quote_request' })).toBe(
      'submit_quote_request'
    );
  });

  test('una part que no es de herramienta no tiene nombre de herramienta', () => {
    expect(toolNameOfPart({ type: 'text', text: 'hola' })).toBeUndefined();
    expect(toolNameOfPart({ type: 'step-start' })).toBeUndefined();
    expect(toolNameOfPart(null)).toBeUndefined();
  });
});

describe('si la conversación ya produjo una Replacement Request', () => {
  test('una conversación corriente no ha producido ninguna', () => {
    expect(
      findSubmission([
        { role: 'user', parts: [{ type: 'text', text: 'Quiero cotizar' }] },
        { role: 'assistant', parts: [{ type: 'text', text: '¿Número de parte?' }] },
      ])
    ).toBeUndefined();
  });

  test('un envío con salida trae el identificador de la Replacement Request', () => {
    expect(
      findSubmission([
        { role: 'assistant', parts: [{ type: 'text', text: 'Listo' }] },
        { role: 'assistant', parts: [submitPart()] },
      ])
    ).toEqual({ quoteId: 'k17abc' });
  });

  test('también cuando la part llega como herramienta dinámica', () => {
    expect(
      findSubmission([
        {
          role: 'assistant',
          parts: [submitPart({ type: 'dynamic-tool', toolName: 'submit_quote_request' })],
        },
      ])
    ).toEqual({ quoteId: 'k17abc' });
  });

  /**
   * El caso que separa «se envió» de «se intentó enviar». La herramienta
   * devuelve `success: false` cuando Convex rechazó la escritura, y entonces no
   * existe ninguna Replacement Request: cerrar la conversación ahí dejaría al
   * Customer sin poder reintentar lo que nunca llegó a registrarse.
   */
  test('un intento fallido no cuenta como envío', () => {
    expect(
      findSubmission([
        {
          role: 'assistant',
          parts: [submitPart({ output: { success: false, message: 'Error' } })],
        },
      ])
    ).toBeUndefined();
  });

  test('una herramienta que reventó tampoco cuenta', () => {
    expect(
      findSubmission([
        {
          role: 'assistant',
          parts: [submitPart({ state: 'output-error', output: undefined, errorText: 'boom' })],
        },
      ])
    ).toBeUndefined();
  });

  test('una llamada todavía sin salida tampoco cuenta', () => {
    expect(
      findSubmission([
        {
          role: 'assistant',
          parts: [submitPart({ state: 'input-available', output: undefined })],
        },
      ])
    ).toBeUndefined();
  });

  test('la guía de la placa de datos no es un envío', () => {
    expect(
      findSubmission([
        {
          role: 'assistant',
          parts: [
            submitPart({
              type: 'tool-show_dataplate_guide',
              output: { success: true, quoteId: 'x' },
            }),
          ],
        },
      ])
    ).toBeUndefined();
  });

  test('un envío sin identificador se reconoce igual como envío', () => {
    // Que hubo envío y *cuál* Replacement Request salió de él son dos hechos:
    // la conversación se cierra aunque el segundo falte, porque el primero ya
    // ocurrió y no puede volver a ocurrir.
    expect(
      findSubmission([{ role: 'assistant', parts: [submitPart({ output: { success: true } })] }])
    ).toEqual({});
  });
});

describe('qué se guarda de cada mensaje', () => {
  /**
   * El punto entero del ticket: `parts[]` se guarda tal cual. Aplanarlo a un
   * `content` perdería la tool part, que es como se le vuelve a pintar al
   * Customer la confirmación de su Replacement Request al reanudar.
   */
  test('las parts se guardan enteras, incluidas las de herramienta', () => {
    const parts = [{ type: 'text', text: 'Enviado' }, submitPart()];

    const [almacenado] = toStoredMessages([{ id: 'msg_1', role: 'assistant', parts }]);

    expect(almacenado).toEqual({ messageId: 'msg_1', role: 'assistant', parts });
  });

  test('el `id` del mensaje se conserva, para que reenviarlo no lo duplique', () => {
    const stored = toStoredMessages([
      { id: 'msg_1', role: 'user', parts: [{ type: 'text', text: 'hola' }] },
      { id: 'msg_2', role: 'assistant', parts: [{ type: 'text', text: 'buenas' }] },
    ]);

    expect(stored.map((m) => m.messageId)).toEqual(['msg_1', 'msg_2']);
  });

  test('nada más del mensaje viaja a la tabla', () => {
    // El AI SDK cuelga del mensaje cosas que no son nuestras —`metadata`, por
    // ejemplo—, y la tabla guarda sólo las tres que sabe describir.
    const conMetadata = {
      id: 'msg_1',
      role: 'user',
      parts: [{ type: 'text', text: 'hola' }],
      metadata: { origen: 'navegador' },
    };

    const [almacenado] = toStoredMessages([conMetadata]);

    expect(Object.keys(almacenado).sort()).toEqual(['messageId', 'parts', 'role']);
  });

  test('un mensaje sin id no se guarda: sin él no hay forma de reconciliarlo', () => {
    const stored = toStoredMessages([
      { role: 'assistant', parts: [{ type: 'text', text: 'hola' }] },
      { id: 'msg_2', role: 'assistant', parts: [{ type: 'text', text: 'buenas' }] },
    ]);

    expect(stored.map((m) => m.messageId)).toEqual(['msg_2']);
  });
});
