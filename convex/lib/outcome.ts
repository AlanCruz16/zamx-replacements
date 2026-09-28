import type { Doc } from '../_generated/dataModel';

/** Lo que decidió el Approver. Su ausencia significa que sigue en revisión. */
export type Outcome = NonNullable<Doc<'quotes'>['outcome']>;

/** Todos los Outcomes. El `Record` hace que olvidar uno rompa en el typecheck. */
const OUTCOME_SET: Record<Outcome, true> = {
  priced_as_suggested: true,
  priced_differently: true,
  oem_restricted: true,
  discontinued: true,
  blocked_pending_info: true,
};
export const OUTCOMES = Object.keys(OUTCOME_SET) as Outcome[];

/**
 * Los Outcomes que producen un Quote Document, frente a los que se le comunican
 * al Customer sin uno. La distinción se consulta desde la mutación y desde el
 * poller, así que vive en un solo sitio.
 */
export function isPricedOutcome(outcome: Outcome | undefined): boolean {
  return outcome === 'priced_as_suggested' || outcome === 'priced_differently';
}

/** El otro lado de la distinción: los que se le explican al Customer sin uno. */
export const NOTIFIABLE_OUTCOMES = [
  'oem_restricted',
  'discontinued',
  'blocked_pending_info',
] as const satisfies readonly Outcome[];

export type NotifiableOutcome = (typeof NOTIFIABLE_OUTCOMES)[number];

/**
 * La ruta que le explica un Outcome al Customer recibe el suyo por HTTP, así
 * que sólo esto separa lo que el esquema garantiza de lo que llegó en un cuerpo
 * JSON. Sin la comprobación, un valor cualquiera producía un correo con
 * encabezado genérico y cuerpo vacío.
 */
export function isNotifiableOutcome(outcome: unknown): outcome is NotifiableOutcome {
  return NOTIFIABLE_OUTCOMES.includes(outcome as NotifiableOutcome);
}
