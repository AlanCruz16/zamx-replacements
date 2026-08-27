import type { Outcome } from '../../convex/lib/outcome';
import { messagesFor, type Language } from './messages';

/**
 * Qué insignia lleva una Replacement Request en la lista del Customer.
 *
 * El Outcome y la notificación son dos hechos independientes, y aquí se leen
 * como tales: **el Outcome decide qué dice la insignia**, y la notificación sólo
 * distingue "ya se le avisó" de "se le está avisando" dentro de un Outcome con
 * precio.
 *
 * Vive fuera del componente porque es una regla, no pintura: conflar los dos
 * hechos es lo que pintaba una pieza descontinuada en verde, con tick y etiqueta
 * de enviada, y dejaba la rama roja de debajo como código muerto.
 */

/** El tono de la insignia; el componente lo traduce a colores e icono. */
export type BadgeTone = 'awaiting' | 'sending' | 'sent' | 'rejected' | 'blocked';

export interface OutcomeBadge {
  label: string;
  tone: BadgeTone;
}

export function outcomeBadge(
  outcome: Outcome | undefined,
  notified: boolean,
  language: Language
): OutcomeBadge {
  // La regla decide qué se dice; el idioma sólo decide con qué palabras. Los
  // literales viven en `messages.ts` para que la lista del Customer no sea la
  // única superficie que se quedó en español (ticket 20).
  const t = messagesFor(language).quotes;

  // Ausencia de Outcome = en revisión. No hay literal para esperar.
  if (outcome === undefined) return { label: t.badgeAwaiting, tone: 'awaiting' };

  switch (outcome) {
    case 'priced_as_suggested':
    case 'priced_differently':
      return notified
        ? { label: t.badgeSent, tone: 'sent' }
        : { label: t.badgeSending, tone: 'sending' };
    case 'oem_restricted':
      return { label: t.badgeOemRestricted, tone: 'rejected' };
    case 'discontinued':
      return { label: t.badgeDiscontinued, tone: 'rejected' };
    case 'blocked_pending_info':
      return { label: t.badgeBlockedPendingInfo, tone: 'blocked' };
  }
}
