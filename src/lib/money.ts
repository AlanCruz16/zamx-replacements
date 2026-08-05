/**
 * Cómo se escribe una cifra de dinero ante un Approver.
 *
 * Vive aparte porque hay dos superficies que le hablan al Approver — el correo
 * de solicitud (`src/emails/QuoteRequestTemplate.tsx`) y el que se le contesta
 * (`src/lib/approver-reply.ts`) — y las dos tienen que escribir la misma cifra
 * igual. Un `3100` en un mensaje y un `$3,100.50 USD` en el otro invitan
 * exactamente al desliz que la banda del ticket 10 sólo caza a posteriori.
 *
 * Deliberadamente no es el formato del Quote Document: ese es un documento
 * formal para el Customer y lleva la moneda en su propia columna.
 */

/**
 * Toda cifra lleva su moneda escrita, con separador de miles y dos decimales.
 * El `USD` va explícito además del `$` porque en México el `$` es el peso.
 */
export function usd(amount: number): string {
  return `${amount.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} USD`;
}
