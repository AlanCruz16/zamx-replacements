import { describe, expect, test } from 'vitest';
import { outcomeBadge } from './outcome-badge';

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
      const badge = outcomeBadge(outcome, true);

      expect(badge.tone).not.toBe('sent');
      expect(badge).toEqual(outcomeBadge(outcome, false));
    }
  );

  test('sin Outcome sigue en revisión, se haya notificado o no', () => {
    expect(outcomeBadge(undefined, false).tone).toBe('awaiting');
    expect(outcomeBadge(undefined, true).tone).toBe('awaiting');
  });

  test('cada rechazo dice su propia razón', () => {
    expect(outcomeBadge('oem_restricted', true).tone).toBe('rejected');
    expect(outcomeBadge('discontinued', true).tone).toBe('rejected');
    expect(outcomeBadge('blocked_pending_info', true).tone).toBe('blocked');
    expect(
      new Set([
        outcomeBadge('oem_restricted', true).label,
        outcomeBadge('discontinued', true).label,
        outcomeBadge('blocked_pending_info', true).label,
      ]).size
    ).toBe(3);
  });

  test.each(['priced_as_suggested', 'priced_differently'] as const)(
    'con Outcome %s la notificación distingue enviada de en curso',
    (outcome) => {
      expect(outcomeBadge(outcome, true).tone).toBe('sent');
      expect(outcomeBadge(outcome, false).tone).toBe('sending');
    }
  );
});
