import { describe, expect, test } from 'vitest';
import {
  ALERT_AFTER_MS,
  classifyPollerFailure,
  recordPollerRun,
  withdrawAlert,
  type PollerHealth,
} from './poller_health';

/**
 * Las reglas del aviso, probadas contra el reloj y no contra Gmail: la acción que
 * abre IMAP no la alcanza ninguna costura, así que lo que decide *cuándo* se
 * avisa vive fuera de ella y se prueba aquí.
 *
 * El guion de los casos es el incidente del 4–5 de agosto de 2026, parpadeo
 * incluido.
 */

const MINUTE = 60 * 1000;
const T0 = Date.UTC(2026, 7, 4, 21, 40);

const AUTH = {
  ok: false,
  kind: 'authentication',
  detail: 'Invalid credentials (Failure)',
} as const;
const CONN = { ok: false, kind: 'connection', detail: 'ETIMEDOUT' } as const;

/** Encadena sondeos cada cinco minutos, como el cron, y devuelve lo que salió. */
function poll(
  start: PollerHealth | undefined,
  runs: (typeof AUTH | typeof CONN | { ok: true })[],
  firstAt = T0
) {
  let health = start;
  const alerts: { at: number; alert: NonNullable<ReturnType<typeof recordPollerRun>['alert']> }[] =
    [];

  runs.forEach((run, i) => {
    const at = firstAt + i * 5 * MINUTE;
    const result = recordPollerRun(health, run, at);
    health = result.health;
    if (result.alert) alerts.push({ at, alert: result.alert });
  });

  return { health: health as PollerHealth, alerts };
}

describe('recordPollerRun', () => {
  test('un fallo aislado no avisa a nadie', () => {
    // Un tropiezo de IMAP es normal. Despertar a alguien por él es cómo se
    // aprende a ignorar los avisos.
    const { alerts } = poll({ lastSuccessAt: T0 - 5 * MINUTE, outageFailures: 0 }, [AUTH]);

    expect(alerts).toEqual([]);
  });

  test('un apagón largo avisa una sola vez, y los sondeos siguientes callan', () => {
    const runs = Array.from({ length: 12 }, () => AUTH);

    const { alerts } = poll({ lastSuccessAt: T0 - 5 * MINUTE, outageFailures: 0 }, runs);

    expect(alerts).toHaveLength(1);
    // Cuatro sondeos de cinco minutos después de la última lectura buena.
    expect(alerts[0].at).toBe(T0 + 15 * MINUTE);
    expect(alerts[0].alert.silentForMs).toBe(ALERT_AFTER_MS);
  });

  test('225 fallos seguidos siguen siendo un solo correo', () => {
    // El número del incidente. Un aviso por apagón, no uno por cron.
    const { alerts } = poll(
      { lastSuccessAt: T0 - 5 * MINUTE, outageFailures: 0 },
      Array.from({ length: 225 }, () => AUTH)
    );

    expect(alerts).toHaveLength(1);
  });

  test('una lectura correcta reinicia la cuenta y un apagón posterior vuelve a avisar', () => {
    const primero = poll({ lastSuccessAt: T0 - 5 * MINUTE, outageFailures: 0 }, [
      AUTH,
      AUTH,
      AUTH,
      AUTH,
      AUTH,
      { ok: true },
    ]);

    expect(primero.alerts).toHaveLength(1);

    // Media hora larga después del último fallo el apagón está cerrado, así que
    // el siguiente vuelve a ser noticia.
    const segundo = poll(
      primero.health,
      Array.from({ length: 6 }, () => AUTH),
      T0 + 60 * MINUTE
    );

    expect(segundo.alerts).toHaveLength(1);
    expect(segundo.health.outageFailures).toBe(6);
  });

  test('un apagón que parpadea acaba avisando igual', () => {
    // El 5 de agosto el sondeo falló, acertó una vez, corrió limpio dos veces y
    // volvió a fallar. Un contador de racha se habría reiniciado ahí y, con un
    // umbral por encima de la racha más larga, no habría avisado nunca.
    const { alerts } = poll({ lastSuccessAt: T0 - 5 * MINUTE, outageFailures: 0 }, [
      AUTH,
      AUTH,
      { ok: true },
      AUTH,
      AUTH,
      AUTH,
      AUTH,
      AUTH,
    ]);

    expect(alerts).toHaveLength(1);
    expect(alerts[0].alert.kind).toBe('authentication');
  });

  test('sin ninguna lectura correcta previa el silencio se cuenta desde el primer fallo', () => {
    // Credenciales malas desde el despliegue: no hay `lastSuccessAt` del que
    // restar, y aun así el apagón tiene que salir a la luz.
    const { alerts } = poll(
      undefined,
      Array.from({ length: 6 }, () => AUTH)
    );

    expect(alerts).toHaveLength(1);
    expect(alerts[0].alert.lastSuccessAt).toBeUndefined();
    expect(alerts[0].at).toBe(T0 + ALERT_AFTER_MS);
  });

  test('el aviso distingue un rechazo de credenciales de una conexión caída', () => {
    const auth = poll({ lastSuccessAt: T0 - 5 * MINUTE, outageFailures: 0 }, [
      AUTH,
      AUTH,
      AUTH,
      AUTH,
    ]);
    const conn = poll({ lastSuccessAt: T0 - 5 * MINUTE, outageFailures: 0 }, [
      CONN,
      CONN,
      CONN,
      CONN,
    ]);

    expect(auth.alerts[0].alert.kind).toBe('authentication');
    expect(auth.alerts[0].alert.detail).toContain('Invalid credentials');
    expect(conn.alerts[0].alert.kind).toBe('connection');
    expect(conn.alerts[0].alert.detail).toContain('ETIMEDOUT');
  });

  test('el aviso lleva la cuenta de fallos y la última lectura buena', () => {
    const lastSuccessAt = T0 - 5 * MINUTE;

    const { alerts } = poll({ lastSuccessAt, outageFailures: 0 }, [AUTH, AUTH, AUTH, AUTH]);

    expect(alerts[0].alert.failures).toBe(4);
    expect(alerts[0].alert.lastSuccessAt).toBe(lastSuccessAt);
  });

  test('un acierto suelto no cierra el apagón: el apagón se cierra sin fallos', () => {
    // Media hora sin un solo fallo es lo que lo termina. Hasta entonces el
    // apagón sigue siendo el mismo, con su aviso ya dado.
    const conAcierto = poll({ lastSuccessAt: T0 - 5 * MINUTE, outageFailures: 0 }, [
      AUTH,
      { ok: true },
    ]);

    expect(conAcierto.health.outageStartedAt).toBe(T0);
    expect(conAcierto.health.lastSuccessAt).toBe(T0 + 5 * MINUTE);

    const limpio = poll(
      conAcierto.health,
      Array.from({ length: 8 }, () => ({ ok: true }) as const),
      T0 + 10 * MINUTE
    );

    expect(limpio.health).toEqual({ lastSuccessAt: T0 + 45 * MINUTE, outageFailures: 0 });
  });

  test('un apagón que parpadea con tramos muertos largos sigue siendo un solo correo', () => {
    // El caso que un `alertedAt` borrado por el primer acierto convertiría en un
    // correo por tramo: cinco fallos, un acierto, y otros cinco fallos.
    const { alerts } = poll({ lastSuccessAt: T0 - 5 * MINUTE, outageFailures: 0 }, [
      AUTH,
      AUTH,
      AUTH,
      AUTH,
      AUTH,
      { ok: true },
      AUTH,
      AUTH,
      AUTH,
      AUTH,
      AUTH,
      AUTH,
    ]);

    expect(alerts).toHaveLength(1);
  });
});

describe('classifyPollerFailure', () => {
  test('el indicador de imapflow marca el fallo como de credenciales', () => {
    const error = Object.assign(new Error('Command failed'), { authenticationFailed: true });

    expect(classifyPollerFailure(error)).toEqual({
      kind: 'authentication',
      detail: 'Command failed',
    });
  });

  test('el texto de Gmail basta cuando no llega el indicador', () => {
    const error = new Error('3 NO [ALERT] Invalid credentials (Failure)');

    expect(classifyPollerFailure(error).kind).toBe('authentication');
  });

  test('un corte de red es de conexión, no de credenciales', () => {
    // El lado prudente: mandar a alguien a renovar una contraseña sana por un
    // ETIMEDOUT es peor que decirle que la red falló.
    expect(classifyPollerFailure(new Error('connect ETIMEDOUT 142.250.1.1:993')).kind).toBe(
      'connection'
    );
  });

  test('un error que no es Error conserva algo legible', () => {
    expect(classifyPollerFailure('socket cerrado').detail).toBe('socket cerrado');
  });
});

describe('withdrawAlert', () => {
  test('retira la marca del aviso que no llegó a salir', () => {
    const health = { lastSuccessAt: T0, outageFailures: 4, alertedAt: T0 + 20 * MINUTE };

    expect(withdrawAlert(health, T0 + 20 * MINUTE).alertedAt).toBeUndefined();
  });

  test('no toca una marca que ya no es la suya', () => {
    // Entre el envío fallido y esta llamada pudo correr otro sondeo y avisar de
    // verdad; retirar esa marca mandaría un segundo correo del mismo apagón.
    const health = { lastSuccessAt: T0, outageFailures: 9, alertedAt: T0 + 40 * MINUTE };

    expect(withdrawAlert(health, T0 + 20 * MINUTE)).toEqual(health);
  });
});
