import type { Doc } from '../_generated/dataModel';

/** Lo que decidió el Approver. Su ausencia significa que sigue en revisión. */
export type Outcome = NonNullable<Doc<'quotes'>['outcome']>;

/**
 * Los Outcomes que producen un Quote Document, frente a los que se le comunican
 * al Customer sin uno. La distinción se consulta desde la mutación y desde el
 * poller, así que vive en un solo sitio.
 */
export function isPricedOutcome(outcome: Outcome | undefined): boolean {
  return outcome === 'priced_as_suggested' || outcome === 'priced_differently';
}
