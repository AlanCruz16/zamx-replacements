import { describe, expect, test } from 'vitest';
import { hasQuoteDocument } from './quote_document';

/**
 * La pregunta que el panel del Supervisor le hace a una Replacement Request
 * almacenada. Tiene que contestar lo mismo que la descarga del Customer, así
 * que se prueba contra las dos condiciones del glosario y nada más.
 */

const part = (confirmedPriceUSD?: number) => ({
  partNumber: 'ZA-123',
  model: 'FN063',
  quantity: 2,
  deliveryLocation: 'Querétaro',
  suggestedPriceUSD: 100,
  confirmedPriceUSD,
  suggestedDeliveryWeeksMin: 4,
  suggestedDeliveryWeeksMax: 6,
});

describe('hasQuoteDocument', () => {
  test('un Outcome con precio y todas las piezas con Confirmed Price tiene Quote Document', () => {
    expect(
      hasQuoteDocument({ outcome: 'priced_as_suggested', products: [part(100), part(250)] })
    ).toBe(true);
    expect(hasQuoteDocument({ outcome: 'priced_differently', products: [part(90)] })).toBe(true);
  });

  test('sin Outcome no hay Quote Document, aunque haya precios', () => {
    expect(hasQuoteDocument({ products: [part(100)] })).toBe(false);
  });

  test('un Outcome sin precio no tiene Quote Document, aunque haya precios', () => {
    expect(hasQuoteDocument({ outcome: 'discontinued', products: [part(100)] })).toBe(false);
    expect(hasQuoteDocument({ outcome: 'oem_restricted', products: [part(100)] })).toBe(false);
    expect(hasQuoteDocument({ outcome: 'blocked_pending_info', products: [part(100)] })).toBe(
      false
    );
  });

  test('una sola pieza sin Confirmed Price basta para que no haya Quote Document', () => {
    expect(
      hasQuoteDocument({ outcome: 'priced_as_suggested', products: [part(100), part()] })
    ).toBe(false);
  });

  test('un Confirmed Price de cero sigue siendo un precio', () => {
    expect(hasQuoteDocument({ outcome: 'priced_differently', products: [part(0)] })).toBe(true);
  });
});
