import type { Outcome } from '../../convex/lib/outcome';
import type { ReplyReason, UnappliedPrice } from '../../convex/lib/reply_verdict';
import { usd } from './money';

/**
 * Qué se le contesta al Approver cuando el sistema no puede actuar sobre su
 * respuesta.
 *
 * El silencio era el problema: desde el lado del Approver una respuesta
 * ignorada y una procesada se ven igual. Redactar el mensaje es una regla, no
 * E/S, así que vive fuera de la ruta que lo manda y se prueba directamente.
 */

/**
 * Los tres motivos que ya distingue el veredicto, más el que sólo conoce la
 * transacción: la respuesta llegó a una Replacement Request que ya tenía
 * Outcome. Gana la primera respuesta, y a la segunda hay que decírselo.
 */
export type ApproverReplyReason = ReplyReason | 'already_settled';

export type { UnappliedPrice };

export type ApproverReplyPayload = {
  requestId: string;
  reason: ApproverReplyReason;
  prices?: UnappliedPrice[];
  /** Sólo con `already_settled`: el Outcome que ya tenía la Request. */
  outcome?: Outcome;
};

/** Cómo se nombra cada Outcome ante un Approver, en su vocabulario, no en el del glosario. */
const OUTCOME_LABELS: Record<Outcome, string> = {
  priced_as_suggested: 'cotizada con los precios sugeridos',
  priced_differently: 'cotizada con precios distintos a los sugeridos',
  oem_restricted: 'marcada como exclusiva del fabricante (OEM)',
  discontinued: 'marcada como descontinuada',
  blocked_pending_info: 'a la espera de más información del cliente',
};

/**
 * El asunto lleva el folio porque es lo que identifica de qué Replacement
 * Request se habla: si el Approver contesta a este mensaje, el sondeo tiene que
 * poder reconocerlo igual que reconoció el anterior.
 */
export function composeApproverReply(payload: ApproverReplyPayload): {
  subject: string;
  text: string;
} {
  const prices = payload.prices ?? [];

  return {
    subject: `RE: Solicitud de cotización [${payload.requestId}] — respuesta no aplicada`,
    text: [
      `Solicitud de reemplazo: ${payload.requestId}`,
      '',
      ...bodyFor(payload, prices),
      '',
      'Este mensaje lo genera el sistema de cotizaciones ZAMX. Responda a este mismo',
      'correo conservando el folio en el asunto.',
    ].join('\n'),
  };
}

/** Precios fuera de la banda: hay Suggested Price contra el que se acotaron. */
function outOfBandBlock(prices: UnappliedPrice[]): string[] {
  if (prices.length === 0) return [];

  return [
    '',
    'Fuera del margen que el sistema acepta sin confirmación (entre la mitad y el doble',
    'del precio sugerido):',
    '',
    ...prices.map(
      (p) =>
        `  · ${p.partNumber}: precio sugerido ${usd(p.suggestedPriceUSD!)}, se leyó ${usd(p.priceUSD)}`
    ),
    '',
    'Si la cifra que se leyó es la correcta, confírmelo respondiendo a este correo. Si',
    'la cifra estaba en pesos, indíquela en USD.',
  ];
}

/** Precios para piezas que no están en la Replacement Request. */
function unknownPartBlock(prices: UnappliedPrice[]): string[] {
  if (prices.length === 0) return [];

  return [
    '',
    'Para piezas que no están en esta solicitud:',
    '',
    ...prices.map((p) => `  · ${p.partNumber}: se leyó ${usd(p.priceUSD)}`),
    '',
    'Revise el número de parte y conteste con el que corresponde a esta solicitud.',
  ];
}

function bodyFor(payload: ApproverReplyPayload, prices: UnappliedPrice[]): string[] {
  switch (payload.reason) {
    case 'low_confidence':
      return [
        'No se pudo entender su respuesta con la seguridad suficiente para actuar sobre',
        'ella, así que la solicitud sigue en revisión y no se le ha enviado nada al',
        'cliente.',
        '',
        'Por favor conteste indicando explícitamente una de estas decisiones: aprobar los',
        'precios sugeridos, dar precios distintos (con el número de parte y la cifra en',
        'USD de cada uno), marcar la pieza como exclusiva del fabricante (OEM), marcarla',
        'como descontinuada, o pedirle más información al cliente.',
      ];

    // Los dos motivos de precio se redactan juntos porque una misma respuesta
    // puede traer los dos: el veredicto nombra uno solo, y meter una pieza
    // desconocida bajo el párrafo de la banda le diría al Approver que su cifra
    // está fuera de rango cuando lo que falla es el número de parte.
    case 'price_out_of_bounds':
    case 'price_for_unknown_part':
      return [
        'Su decisión no se ha registrado: uno o más precios no se pudieron aplicar, y la',
        'solicitud sigue en revisión hasta que los confirme. Al cliente no se le ha',
        'enviado nada.',
        ...outOfBandBlock(prices.filter((p) => p.suggestedPriceUSD !== undefined)),
        ...unknownPartBlock(prices.filter((p) => p.suggestedPriceUSD === undefined)),
      ];

    case 'already_settled':
      return [
        payload.outcome === undefined
          ? 'Esta solicitud ya tenía una decisión registrada antes de su respuesta.'
          : `Esta solicitud ya estaba ${OUTCOME_LABELS[payload.outcome]} antes de su respuesta.`,
        '',
        'Gana la primera respuesta: la suya NO se aplicó y nada cambió. Si la decisión',
        'registrada es incorrecta, hace falta corregirla desde la aplicación — el correo',
        'no revisa una decisión ya tomada, porque puede que al cliente ya se le haya',
        'comunicado.',
      ];
  }
}
