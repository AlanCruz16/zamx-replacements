import { describe, expect, test } from 'vitest';
import { composePollerAlert, type PollerAlertPayload } from './poller-alert';

/**
 * Lo que dice el aviso, probado aparte de cómo se manda. Lo que importa es que
 * las dos clases de fallo no se lean igual: una pide una contraseña nueva y no
 * se cura sola, la otra puede curarse en cinco minutos.
 */

const MINUTE = 60 * 1000;

function payload(overrides: Partial<PollerAlertPayload> = {}): PollerAlertPayload {
  return {
    kind: 'authentication',
    detail: '3 NO [ALERT] Invalid credentials (Failure)',
    failures: 4,
    silentForMs: 20 * MINUTE,
    lastSuccessAt: Date.UTC(2026, 7, 5, 22, 30),
    ...overrides,
  };
}

describe('composePollerAlert', () => {
  test('un rechazo de credenciales nombra la variable y el despliegue donde vive', () => {
    const { subject, text } = composePollerAlert(payload());

    expect(subject).toContain('rechaza las credenciales');
    expect(text).toContain('IMAP_PASSWORD');
    expect(text).toContain('Convex');
    expect(text).toContain('no se arregla solo');
  });

  test('el aviso de credenciales desmiente la trampa de la variable en Vercel', () => {
    // La misma variable puesta en Vercel no sondea nada. Quien llega a este
    // correo tiene que enterarse ahí, que es donde va a ir a mirar.
    expect(composePollerAlert(payload()).text).toContain('Vercel no hace nada');
  });

  test('una conexión caída se lee distinto y no manda a nadie a cambiar la contraseña', () => {
    const { subject, text } = composePollerAlert(
      payload({ kind: 'connection', detail: 'connect ETIMEDOUT' })
    );

    expect(subject).toContain('no responde');
    expect(text).toContain('Puede recuperarse solo');
    expect(text).not.toContain('IMAP_PASSWORD');
  });

  test('lleva el error, la cuenta de fallos y el tiempo en silencio', () => {
    const { text } = composePollerAlert(payload({ failures: 225, silentForMs: 19 * 60 * MINUTE }));

    expect(text).toContain('Invalid credentials');
    expect(text).toContain('225');
    expect(text).toContain('19 h 0 min');
  });

  test('sin ninguna lectura correcta previa lo dice en vez de inventar una fecha', () => {
    const { text } = composePollerAlert(payload({ lastSuccessAt: undefined }));

    expect(text).toContain('ninguno registrado');
  });

  test('explica que las respuestas siguen en el buzón, no perdidas', () => {
    // Es lo que decide si quien lo lea sale corriendo a pedirle al Approver que
    // reenvíe todo. No hace falta: se procesan solas al recuperarse.
    expect(composePollerAlert(payload()).text).toContain('sin leer');
  });

  test('un apagón de más de un día se cuenta en días', () => {
    const { text } = composePollerAlert(payload({ silentForMs: 30 * 60 * MINUTE }));

    expect(text).toContain('1 d 6 h');
  });
});
