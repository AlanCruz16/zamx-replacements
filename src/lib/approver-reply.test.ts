import { describe, expect, test } from 'vitest';
import { composeApproverReply } from './approver-reply';

/**
 * Lo que se le contesta al Approver cuando el sistema no puede actuar. Se prueba
 * el texto porque el texto es lo entregable: el Approver decide sobre lo que
 * lee, y un mensaje que no dice qué cifra se leyó no le sirve para contestar.
 */

describe('el asunto', () => {
  test('lleva el folio, para que la respuesta a esta respuesta se reconozca', () => {
    const { subject } = composeApproverReply({
      requestId: 'REQ-ABC123',
      reason: 'low_confidence',
    });

    expect(subject).toContain('REQ-ABC123');
  });
});

describe('no se entendió la respuesta', () => {
  const { text } = composeApproverReply({ requestId: 'REQ-ABC123', reason: 'low_confidence' });

  test('dice que la Replacement Request sigue en revisión y que al Customer no se le dijo nada', () => {
    expect(text).toContain('sigue en revisión');
    expect(text).toContain('no se le ha enviado nada al');
  });

  test('enumera las decisiones que sí se entienden, que es lo que hace contestable el mensaje', () => {
    for (const decision of ['OEM', 'descontinuada', 'más información']) {
      expect(text).toContain(decision);
    }
  });
});

describe('un precio fuera de banda', () => {
  const { text } = composeApproverReply({
    requestId: 'REQ-ABC123',
    reason: 'price_out_of_bounds',
    prices: [{ partNumber: 'P-001', priceUSD: 17_000, suggestedPriceUSD: 1000 }],
  });

  test('dice el Suggested Price, el precio leído y que no se registró la decisión', () => {
    expect(text).toContain('P-001');
    expect(text).toContain('$1,000.00 USD');
    expect(text).toContain('$17,000.00 USD');
    expect(text).toContain('no se ha registrado');
    expect(text).toContain('sigue en revisión');
  });

  test('cada cifra lleva su moneda escrita: es la mitad humana del desliz de moneda', () => {
    // La banda coge la cifra en pesos leída como dólares; decir «USD» en cada
    // número es lo que evita que vuelva a mandarse en pesos.
    expect(text).not.toMatch(/\$[\d,]+\.\d{2}(?! USD)/);
    expect(text).toContain('pesos');
  });

  test('pide confirmación en vez de descartar la cifra', () => {
    expect(text).toContain('confírmelo');
  });
});

describe('un precio para una pieza ajena a la Replacement Request', () => {
  test('nombra la pieza y la cifra leída, que es lo que delata el número mal leído', () => {
    const { text } = composeApproverReply({
      requestId: 'REQ-ABC123',
      reason: 'price_for_unknown_part',
      prices: [{ partNumber: 'P-999', priceUSD: 300 }],
    });

    expect(text).toContain('P-999');
    expect(text).toContain('$300.00 USD');
    expect(text).toContain('no están en esta solicitud');
    // Sin precios fuera de banda no se habla de la banda: el problema es el
    // número de parte.
    expect(text).not.toContain('margen');
  });
});

describe('una respuesta con las dos clases de precio', () => {
  // El veredicto nombra un solo motivo, pero una misma respuesta puede traer
  // los dos. Cada pieza tiene que aparecer bajo su propia razón.
  const { text } = composeApproverReply({
    requestId: 'REQ-ABC123',
    reason: 'price_out_of_bounds',
    prices: [
      { partNumber: 'P-001', priceUSD: 17_000, suggestedPriceUSD: 1000 },
      { partNumber: 'P-999', priceUSD: 300 },
    ],
  });

  test('la pieza desconocida no se cuenta como cifra fuera de rango', () => {
    const fueraDeBanda = text.indexOf('margen');
    const desconocida = text.indexOf('no están en esta solicitud');

    expect(fueraDeBanda).toBeGreaterThan(-1);
    expect(desconocida).toBeGreaterThan(-1);
    expect(text.indexOf('P-001')).toBeGreaterThan(fueraDeBanda);
    expect(text.indexOf('P-001')).toBeLessThan(desconocida);
    expect(text.indexOf('P-999')).toBeGreaterThan(desconocida);
  });
});

describe('la Replacement Request ya tenía Outcome', () => {
  test('dice cuál era y que esta respuesta no se aplicó', () => {
    const { text } = composeApproverReply({
      requestId: 'REQ-ABC123',
      reason: 'already_settled',
      outcome: 'discontinued',
    });

    expect(text).toContain('descontinuada');
    expect(text).toContain('NO se aplicó');
  });

  test('cada Outcome se nombra en palabras, nunca con el literal del glosario', () => {
    for (const outcome of [
      'priced_as_suggested',
      'priced_differently',
      'oem_restricted',
      'discontinued',
      'blocked_pending_info',
    ] as const) {
      const { text } = composeApproverReply({
        requestId: 'REQ-ABC123',
        reason: 'already_settled',
        outcome,
      });

      expect(text).not.toContain(outcome);
    }
  });
});
