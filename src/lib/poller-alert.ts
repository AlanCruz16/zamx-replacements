import type { PollerFailure } from '../../convex/lib/poller_health';

/**
 * Qué se le dice a quien tiene que arreglar un sondeo que no abre el buzón.
 *
 * Redactarlo es una regla, no E/S, así que vive fuera de la ruta que lo manda y
 * se prueba directamente, igual que la respuesta al Approver.
 *
 * El correo tiene un trabajo: que quien lo lea sepa, sin abrir un panel, qué
 * está roto, desde cuándo, qué se está perdiendo mientras tanto y si se va a
 * arreglar solo. Un rechazo de credenciales no se recupera nunca por su cuenta;
 * una conexión caída sí puede.
 */

export type PollerAlertPayload = PollerFailure & {
  /** Fallos acumulados en este apagón. */
  failures: number;
  silentForMs: number;
  /** Ausente => el buzón no se ha leído correctamente nunca. */
  lastSuccessAt?: number;
};

/** La hora en la zona de quien la va a leer, no en UTC. */
function stamp(at: number): string {
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Mexico_City',
  }).format(new Date(at));
}

function duration(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes} minutos`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ${minutes % 60} min`;

  return `${Math.floor(hours / 24)} d ${hours % 24} h`;
}

/**
 * El asunto dice el estado, no el error: es lo que se ve en la bandeja sin
 * abrir el correo, y lo que decide si alguien lo abre hoy o el jueves.
 */
export function composePollerAlert(payload: PollerAlertPayload): { subject: string; text: string } {
  return {
    subject:
      payload.kind === 'authentication'
        ? 'ZAMX: el buzón de respuestas rechaza las credenciales'
        : 'ZAMX: el buzón de respuestas no responde',
    text: [
      `El sistema lleva ${duration(payload.silentForMs)} sin poder leer el buzón donde`,
      'contestan los Approvers.',
      '',
      `Último sondeo correcto: ${
        payload.lastSuccessAt === undefined ? 'ninguno registrado' : stamp(payload.lastSuccessAt)
      }`,
      `Sondeos fallidos desde entonces: ${payload.failures}`,
      `Error: ${payload.detail}`,
      '',
      ...cause(payload.kind),
      '',
      'Mientras dure, ninguna respuesta de un Approver se aplica: las Replacement',
      'Requests enviadas en esta ventana se quedan sin Outcome y el Customer sigue',
      'esperando. Las respuestas no se pierden —se quedan sin leer en el buzón y se',
      'procesan en el primer sondeo que funcione—, pero nadie las está atendiendo.',
      '',
      'Este mensaje lo genera el sistema ZAMX una sola vez por apagón, y un apagón no',
      'se da por terminado hasta media hora entera sin fallos: si el sondeo parpadea,',
      'no habrá un segundo correo por cada parpadeo.',
    ].join('\n'),
  };
}

function cause(kind: PollerFailure['kind']): string[] {
  if (kind === 'authentication') {
    return [
      'El buzón rechazó las credenciales. Esto no se arregla solo: normalmente pasa',
      'porque se cambió la contraseña de la cuenta de Google, lo que invalida sus',
      'contraseñas de aplicación. Hay que generar una nueva y ponerla en la variable',
      'IMAP_PASSWORD del despliegue de Convex (`npx convex env set IMAP_PASSWORD ...`).',
      'La misma variable en Vercel no hace nada: quien sondea es una acción de Convex.',
    ];
  }

  return [
    'No se pudo conectar con el buzón. Puede recuperarse solo —el cron reintenta cada',
    'cinco minutos—, así que conviene comprobarlo antes de tocar nada: revisar el',
    'estado del proveedor de correo y IMAP_HOST / IMAP_PORT en el despliegue de Convex.',
  ];
}
