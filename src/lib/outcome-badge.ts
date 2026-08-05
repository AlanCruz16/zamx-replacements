import type { Outcome } from '../../convex/lib/outcome';

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

export function outcomeBadge(outcome: Outcome | undefined, notified: boolean): OutcomeBadge {
  // Ausencia de Outcome = en revisión. No hay literal para esperar.
  if (outcome === undefined) return { label: 'En revisión por Ventas', tone: 'awaiting' };

  switch (outcome) {
    case 'priced_as_suggested':
    case 'priced_differently':
      return notified
        ? { label: 'Enviada al correo', tone: 'sent' }
        : { label: 'Procesando envío...', tone: 'sending' };
    case 'oem_restricted':
      return { label: 'Exclusiva del fabricante (OEM)', tone: 'rejected' };
    case 'discontinued':
      return { label: 'Pieza descontinuada', tone: 'rejected' };
    case 'blocked_pending_info':
      return { label: 'Requiere más información', tone: 'blocked' };
  }
}
