import { describe, expect, test } from 'vitest';
import { outcomeBadge } from './outcome-badge';
import { LANGUAGES } from './messages';
import type { Outcome } from '../../convex/lib/outcome';

/** Cada Outcome, más la ausencia de Outcome, que también lleva insignia. */
const ESTADOS: (Outcome | undefined)[] = [
  'priced_as_suggested',
  'priced_differently',
  'oem_restricted',
  'discontinued',
  'blocked_pending_info',
  undefined,
];

/**
 * La insignia deriva del Outcome. Haber notificado al Customer sólo puede
 * añadir "y ya se le avisó" — nunca decidir **qué** se le avisó.
 *
 * El caso que nunca funcionó: la insignia devolvía "Enviada al correo" en cuanto
 * había marca de notificación, y el correo de rechazo también la escribe, así
 * que una pieza descontinuada se pintaba en verde como cotización entregada. La
 * rama roja de debajo era código muerto.
 */
describe('outcomeBadge', () => {
  test.each(['oem_restricted', 'discontinued', 'blocked_pending_info'] as const)(
    'una Replacement Request %s ya notificada se pinta rechazada, no enviada',
    (outcome) => {
      const badge = outcomeBadge(outcome, true, 'es');

      expect(badge.tone).not.toBe('sent');
      expect(badge).toEqual(outcomeBadge(outcome, false, 'es'));
    }
  );

  test('sin Outcome sigue en revisión, se haya notificado o no', () => {
    expect(outcomeBadge(undefined, false, 'es').tone).toBe('awaiting');
    expect(outcomeBadge(undefined, true, 'es').tone).toBe('awaiting');
  });

  test('cada rechazo dice su propia razón', () => {
    expect(outcomeBadge('oem_restricted', true, 'es').tone).toBe('rejected');
    expect(outcomeBadge('discontinued', true, 'es').tone).toBe('rejected');
    expect(outcomeBadge('blocked_pending_info', true, 'es').tone).toBe('blocked');
    expect(
      new Set([
        outcomeBadge('oem_restricted', true, 'es').label,
        outcomeBadge('discontinued', true, 'es').label,
        outcomeBadge('blocked_pending_info', true, 'es').label,
      ]).size
    ).toBe(3);
  });

  test.each(['priced_as_suggested', 'priced_differently'] as const)(
    'con Outcome %s la notificación distingue enviada de en curso',
    (outcome) => {
      expect(outcomeBadge(outcome, true, 'es').tone).toBe('sent');
      expect(outcomeBadge(outcome, false, 'es').tone).toBe('sending');
    }
  );

  /**
   * El idioma cambia lo que se lee y nada más. Si cambiara el tono, la lista
   * pintaría de un color en español y de otro en inglés la misma Replacement
   * Request.
   */
  describe('el idioma del Customer', () => {
    test.each(ESTADOS)(
      'el Outcome %s se lee distinto en cada idioma pero conserva su tono',
      (outcome) => {
        for (const notified of [true, false]) {
          const spanish = outcomeBadge(outcome, notified, 'es');
          const english = outcomeBadge(outcome, notified, 'en');

          expect(english.tone).toBe(spanish.tone);
          expect(english.label).not.toBe(spanish.label);
        }
      }
    );

    test('ningún idioma se queda sin etiqueta para algún Outcome', () => {
      for (const language of LANGUAGES) {
        for (const outcome of ESTADOS) {
          expect(outcomeBadge(outcome, true, language).label.trim()).not.toBe('');
        }
      }
    });
  });
});
