import { describe, expect, test } from 'vitest';
import { CHAT_POLICY, consumeWindow, type RateLimitWindow } from './rate_limit';

/**
 * Las reglas de la ventana, sin base de datos delante. Lo que se prueba aquí es
 * la aritmética: cuándo se agota, cuándo se renueva y qué se le puede decir al
 * Customer que la agotó.
 */

const POLICY = { limit: 3, windowMs: 60_000 };

/** Una ventana que empezó hace `ms` milisegundos con `count` peticiones dentro. */
function ventana(now: number, ms: number, count: number): RateLimitWindow {
  return { windowStartedAt: now - ms, count };
}

describe('consumeWindow', () => {
  test('la primera petición de una identidad abre la ventana', () => {
    const now = 1_000_000;

    const { window, verdict } = consumeWindow(undefined, POLICY, now);

    expect(verdict).toEqual({ allowed: true });
    expect(window).toEqual({ windowStartedAt: now, count: 1 });
  });

  test('las peticiones dentro del límite pasan y se van contando', () => {
    const now = 1_000_000;

    const { window, verdict } = consumeWindow(ventana(now, 10_000, 2), POLICY, now);

    expect(verdict).toEqual({ allowed: true });
    expect(window.count).toBe(3);
    // La ventana no se mueve: cuenta desde la primera petición, no desde la última.
    expect(window.windowStartedAt).toBe(now - 10_000);
  });

  test('la petición que pasa del límite se rechaza y dice cuánto falta', () => {
    const now = 1_000_000;

    const { verdict } = consumeWindow(ventana(now, 10_000, 3), POLICY, now);

    expect(verdict).toEqual({ allowed: false, retryAfterMs: 50_000 });
  });

  test('una petición rechazada no alarga la ventana ni sube la cuenta', () => {
    // Si el rechazo contara, un cliente que insiste nunca recuperaría el acceso:
    // cada intento empujaría el final de la ventana un poco más allá.
    const now = 1_000_000;
    const existing = ventana(now, 10_000, 3);

    const { window } = consumeWindow(existing, POLICY, now);

    expect(window).toEqual(existing);
  });

  test('vencida la ventana, la siguiente petición empieza una nueva', () => {
    const now = 1_000_000;

    const { window, verdict } = consumeWindow(ventana(now, 60_000, 99), POLICY, now);

    expect(verdict).toEqual({ allowed: true });
    expect(window).toEqual({ windowStartedAt: now, count: 1 });
  });

  test('la ventana del chat es un techo de gasto, no un estrangulamiento', () => {
    // Una Replacement Request de varias piezas se resuelve en decenas de
    // mensajes, no en cientos: el límite tiene que quedar cómodamente por
    // encima de una conversación honesta larga.
    expect(CHAT_POLICY.limit).toBeGreaterThanOrEqual(40);
    expect(CHAT_POLICY.windowMs).toBe(60 * 60 * 1000);
  });
});
