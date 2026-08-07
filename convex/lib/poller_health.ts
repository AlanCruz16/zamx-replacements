/**
 * Cuándo un sondeo que no puede abrir el buzón tiene que decírselo a alguien.
 *
 * Entre el 4 y el 5 de agosto de 2026 el sondeo falló 225 veces seguidas —cada
 * ejecución del cron de cinco minutos durante más de un día— y lo único que
 * quedó de ello fue un `console.error` en un panel que nadie estaba mirando. La
 * causa era externa y banal (una contraseña de aplicación caducada), pero el
 * defecto es que hizo falta una prueba de aceptación para enterarse.
 *
 * Las reglas de cuándo avisar viven aquí, fuera de la acción: `convex/emails.ts`
 * es `'use node'` y abre IMAP, así que ninguna costura de prueba la alcanza. Lo
 * que sí se prueba es esto — una función pura del estado anterior, el resultado
 * del sondeo y la hora.
 */

/**
 * Las dos clases de fallo, que no se arreglan igual: unas credenciales
 * rechazadas no se recuperan solas y piden una contraseña nueva; una conexión
 * caída puede volver por su cuenta en el siguiente sondeo.
 */
export type PollerFailureKind = 'authentication' | 'connection';

/** Qué falló, en las dos piezas que hacen falta para contarlo: clase y texto. */
export type PollerFailure = { kind: PollerFailureKind; detail: string };

/** Lo que pasó en un sondeo. `ok` significa que el buzón se abrió y se leyó. */
export type PollerRun = { ok: true } | ({ ok: false } & PollerFailure);

/** Lo que se recuerda entre ejecuciones. Vive en una tabla, no en el proceso. */
export type PollerHealth = {
  /** La última lectura correcta del buzón. Ausente => nunca hubo una. */
  lastSuccessAt?: number;
  /** El primer fallo del apagón en curso. Ausente => no hay apagón. */
  outageStartedAt?: number;
  /** Fallos del apagón en curso. */
  outageFailures: number;
  /** El último fallo, que es también el reloj con el que se da un apagón por terminado. */
  lastFailure?: PollerFailure & { at: number };
  /** Cuándo se avisó de este apagón. Presente => ya se avisó, no se repite. */
  alertedAt?: number;
};

/** El aviso que sale del sistema, con lo que hace falta para redactarlo. */
export type PollerAlert = PollerFailure & {
  failures: number;
  /** Cuánto lleva el buzón sin leerse. Es la métrica honesta, no la racha. */
  silentForMs: number;
  lastSuccessAt?: number;
  /** La marca que dejó este aviso, para poder retirarla si no llegó a salir. */
  alertedAt: number;
};

/**
 * Cuánto puede llevar el buzón sin leerse antes de que sea noticia: veinte
 * minutos, cuatro ejecuciones del cron de cinco.
 *
 * No es una racha de fallos. El apagón del 5 de agosto parpadeó —falló hasta
 * las 16:30, acertó a las 16:35, corrió limpio a las 16:40 y 16:45 y volvió a
 * fallar a las 16:50—, así que un contador que se reinicia con cualquier acierto
 * se habría reiniciado tres veces dentro del mismo incidente y, con un umbral
 * por encima de tres, no habría avisado nunca. El tiempo desde la última lectura
 * correcta no se deja engañar por un sondeo con suerte.
 */
export const ALERT_AFTER_MS = 20 * 60 * 1000;

/**
 * Cuánto tiene que aguantar el sondeo sin un solo fallo para que el apagón se dé
 * por terminado: media hora, seis ejecuciones del cron.
 *
 * Un acierto suelto no termina nada. El del 5 de agosto acertó a las 16:35,
 * corrió limpio a las 16:40 y 16:45 y volvió a fallar a las 16:50: si el primer
 * acierto cerrara el apagón, ese último fallo empezaría uno nuevo y el mismo
 * incidente mandaría dos correos, o tres, tantos como veces parpadee. El apagón
 * termina cuando deja de haber fallos, no cuando aparece el primer acierto.
 */
export const RECOVERY_AFTER_MS = 30 * 60 * 1000;

/** El estado de un sondeo del que todavía no se sabe nada. */
const INITIAL_HEALTH: PollerHealth = { outageFailures: 0 };

/** ¿Se acabó el apagón anterior? Media hora sin un solo fallo dice que sí. */
function outageIsOver(before: PollerHealth, now: number): boolean {
  return before.lastFailure === undefined || now - before.lastFailure.at >= RECOVERY_AFTER_MS;
}

/**
 * Aplica un sondeo al estado y dice si toca avisar.
 *
 * Dos reglas, y ninguna es una racha:
 *
 * - **Cuándo se avisa**: cuando el buzón lleva más de `ALERT_AFTER_MS` sin
 *   leerse y todavía nadie ha avisado de este apagón.
 * - **Cuándo se deja de estar en apagón**: cuando pasa `RECOVERY_AFTER_MS` sin
 *   un solo fallo. Hasta entonces el apagón es el mismo, con sus aciertos
 *   intercalados y con el aviso ya dado, así que un incidente que parpadea manda
 *   un correo y no uno por parpadeo.
 */
export function recordPollerRun(
  previous: PollerHealth | undefined | null,
  run: PollerRun,
  now: number
): { health: PollerHealth; alert?: PollerAlert } {
  const before = previous ?? INITIAL_HEALTH;
  const recovered = outageIsOver(before, now);

  // El apagón terminado se olvida entero, incluido el haber avisado: el
  // siguiente vuelve a ser noticia.
  const carried: PollerHealth = recovered ? { ...INITIAL_HEALTH } : { ...before };

  if (run.ok) {
    return { health: { ...carried, lastSuccessAt: now } };
  }

  const outageStartedAt = carried.outageStartedAt ?? now;
  const failures = carried.outageFailures + 1;

  // Sin ninguna lectura correcta nunca —credenciales malas desde el despliegue—
  // el silencio se cuenta desde que empezó el apagón, que es todo lo que hay.
  const silentSince = before.lastSuccessAt ?? outageStartedAt;
  const silentForMs = now - silentSince;

  const health: PollerHealth = {
    ...carried,
    lastSuccessAt: before.lastSuccessAt,
    outageStartedAt,
    outageFailures: failures,
    lastFailure: { kind: run.kind, detail: run.detail, at: now },
  };

  if (carried.alertedAt !== undefined || silentForMs < ALERT_AFTER_MS) {
    return { health };
  }

  return {
    health: { ...health, alertedAt: now },
    alert: {
      kind: run.kind,
      detail: run.detail,
      failures,
      silentForMs,
      lastSuccessAt: before.lastSuccessAt,
      alertedAt: now,
    },
  };
}

/**
 * Retira la marca del aviso que no llegó a salir, para que el sondeo siguiente
 * lo vuelva a intentar.
 *
 * Sin esto, un fallo de Resend o un `ADMIN_EMAIL` sin configurar convertirían el
 * único tic que avisa en el mismo silencio que este mecanismo viene a quitar: la
 * marca quedaría puesta y el apagón entero pasaría sin contarse. La marca se
 * compara antes de retirarla porque entre el envío y esta llamada pudo haber
 * corrido otro sondeo.
 */
export function withdrawAlert(health: PollerHealth, alertedAt: number): PollerHealth {
  if (health.alertedAt !== alertedAt) return health;

  const { alertedAt: _retirada, ...rest } = health;
  return rest;
}

/**
 * De qué clase es el fallo que trae `imapflow`.
 *
 * La biblioteca marca el rechazo de credenciales con `authenticationFailed`;
 * cuando no llega ese indicador queda el texto, donde Gmail contesta
 * `NO [ALERT] Invalid credentials (Failure)`. Todo lo demás se trata como
 * conexión, que es el lado prudente: decir «renueva la contraseña» ante un corte
 * de red manda a alguien a arreglar lo que no está roto.
 */
export function classifyPollerFailure(error: unknown): PollerFailure {
  const detail = detailOf(error);

  const flagged =
    typeof error === 'object' &&
    error !== null &&
    (error as { authenticationFailed?: unknown }).authenticationFailed === true;

  const named = /invalid credentials|authenticationfailed|auth.*failed/i.test(detail);

  return { kind: flagged || named ? 'authentication' : 'connection', detail };
}

/** Una línea del error, sin la pila: es lo que va a leer una persona en un correo. */
function detailOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;

  try {
    return String(error);
  } catch {
    return 'error desconocido';
  }
}
