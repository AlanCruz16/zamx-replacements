import { afterEach, describe, expect, test } from 'vitest';
import type { Doc } from '../../convex/_generated/dataModel';
import { quoteDocumentProps } from './quote-document-props';

/**
 * Las fechas del Quote Document son las de ZIEHL-ABEGG México, que es quien lo
 * emite, y no las de la máquina que lo renderiza. Las funciones de Vercel corren
 * en UTC: una Replacement Request recibida a las 18:30 en la Ciudad de México ya
 * es el día siguiente en UTC, y el documento salía fechado mañana mientras «Mis
 * Cotizaciones» decía hoy (REQ-QFOW6A).
 *
 * Por eso se ejecuta con varias zonas en el proceso: el resultado no puede
 * depender de cuál sea.
 */
const ORIGINAL_TZ = process.env.TZ;

afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

/** 13 oct 2026, 18:30 en la Ciudad de México (UTC−6). */
const EVENING_IN_MEXICO = Date.UTC(2026, 9, 14, 0, 30);

function quoteDetails(overrides: Partial<Pick<Doc<'quotes'>, '_creationTime' | 'expiresAt'>>) {
  const products: Doc<'quotes'>['products'] = [
    {
      partNumber: 'P-001',
      model: 'MK137-4DZ.07.U',
      quantity: 1,
      deliveryLocation: 'Monterrey',
      suggestedPriceUSD: 3000,
      confirmedPriceUSD: 3000,
      suggestedDeliveryWeeksMin: 25,
      suggestedDeliveryWeeksMax: 30,
    },
  ];

  return {
    quote: {
      _creationTime: Date.UTC(2026, 6, 30, 18),
      requestId: 'REQ-QFOW6A',
      expiresAt: Date.UTC(2026, 7, 30, 18),
      products,
      outcome: 'priced_as_suggested' as const,
      ...overrides,
    },
    user: {
      companyName: 'Refrigeración del Norte',
      fullName: 'Ana Cliente',
      preferredLanguage: 'es' as const,
    },
  };
}

describe.each(['UTC', 'America/Mexico_City', 'Asia/Tokyo'])(
  'las fechas del Quote Document con el proceso en %s',
  (zone) => {
    test('la fecha de solicitud es el día de la Ciudad de México', () => {
      process.env.TZ = zone;

      const props = quoteDocumentProps(quoteDetails({ _creationTime: EVENING_IN_MEXICO }));

      expect(props?.date).toBe('13/10/2026');
    });

    test('«precio válido hasta» también', () => {
      process.env.TZ = zone;

      const props = quoteDocumentProps(quoteDetails({ expiresAt: EVENING_IN_MEXICO }));

      expect(props?.validUntil).toBe('13/10/2026');
    });
  }
);
