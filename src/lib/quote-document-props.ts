import type { Doc } from '../../convex/_generated/dataModel';
import type { QuoteDocumentProps } from '@/components/pdf/QuoteDocument';
import { QUOTE_CONTACT } from './addresses';
import { quoteLogoSrc } from './quote-logo';
import { quoteDocumentLines } from './quote-document';
import { formatDate, resolveLanguage } from './messages';

/**
 * Los props del Quote Document a partir de una Replacement Request y su
 * Customer, o `null` si esa Replacement Request no tiene Quote Document.
 *
 * Las dos rutas que renderizan PDF —el adjunto del correo y la descarga del
 * Customer— construían este objeto por separado, con el mismo formato de
 * fechas, el mismo mapeo de piezas y las mismas dos direcciones escritas a mano.
 * Veinticinco líneas duplicadas que había que cambiar a la vez, y que por tanto
 * se cambiaban de a una.
 *
 * La puerta del Outcome (`quoteDocumentLines`) se aplica aquí dentro, no en cada
 * ruta: ninguna de las dos puede renderizar un documento que no debería existir
 * sin pasar antes por esta función, porque es la única que sabe armar sus props.
 *
 * El idioma sale del propio Customer y viaja con los props, fechas incluidas.
 * Las dos rutas formateaban en `es-MX` a mano, así que un Customer con la cuenta
 * en inglés recibía un Quote Document en español (ticket 20). Deducirlo de una
 * cabecera del navegador no serviría: el adjunto del correo lo genera el
 * servidor sin que haya ningún navegador pidiéndolo.
 */
export function quoteDocumentProps({ quote, user }: QuoteDetails): QuoteDocumentProps | null {
  const lines = quoteDocumentLines(quote);
  if (!lines) return null;

  const language = resolveLanguage(user.preferredLanguage);

  return {
    requestId: quote.requestId,
    date: formatDate(quote._creationTime, language),
    validUntil: formatDate(quote.expiresAt, language),
    customerInfo: {
      companyName: user.companyName,
      fullName: user.fullName,
      // La Delivery Location es de cada pieza; el documento imprime una sola
      // dirección, así que toma la de la primera.
      deliveryLocation: quote.products[0]?.deliveryLocation || '',
    },
    products: lines.products,
    subtotal: lines.totals.subtotalUSD,
    iva: lines.totals.taxUSD,
    total: lines.totals.totalUSD,
    contactName: QUOTE_CONTACT.name,
    contactEmail: QUOTE_CONTACT.email,
    logoSrc: quoteLogoSrc(),
    language,
  };
}

/**
 * La Replacement Request y su Customer, tal y como llegan juntos de
 * `fetchQuoteDetails`. Van como un solo argumento porque salen de una sola
 * lectura: separarlos sólo daba a las dos rutas la ocasión de emparejar mal.
 *
 * Los campos se toman del esquema uno a uno para que renombrar cualquiera rompa
 * aquí en el typecheck, sin exigir el registro entero a quien arme un fixture.
 */
interface QuoteDetails {
  quote: Pick<Doc<'quotes'>, '_creationTime' | 'requestId' | 'expiresAt' | 'outcome' | 'products'>;
  user: Pick<Doc<'users'>, 'companyName' | 'fullName' | 'preferredLanguage'>;
}
