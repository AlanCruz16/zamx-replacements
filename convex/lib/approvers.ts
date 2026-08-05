/**
 * De dónde sale la autoridad para mover una Replacement Request: de estar en
 * esta lista, y de nada más. El folio `REQ-` viaja en el asunto de todos los
 * correos que manda el sistema, así que conocerlo no puede bastar.
 *
 * Es el único sitio que lee el entorno para esto; la regla que compara vive en
 * `reply_verdict.ts`, sin entorno, para poder probarse.
 *
 * `ADMIN_EMAIL` es el respaldo a propósito: es la dirección a la que se le manda
 * la solicitud, y quien la recibe es quien contesta. `APPROVER_EMAILS` la
 * sustituye y admite varias separadas por coma.
 *
 * Sin ninguna de las dos configuradas la lista queda vacía y **no autoriza a
 * nadie**: el buzón deja de mover Replacement Requests en vez de quedar abierto
 * a cualquiera que sepa un folio. Los mensajes se quedan sin leer, así que
 * configurar la variable y esperar al siguiente sondeo los recupera.
 */
export function approverAddresses(): string[] {
  const configured = process.env.APPROVER_EMAILS || '';

  if (!configured && process.env.ADMIN_EMAIL) {
    // Se dice en voz alta: quien lee el registro tiene que poder ver que la
    // lista salió del respaldo y no de una decisión de quien despliega.
    console.warn(
      'APPROVER_EMAILS no está configurado: se usa ADMIN_EMAIL como único Approver autorizado.'
    );
    return [process.env.ADMIN_EMAIL.trim()];
  }

  return configured
    .split(',')
    .map((address) => address.trim())
    .filter((address) => address.length > 0);
}
