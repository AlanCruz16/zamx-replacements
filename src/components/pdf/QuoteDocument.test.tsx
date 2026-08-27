import { describe, expect, test } from 'vitest';
import { QuoteDocument, type QuoteDocumentProps } from './QuoteDocument';
import { LANGUAGES, messagesFor, type Language } from '@/lib/messages';
import { otherLanguage } from '@/test/languages';

/**
 * El Quote Document en los dos idiomas.
 *
 * No se renderiza a PDF: dentro del PDF el texto va comprimido en flujos, así
 * que afirmar sobre los bytes no diría nada sobre lo que el Customer lee. Lo que
 * se recorre es el árbol de elementos que el componente produce, que es
 * exactamente el texto que el renderizador va a dibujar — y encima corre sin
 * fuentes ni binarios de por medio.
 *
 * La afirmación que importa no es «están las frases del idioma pedido» —eso ya
 * lo garantiza `messages.test.ts`— sino que **ninguna** frase del otro idioma
 * sobrevive. Un documento a medio traducir es peor que uno sin traducir, porque
 * el Customer no puede saber qué mitad creerse.
 */

const PROPS: Omit<QuoteDocumentProps, 'language'> = {
  requestId: 'REQ-V59X9B',
  date: '30/07/2026',
  validUntil: '30/08/2026',
  customerInfo: {
    companyName: 'Refrigeración del Norte',
    fullName: 'Ana Cliente',
    deliveryLocation: 'Monterrey',
  },
  products: [
    {
      partNumber: 'P-001',
      model: 'MK137-4DZ.07.U',
      quantity: 2,
      priceUSD: 3125,
      subtotalUSD: 6250,
      deliveryWeeksMin: 25,
      deliveryWeeksMax: 30,
    },
    {
      partNumber: 'P-002',
      model: 'RH45V-4EK.4F.1R',
      quantity: 1,
      priceUSD: 1200,
      subtotalUSD: 1200,
      deliveryWeeksMin: 12,
      deliveryWeeksMax: 16,
    },
  ],
  subtotal: 7450,
  iva: 1192,
  total: 8642,
  contactName: 'Ventas ZAMX',
  contactEmail: 'cotizaciones@ziehl-abegg.com.mx',
  logoSrc: 'data:image/png;base64,iVBORw0KGgo=',
};

/** El texto que el documento va a dibujar, en el orden en que lo dibuja. */
function documentText(language: Language, overrides: Partial<QuoteDocumentProps> = {}): string {
  const chunks: string[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const walk = (node: any) => {
    if (node === null || node === undefined || typeof node === 'boolean') return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (typeof node === 'string' || typeof node === 'number') {
      chunks.push(String(node));
      return;
    }
    if (typeof node === 'object' && node.props) walk(node.props.children);
  };

  walk(QuoteDocument({ ...PROPS, language, ...overrides }));

  // Unidos por un espacio: cada frontera de elemento cuenta como una, igual que
  // al medir el texto de un correo.
  return chunks.join(' ');
}

/**
 * Las frases del documento que **distinguen** un idioma del otro. Las que
 * coinciden —`MEX`, `Total`, `pos`— no dicen nada sobre el idioma y afirmar
 * sobre ellas sólo produciría fallos falsos.
 */
function distinctivePhrases(language: Language): string[] {
  const mine = messagesFor(language).quoteDocument;
  const theirs = messagesFor(otherLanguage(language)).quoteDocument;

  // `fileNamePrefix` no se imprime: nombra el archivo, y de eso responden las
  // dos rutas que lo entregan.
  const rendered = ({ fileNamePrefix: _, ...m }: typeof mine) => [
    ...Object.values(m).filter((value): value is string => typeof value === 'string'),
    m.greeting('Ana Cliente'),
    m.deliveryPerPart('P-001', 25, 30),
    m.footerHowToOrder('cotizaciones@ziehl-abegg.com.mx'),
  ];

  const otras = new Set(rendered(theirs));
  return rendered(mine).filter((phrase) => !otras.has(phrase));
}

describe('el Quote Document', () => {
  test.each(LANGUAGES)('en %s lleva sus propias frases', (language) => {
    const text = documentText(language);

    for (const phrase of distinctivePhrases(language)) {
      expect(text).toContain(phrase);
    }
  });

  test.each(LANGUAGES)('en %s no sobrevive ninguna frase del otro idioma', (language) => {
    const text = documentText(language);
    const otro = otherLanguage(language);

    for (const phrase of distinctivePhrases(otro)) {
      expect(text).not.toContain(phrase);
    }
  });

  test('las cifras no cambian de idioma: los precios de ZAMX son en USD', () => {
    // Lo que sigue al idioma es la puntuación, no la moneda ni el importe. Un
    // Quote Document en inglés que cotizara otra cosa mentiría sobre el precio.
    for (const language of LANGUAGES) {
      const text = documentText(language);
      expect(text).toContain('7,450.00');
      expect(text).toContain('8,642.00');
      expect(text).toContain('USD');
    }
  });

  test('la Delivery Estimate por pieza se dice en el idioma del Customer', () => {
    // Las dos piezas del fixture tienen rangos distintos, así que el documento
    // cae en la rama de una línea por pieza: la que más literales lleva.
    for (const language of LANGUAGES) {
      const t = messagesFor(language).quoteDocument;
      const text = documentText(language);

      expect(text).toContain(t.deliveryPerPart('P-001', 25, 30));
      expect(text).toContain(t.deliveryPerPart('P-002', 12, 16));
      expect(text).not.toContain(t.deliveryShared(25, 30));
    }
  });

  test('la Delivery Estimate compartida también', () => {
    // La otra rama: cuando todas las piezas comparten rango, el documento lo
    // dice una sola vez. Es una frase distinta, y también tiene que traducirse.
    const compartida = PROPS.products.map((p) => ({
      ...p,
      deliveryWeeksMin: 25,
      deliveryWeeksMax: 30,
    }));

    for (const language of LANGUAGES) {
      const t = messagesFor(language).quoteDocument;
      const text = documentText(language, { products: compartida });

      expect(text).toContain(t.deliveryShared(25, 30));
      expect(text).not.toContain(t.deliveryPerPart('P-001', 25, 30));
    }
  });
});
