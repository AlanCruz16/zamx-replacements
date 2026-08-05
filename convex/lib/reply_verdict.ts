import type { Outcome } from './outcome';

/**
 * Las reglas que decide una respuesta del Approver, fuera de la cáscara de E/S.
 *
 * `convex/emails.ts` es una acción `'use node'` que abre una conexión IMAP, así
 * que `convex-test` no puede ejecutarla, y el intérprete llama a un modelo de
 * lenguaje por la red. Ninguna de las dos costuras del spec alcanza este camino,
 * de modo que las decisiones viven aquí: una función pura que recibe el mensaje
 * ya descargado más la Replacement Request que le concierne, y devuelve un
 * veredicto. El transporte IMAP y la llamada al modelo quedan como cáscaras
 * finas y sin pruebas alrededor. El trato es deliberado: la E/S se queda sin
 * verificar para que toda regla que transporta sí lo esté.
 */

/** Un mensaje ya descargado del buzón. Nada de esto es de fiar. */
export type InboundMessage = {
  /** Remitente del sobre, tal cual viene: puede traer nombre de pantalla. */
  envelopeSender: string;
  subject: string;
  textBody: string;
};

/**
 * Lo que el intérprete extrae del cuerpo. La clasificación habla el vocabulario
 * del glosario — los mismos literales que el Outcome del esquema — para que la
 * tubería y el enum no discrepen sobre qué desenlaces existen.
 */
export type ReplyInterpretation = {
  classification: Outcome;
  /** Tal cual lo devuelve el modelo: puede venir fuera de 0–1. */
  confidence: number;
  explanation: string;
  newPricesUSD?: { partNumber: string; price: number }[];
  newDeliveryWeeks?: number;
};

/** Lo único que hace falta de la Replacement Request para juzgar la respuesta. */
export type RequestUnderReview = {
  requestId: string;
  products: readonly { partNumber: string; suggestedPriceUSD?: number }[];
};

/**
 * Qué se hace con el mensaje antes de leerlo siquiera.
 *
 * `ignored` — no menciona ninguna Replacement Request: no es para esta tubería.
 * `refused` — sí la menciona, pero el remitente no está en la lista de
 * Approvers. Se registra con su dirección y **se deja sin leer**, para que
 * añadir a un Approver legítimo y esperar al siguiente sondeo lo recupere.
 */
export type Screening =
  | { kind: 'ignored'; reason: 'no_request_id' }
  | { kind: 'refused'; reason: 'sender_not_approver'; sender: string; requestId: string }
  | { kind: 'accepted'; sender: string; requestId: string };

/** Qué se hizo con cada precio extraído. */
export type PriceDecision =
  | { partNumber: string; status: 'applied'; priceUSD: number }
  | { partNumber: string; status: 'out_of_bounds'; priceUSD: number; suggestedPriceUSD: number }
  | { partNumber: string; status: 'unknown_part'; priceUSD: number };

/** Por qué hay que contestarle al Approver en vez de callar. */
export type ReplyReason = 'low_confidence' | 'price_out_of_bounds' | 'price_for_unknown_part';

export type Verdict = {
  screening: Screening;
  /** Ausente => no se llegó a una decisión; la Request sigue en revisión. */
  outcome?: Outcome;
  /** Ya acotada a 0–1. */
  confidence: number;
  explanation: string;
  /** Vacío salvo que el Outcome sea `priced_differently`. */
  prices: PriceDecision[];
  deliveryWeeks?: number;
  replyToApprover?: ReplyReason;
};

/** Por debajo de esto la interpretación no basta para mover nada. */
export const CONFIDENCE_THRESHOLD = 0.7;

/**
 * La banda contra la que se acota un Confirmed Price extraído, inclusive en los
 * extremos. Coge los dos fallos que invita el leer prosa: un desliz de moneda
 * (una cifra en pesos leída como dólares es un error de ~17×) y un dígito de
 * más. Una pieza sin Suggested Price no tiene contra qué acotarse.
 */
export const PRICE_BAND = { min: 0.5, max: 2 };

/** El folio identifica de qué Replacement Request se habla. No da autoridad. */
const REQUEST_ID_PATTERN = /(REQ-[A-Z0-9]+)/i;

/**
 * Decide si el mensaje se toca siquiera, sin mirar el cuerpo.
 *
 * El folio va primero a propósito: un mensaje que no nombra ninguna Replacement
 * Request no es de esta tubería, y registrarlo como intento no autorizado
 * llenaría el registro de correo ajeno. Un rechazo, en cambio, es siempre un
 * mensaje que apuntaba a una Request concreta.
 */
export function screenInboundMessage(
  message: InboundMessage,
  approverAddresses: readonly string[]
): Screening {
  const requestId = message.subject.match(REQUEST_ID_PATTERN)?.[1].toUpperCase();
  if (!requestId) {
    return { kind: 'ignored', reason: 'no_request_id' };
  }

  const sender = normaliseAddress(message.envelopeSender);

  if (!isApproverAddress(sender, approverAddresses)) {
    return { kind: 'refused', reason: 'sender_not_approver', sender, requestId };
  }

  return { kind: 'accepted', sender, requestId };
}

/**
 * Si una dirección es la de un Approver configurado. La misma regla que decide
 * quién puede mover una Replacement Request decide a quién puede escribirle el
 * sistema: la ruta que contesta (ticket 10) manda a una dirección que le llega
 * en el cuerpo, y sin esta comprobación sería un remitente de correo abierto.
 *
 * Una lista vacía no autoriza a nadie: sin Approvers configurados el buzón deja
 * de mover Replacement Requests en vez de quedar abierto a cualquiera.
 */
export function isApproverAddress(address: string, approverAddresses: readonly string[]): boolean {
  const approvers = approverAddresses.map(normaliseAddress).filter((a) => a.length > 0);

  return approvers.includes(normaliseAddress(address));
}

/**
 * `"Ventas ZAMX" <Sales@Example.com>` y `sales@example.com` son el mismo
 * Approver: el nombre de pantalla lo pone el cliente de correo del remitente y
 * las mayúsculas del dominio no significan nada.
 */
function normaliseAddress(address: string): string {
  const angled = address.match(/<([^>]*)>/);
  return (angled ? angled[1] : address).trim().toLowerCase();
}

/**
 * El veredicto completo. Vuelve a cribar el mensaje por su cuenta: la cáscara
 * criba antes para no gastar una llamada al modelo, pero que un remitente no
 * autorizado no produzca Outcome no puede depender de que quien llama se
 * acuerde de comprobarlo.
 */
export function verdictForReply(input: {
  message: InboundMessage;
  request: RequestUnderReview;
  interpretation: ReplyInterpretation;
  approverAddresses: readonly string[];
}): Verdict {
  const { message, request, interpretation, approverAddresses } = input;
  const screening = screenInboundMessage(message, approverAddresses);
  const confidence = clampConfidence(interpretation.confidence);

  if (screening.kind !== 'accepted' || screening.requestId !== request.requestId) {
    return { screening, confidence, explanation: interpretation.explanation, prices: [] };
  }

  // Una interpretación en la que el propio modelo no confía no mueve nada, y el
  // silencio no vale: desde el lado del Approver una respuesta ignorada y una
  // procesada se ven igual.
  if (confidence < CONFIDENCE_THRESHOLD) {
    return {
      screening,
      confidence,
      explanation: interpretation.explanation,
      prices: [],
      replyToApprover: 'low_confidence',
    };
  }

  const classification = interpretation.classification;

  // Sólo `priced_differently` trae precios. Un precio suelto en una aprobación
  // en bloque se ignora — decir "cotizada como se sugirió" y guardar otra cifra
  // sería afirmar algo falso sobre lo que decidió el Approver.
  const prices =
    classification === 'priced_differently'
      ? (interpretation.newPricesUSD ?? []).map((extracted) => decidePrice(extracted, request))
      : [];

  // Un precio que no se pudo aplicar no se descarta en silencio: por qué no se
  // aplicó es lo que hay que contestarle al Approver. Una pieza que no está en
  // la Replacement Request suele ser un número de parte mal leído.
  const replyToApprover = prices.some((p) => p.status === 'out_of_bounds')
    ? ('price_out_of_bounds' as const)
    : prices.some((p) => p.status === 'unknown_part')
      ? ('price_for_unknown_part' as const)
      : undefined;

  // Con un precio sin aplicar no hay Outcome: la Replacement Request se queda en
  // revisión hasta que el Approver confirme la cifra.
  //
  // Fijarlo igualmente era peor que perder el precio. Un Outcome cotizado
  // dispara el Quote Document, y la pieza cuyo precio se descartó volvía a caer
  // en su Suggested Price — el Customer recibía un compromiso con la cifra que
  // nunca debe ver, y la confirmación del Approver llegaba a una decisión ya
  // tomada, que no se revisa. Se conserva la explicación, que son sus palabras.
  const outcome = replyToApprover === undefined ? classification : undefined;

  return {
    screening,
    ...(outcome === undefined ? {} : { outcome }),
    confidence,
    explanation: interpretation.explanation,
    prices,
    ...(outcome === 'priced_differently' && interpretation.newDeliveryWeeks !== undefined
      ? { deliveryWeeks: interpretation.newDeliveryWeeks }
      : {}),
    ...(replyToApprover === undefined ? {} : { replyToApprover }),
  };
}

/**
 * Los precios que sí se escriben como Confirmed Price. Lo que el veredicto
 * marcó fuera de banda o para una pieza ajena a la Request no llega al registro.
 *
 * Vive aquí y no en el poller a propósito: el filtro es la regla del ticket 10,
 * y dejarlo en la cáscara de correo lo pondría fuera del alcance de las pruebas
 * justo donde un descuido lo desharía.
 */
export function confirmedPrices(verdict: Verdict): { partNumber: string; price: number }[] {
  return verdict.prices
    .filter((p) => p.status === 'applied')
    .map((p) => ({ partNumber: p.partNumber, price: p.priceUSD }));
}

/**
 * Un precio que se leyó en la respuesta y no se aplicó. Es lo que viaja hasta el
 * correo que se le contesta al Approver, así que la forma se define aquí, del
 * lado que la produce, y no en los dos extremos.
 */
export type UnappliedPrice = {
  partNumber: string;
  priceUSD: number;
  /** Ausente => la pieza no está en la Replacement Request. */
  suggestedPriceUSD?: number;
};

/** Lo que se le contesta al Approver: cada precio que se leyó y no se aplicó. */
export function unappliedPrices(verdict: Verdict): UnappliedPrice[] {
  return verdict.prices
    .filter((p) => p.status !== 'applied')
    .map((p) => ({
      partNumber: p.partNumber,
      priceUSD: p.priceUSD,
      ...(p.status === 'out_of_bounds' ? { suggestedPriceUSD: p.suggestedPriceUSD } : {}),
    }));
}

/** Un modelo que devuelve 1.5 o -2 no ensancha ni estrecha el umbral. */
function clampConfidence(confidence: number): number {
  if (!Number.isFinite(confidence)) return 0;
  return Math.min(1, Math.max(0, confidence));
}

function decidePrice(
  extracted: { partNumber: string; price: number },
  request: RequestUnderReview
): PriceDecision {
  const product = request.products.find((p) => p.partNumber === extracted.partNumber);

  if (!product) {
    return { partNumber: extracted.partNumber, status: 'unknown_part', priceUSD: extracted.price };
  }

  const suggested = product.suggestedPriceUSD;

  // Sin Suggested Price no hay contra qué acotar: mandar la pieza a una persona
  // para que la cotice a mano es precisamente lo que se hace en su lugar.
  if (suggested === undefined) {
    return { partNumber: extracted.partNumber, status: 'applied', priceUSD: extracted.price };
  }

  const withinBand =
    extracted.price >= suggested * PRICE_BAND.min && extracted.price <= suggested * PRICE_BAND.max;

  return withinBand
    ? { partNumber: extracted.partNumber, status: 'applied', priceUSD: extracted.price }
    : {
        partNumber: extracted.partNumber,
        status: 'out_of_bounds',
        priceUSD: extracted.price,
        suggestedPriceUSD: suggested,
      };
}
