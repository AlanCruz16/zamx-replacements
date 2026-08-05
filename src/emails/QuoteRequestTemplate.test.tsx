import { describe, expect, test } from 'vitest';
import { render } from 'react-email';
import * as React from 'react';
import { QuoteRequestTemplate } from './QuoteRequestTemplate';

/**
 * El correo al Approver, renderizado de verdad bajo jsdom.
 *
 * Es la única superficie donde un Approver decide sin abrir la aplicación, así
 * que lo que se afirma es lo que él necesita leer: con quién hablar, en qué
 * moneda están las cifras, qué piezas el sistema no pudo cotizar y cómo redactar
 * la respuesta. Las afirmaciones son sobre el texto renderizado, no sobre las
 * props: un dato que llega al componente y no se pinta no le sirve de nada.
 */

const CUSTOMER = {
  fullName: 'Ana Márquez',
  companyName: 'Refrigeración del Norte',
  email: 'ana@refrinorte.mx',
  phone: '+52 81 1234 5678',
};

const PRICED_PRODUCT = {
  partNumber: '162562',
  model: 'FN050-VDK.4I.V7P1',
  quantity: 2,
  deliveryLocation: 'Monterrey, NL',
  suggestedPriceUSD: 3100.5,
  suggestedDeliveryWeeksMin: 25,
  suggestedDeliveryWeeksMax: 30,
};

/** Ningún Model Prefix coincidió: sin Suggested Price (ticket 12). */
const UNPRICEABLE_PRODUCT = {
  partNumber: '999999',
  model: 'ZZ999-NADA',
  quantity: 1,
  deliveryLocation: 'CDMX',
  suggestedDeliveryWeeksMin: 25,
  suggestedDeliveryWeeksMax: 30,
};

/** El HTML renderizado, con las entidades deshechas para poder buscar texto. */
async function renderEmail(props: Parameters<typeof QuoteRequestTemplate>[0]) {
  const html = await render(React.createElement(QuoteRequestTemplate, props));
  const text = html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

  return { html, text };
}

function baseProps() {
  return {
    requestId: 'REQ-V59X9B',
    customer: CUSTOMER,
    products: [PRICED_PRODUCT],
    subtotalUSD: 6201,
    taxUSD: 992.16,
    totalUSD: 7193.16,
  };
}

describe('el correo de solicitud al Approver', () => {
  test('lleva los datos de contacto del Customer para poder llamarle', async () => {
    const { text } = await renderEmail(baseProps());

    expect(text).toContain('Ana Márquez');
    expect(text).toContain('Refrigeración del Norte');
    expect(text).toContain('ana@refrinorte.mx');
    expect(text).toContain('+52 81 1234 5678');
  });

  test('dice la moneda en cada cifra, con separador de miles y dos decimales', async () => {
    const { text } = await renderEmail(baseProps());

    // El Suggested Price por unidad y los tres totales. Un `3100` a secas no
    // dice si son pesos o dólares, y es la mitad humana del desliz de moneda
    // que la banda del ticket 10 sólo caza cuando ya ocurrió.
    expect(text).toContain('$3,100.50 USD');
    expect(text).toContain('$6,201.00 USD');
    expect(text).toContain('$992.16 USD');
    expect(text).toContain('$7,193.16 USD');

    // Ninguna cifra suelta sin moneda: cada `$` del cuerpo termina en USD.
    for (const figure of text.matchAll(/\$[\d,]+\.\d{2}(\s*\w+)?/g)) {
      expect(figure[0]).toMatch(/USD$/);
    }
  });

  test('da el Delivery Estimate sugerido como rango, con su unidad', async () => {
    const { text } = await renderEmail(baseProps());

    expect(text).toMatch(/25\s*[–-]\s*30 semanas/);
  });

  test('dice cómo redactar la respuesta para cada Outcome', async () => {
    const { text } = await renderEmail(baseProps());

    // Las seis salidas del glosario, cada una con la frase que el intérprete
    // entiende. Decirle al Approver cómo redactar sale más barato que mejorar
    // el análisis del texto.
    expect(text).toMatch(/Aprobado/i);
    expect(text).toContain('162562');
    expect(text).toMatch(/Entrega:/i);
    expect(text).toMatch(/OEM/);
    expect(text).toMatch(/Descontinuad|Obsolet/i);
    expect(text).toMatch(/Falta info/i);
  });

  test('el precio de ejemplo es el de la propia solicitud, no una cifra inventada', async () => {
    const { text } = await renderEmail(baseProps());

    // Un ejemplo con una cifra ajena al Suggested Price de la pieza es un
    // ejemplo que la banda del ticket 10 rechazaría: el Approver que lo copia
    // recibiría «fuera de rango» del propio correo que le dijo qué escribir.
    expect(text).toContain('«162562: $3,100.50 USD»');
    expect(text).not.toMatch(/\$3,250\.00/);
  });

  test('no promete un tiempo de entrega por pieza, que el registro no puede guardar', async () => {
    const { text } = await renderEmail(baseProps());

    // `processEmployeeResponse` aplica un único `newDeliveryWeeks` a todos los
    // productos, así que dos plazos en una respuesta acaban con uno estampado
    // sobre el otro. El correo lo pide una sola vez para toda la solicitud.
    expect(text).toMatch(/plazo para todas las piezas/i);
    expect(text).toMatch(/no guarda uno distinto por pieza/i);
  });

  test('marca la pieza que el sistema no pudo cotizar y pide un precio para ella', async () => {
    const { text } = await renderEmail({
      ...baseProps(),
      products: [PRICED_PRODUCT, UNPRICEABLE_PRODUCT],
    });

    expect(text).toContain('999999');
    expect(text).toMatch(/[Ss]in precio sugerido/);
    expect(text).toMatch(/Responde con un precio/i);
    // Y que los totales no fingen incluirla.
    expect(text).toMatch(/excluyen las piezas sin precio sugerido/i);
  });

  test('omite el teléfono sin dejar un hueco cuando el Customer no lo dio', async () => {
    const { text } = await renderEmail({
      ...baseProps(),
      customer: { ...CUSTOMER, phone: undefined },
    });

    expect(text).toContain('ana@refrinorte.mx');
    expect(text).toMatch(/Teléfono: no proporcionado/i);
  });
});
