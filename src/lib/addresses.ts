/**
 * Las direcciones de ZAMX, en un solo sitio.
 *
 * Estaban escritas a mano en cada ruta que manda correo y en las dos que
 * renderizan el Quote Document. La de contacto del documento vivía duplicada en
 * las dos rutas de PDF, que es exactamente la clase de valor que se corrige en
 * una y se olvida en la otra.
 *
 * `QUOTE_SENDER` sigue apuntando al dominio de pruebas: cambiarlo a
 * `@ziehl-abegg.com.mx` es un cambio de una línea aquí, no de tres.
 */

/** El remitente de los correos de cotización que manda el sistema. */
export const QUOTE_SENDER = 'ZAMX Cotizaciones <cotizaciones@za.idcn.com.mx>';

/** El remitente de los correos de soporte del chat. */
export const SUPPORT_SENDER = 'ZAMX Soporte <soporte@za.idcn.com.mx>';

/**
 * A quién le contesta el Customer cuando responde a su Quote Document. Es la
 * dirección impresa en el documento, no el remitente del correo: el documento
 * sobrevive al correo que lo llevó y se reenvía dentro de la empresa del
 * Customer, así que tiene que valerse por sí mismo.
 */
export const QUOTE_CONTACT = {
  name: 'Ventas ZAMX',
  email: 'cotizaciones@ziehl-abegg.com.mx',
} as const;
